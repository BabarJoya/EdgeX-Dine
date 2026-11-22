-- =============================================================================
-- Phase 8: integrations (online payments, Raast details, WhatsApp, fiscal).
--
-- * tenant_integrations: per-restaurant provider settings. Non-secret settings
--   are readable by managers; secrets live in private.integration_secrets and
--   are only ever read by the server (service_role), never by a browser.
-- * online_payments: a guest's payment attempt through a gateway. Only the
--   server can complete one, after verifying the gateway's signed callback.
-- * payments may now come from a gateway: no cashier or shift needed.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
create table public.tenant_integrations (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider text not null check (provider in ('jazzcash', 'easypaisa', 'raast', 'whatsapp', 'fbr', 'test_gateway')),
  enabled boolean not null default false,
  mode text not null default 'sandbox' check (mode in ('sandbox', 'live')),
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 4000),
  -- Which secret fields are saved (names only), so the UI can say "saved".
  secret_keys text[] not null default '{}',
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, provider)
);

create table private.integration_secrets (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider text not null,
  secrets jsonb not null default '{}',
  primary key (tenant_id, provider),
  foreign key (tenant_id, provider) references public.tenant_integrations (tenant_id, provider) on delete cascade
);
revoke all on private.integration_secrets from public, anon, authenticated;

alter table public.tenant_integrations enable row level security;
revoke all on public.tenant_integrations from anon, authenticated;
grant select on public.tenant_integrations to authenticated;
create policy tenant_integrations_select on public.tenant_integrations for select to authenticated
  using (private.has_perm(tenant_id, 'settings.manage'));

create or replace function public.save_integration(
  p_tenant_id uuid,
  p_provider text,
  p_enabled boolean,
  p_mode text,
  p_settings jsonb,
  p_secrets jsonb default null -- only the keys given are replaced; '' removes one
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_secrets jsonb;
  v_key text;
begin
  if not private.has_perm(p_tenant_id, 'settings.manage') then
    raise exception 'You do not have permission to change integrations' using errcode = '42501';
  end if;
  if p_provider = 'test_gateway' then
    raise exception 'The test gateway is configured by EdgeX, not per restaurant' using errcode = '22023';
  end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'Settings must be an object' using errcode = '22023';
  end if;
  if p_secrets is not null and jsonb_typeof(p_secrets) <> 'object' then
    raise exception 'Secrets must be an object' using errcode = '22023';
  end if;

  insert into public.tenant_integrations (tenant_id, provider, enabled, mode, settings, updated_by)
  values (p_tenant_id, p_provider, coalesce(p_enabled, false), coalesce(p_mode, 'sandbox'), p_settings, auth.uid())
  on conflict (tenant_id, provider) do update set
    enabled = excluded.enabled, mode = excluded.mode, settings = excluded.settings,
    updated_by = excluded.updated_by, updated_at = now();

  if p_secrets is not null then
    select coalesce(secrets, '{}') into v_secrets from private.integration_secrets
    where tenant_id = p_tenant_id and provider = p_provider;
    v_secrets := coalesce(v_secrets, '{}');
    for v_key in select jsonb_object_keys(p_secrets) loop
      if coalesce(p_secrets ->> v_key, '') = '' then
        v_secrets := v_secrets - v_key;
      else
        v_secrets := v_secrets || jsonb_build_object(v_key, left(p_secrets ->> v_key, 2000));
      end if;
    end loop;
    insert into private.integration_secrets (tenant_id, provider, secrets)
    values (p_tenant_id, p_provider, v_secrets)
    on conflict (tenant_id, provider) do update set secrets = excluded.secrets;
    update public.tenant_integrations
    set secret_keys = array(select jsonb_object_keys(v_secrets) order by 1)
    where tenant_id = p_tenant_id and provider = p_provider;
  end if;

  if p_enabled and p_provider in ('jazzcash', 'easypaisa', 'whatsapp', 'fbr')
     and not exists (select 1 from private.integration_secrets s
                     where s.tenant_id = p_tenant_id and s.provider = p_provider and s.secrets <> '{}') then
    raise exception 'Add the credentials before turning this on' using errcode = '22023';
  end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, data)
  values (p_tenant_id, auth.uid(), 'integration.saved', 'integration', null,
          jsonb_build_object('provider', p_provider, 'enabled', p_enabled, 'mode', p_mode,
                             'secrets_changed', coalesce((select array_agg(k) from jsonb_object_keys(p_secrets) k), '{}')));
end;
$$;

-- ---------------------------------------------------------------------------
-- Payments from a gateway
-- ---------------------------------------------------------------------------
alter table public.payments
  add column provider text check (provider in ('jazzcash', 'easypaisa', 'raast', 'test_gateway')),
  alter column shift_id drop not null,
  alter column received_by drop not null,
  add constraint payments_actor_check check (provider is not null or (shift_id is not null and received_by is not null));

create table public.online_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  bill_id uuid not null,
  provider text not null check (provider in ('jazzcash', 'easypaisa', 'test_gateway')),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'expired')),
  -- Our reference sent to the gateway (short: gateways limit it to ~20 chars).
  txn_ref text not null unique default ('EX' || to_char(now() at time zone 'UTC', 'YYMMDDHH24MISS')
                                        || upper(encode(extensions.gen_random_bytes(3), 'hex'))),
  base_minor bigint not null check (base_minor > 0),
  tax_bps int not null,
  tax_minor bigint not null check (tax_minor >= 0),
  amount_minor bigint not null check (amount_minor > 0),
  provider_ref text check (char_length(provider_ref) <= 80),
  response_code text check (char_length(response_code) <= 20),
  response_message text check (char_length(response_message) <= 300),
  needs_review boolean not null default false,
  payment_id uuid,
  expires_at timestamptz not null default now() + interval '30 minutes',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (bill_id, tenant_id) references public.bills (id, tenant_id) on delete cascade,
  foreign key (branch_id, tenant_id) references public.branches (id, tenant_id) on delete cascade,
  foreign key (payment_id, tenant_id) references public.payments (id, tenant_id) on delete set null (payment_id)
);
create index online_payments_bill_idx on public.online_payments (bill_id, created_at desc);

alter table public.online_payments enable row level security;
revoke all on public.online_payments from anon, authenticated;
grant select on public.online_payments to authenticated;
create policy online_payments_select on public.online_payments for select to authenticated
  using (private.has_branch_perm(tenant_id, branch_id, 'pos.use')
         or private.has_branch_perm(tenant_id, branch_id, 'payments.take')
         or private.has_branch_perm(tenant_id, branch_id, 'reports.view'));

-- Server only: start a gateway payment for the rest of an open bill. Returns
-- what the server needs to build the gateway request (incl. secrets).
create or replace function public.server_start_online_payment(p_receipt_token text, p_provider text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_bill public.bills;
  v_branch public.branches;
  v_int public.tenant_integrations;
  v_remaining bigint;
  v_bps int;
  v_tax bigint;
  v_op public.online_payments;
begin
  select * into v_bill from public.bills where receipt_token = p_receipt_token for update;
  if v_bill.id is null then
    raise exception 'Bill not found' using errcode = 'P0002';
  end if;
  if private.tenant_access(v_bill.tenant_id) <> 'active' then
    raise exception 'This restaurant cannot take online payments right now' using errcode = 'P0001';
  end if;
  v_bill := private.recalc_bill(v_bill.id);
  if v_bill.status <> 'open' then
    raise exception 'This bill is already %', v_bill.status using errcode = 'P0001';
  end if;
  v_remaining := v_bill.base_minor - v_bill.paid_base_minor;
  if v_remaining <= 0 then
    raise exception 'Nothing left to pay on this bill' using errcode = 'P0001';
  end if;

  if p_provider <> 'test_gateway' then
    select * into v_int from public.tenant_integrations
    where tenant_id = v_bill.tenant_id and provider = p_provider and enabled;
    if v_int.tenant_id is null then
      raise exception 'This payment method is not available' using errcode = 'P0001';
    end if;
  end if;

  select * into v_branch from public.branches where id = v_bill.branch_id;
  v_bps := v_branch.tax_wallet_bps; -- wallet / online rate
  v_tax := round(v_remaining * v_bps / 10000.0)::bigint;

  -- One live attempt per bill: older pending attempts are expired.
  update public.online_payments set status = 'expired', completed_at = now()
  where bill_id = v_bill.id and status = 'pending';

  insert into public.online_payments (tenant_id, branch_id, bill_id, provider, base_minor, tax_bps, tax_minor, amount_minor)
  values (v_bill.tenant_id, v_bill.branch_id, v_bill.id, p_provider, v_remaining, v_bps, v_tax, v_remaining + v_tax)
  returning * into v_op;

  return jsonb_build_object(
    'id', v_op.id, 'txn_ref', v_op.txn_ref, 'amount_minor', v_op.amount_minor, 'currency', v_bill.currency,
    'expires_at', v_op.expires_at, 'created_at', v_op.created_at,
    'bill_number', v_bill.bill_number, 'receipt_token', v_bill.receipt_token, 'customer_phone', v_bill.customer_phone,
    'restaurant', (select name from public.tenants where id = v_bill.tenant_id),
    'mode', v_int.mode, 'settings', coalesce(v_int.settings, '{}'),
    'secrets', coalesce((select secrets from private.integration_secrets
                         where tenant_id = v_bill.tenant_id and provider = p_provider), '{}'));
end;
$$;

-- Server only: what is needed to verify a gateway callback for a reference.
create or replace function public.server_online_payment(p_txn_ref text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', op.id, 'txn_ref', op.txn_ref, 'provider', op.provider, 'status', op.status,
    'amount_minor', op.amount_minor, 'receipt_token', b.receipt_token,
    'mode', i.mode, 'settings', coalesce(i.settings, '{}'),
    'secrets', coalesce((select secrets from private.integration_secrets s
                         where s.tenant_id = op.tenant_id and s.provider = op.provider), '{}'))
  from public.online_payments op
  join public.bills b on b.id = op.bill_id
  left join public.tenant_integrations i on i.tenant_id = op.tenant_id and i.provider = op.provider
  where op.txn_ref = p_txn_ref;
$$;

-- Server only, after verifying the gateway's signature. Idempotent: a repeated
-- callback for a finished attempt changes nothing.
create or replace function public.server_finish_online_payment(
  p_txn_ref text,
  p_success boolean,
  p_amount_minor bigint,
  p_provider_ref text default null,
  p_code text default null,
  p_message text default null
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_op public.online_payments;
  v_bill public.bills;
  v_shift uuid;
  v_payment_id uuid;
  v_review boolean := false;
begin
  select * into v_op from public.online_payments where txn_ref = p_txn_ref for update;
  if v_op.id is null then
    raise exception 'Unknown payment reference' using errcode = 'P0002';
  end if;
  select * into v_bill from public.bills where id = v_op.bill_id for update;
  if v_op.status in ('paid', 'failed') then
    return jsonb_build_object('status', v_op.status, 'receipt_token', v_bill.receipt_token, 'repeat', true);
  end if;

  if not p_success then
    update public.online_payments set status = 'failed', completed_at = now(),
      provider_ref = left(p_provider_ref, 80), response_code = left(p_code, 20), response_message = left(p_message, 300)
    where id = v_op.id;
    return jsonb_build_object('status', 'failed', 'receipt_token', v_bill.receipt_token);
  end if;

  if p_amount_minor is distinct from v_op.amount_minor then
    -- Paid a different amount than we asked for: record nothing, flag it.
    update public.online_payments set status = 'failed', needs_review = true, completed_at = now(),
      provider_ref = left(p_provider_ref, 80), response_code = left(p_code, 20),
      response_message = left('Amount mismatch: gateway reported ' || coalesce(p_amount_minor::text, 'none'), 300)
    where id = v_op.id;
    return jsonb_build_object('status', 'failed', 'receipt_token', v_bill.receipt_token, 'needs_review', true);
  end if;

  -- Money was taken: always record it. If the bill was settled at the till in
  -- the meantime (or the attempt had been superseded), flag it for a refund.
  v_bill := private.recalc_bill(v_bill.id);
  if v_bill.status <> 'open' or v_bill.base_minor - v_bill.paid_base_minor < v_op.base_minor or v_op.status = 'expired' then
    v_review := true;
  end if;

  select id into v_shift from public.cash_shifts
  where branch_id = v_op.branch_id and status = 'open' order by opened_at desc limit 1;

  insert into public.payments (tenant_id, branch_id, bill_id, shift_id, method, provider, base_minor, tax_bps, tax_minor,
                               amount_minor, reference, note, received_by)
  values (v_op.tenant_id, v_op.branch_id, v_op.bill_id, v_shift, 'wallet', v_op.provider, v_op.base_minor, v_op.tax_bps,
          v_op.tax_minor, v_op.amount_minor, left(coalesce(p_provider_ref, v_op.txn_ref), 80),
          case when v_review then 'Paid online after the bill was settled — refund the guest' else 'Paid online' end, null)
  returning id into v_payment_id;

  update public.bills set
    paid_base_minor = paid_base_minor + v_op.base_minor,
    tax_minor = tax_minor + v_op.tax_minor,
    paid_total_minor = paid_total_minor + v_op.amount_minor
  where id = v_bill.id and status in ('open', 'paid');
  v_bill := private.recalc_bill(v_bill.id);

  update public.online_payments set status = 'paid', completed_at = now(), payment_id = v_payment_id,
    needs_review = v_review, provider_ref = left(p_provider_ref, 80), response_code = left(p_code, 20),
    response_message = left(p_message, 300)
  where id = v_op.id;

  return jsonb_build_object('status', 'paid', 'receipt_token', v_bill.receipt_token, 'bill_status', v_bill.status,
                            'needs_review', v_review, 'payment_id', v_payment_id);
end;
$$;

revoke all on function public.server_start_online_payment(text, text) from public, anon, authenticated;
revoke all on function public.server_online_payment(text) from public, anon, authenticated;
revoke all on function public.server_finish_online_payment(text, boolean, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.server_start_online_payment(text, text) to service_role;
grant execute on function public.server_online_payment(text) to service_role;
grant execute on function public.server_finish_online_payment(text, boolean, bigint, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Receipt: what is left to pay and how a guest can pay it.
-- ---------------------------------------------------------------------------
create or replace function public.get_receipt_payment_options(p_receipt_token text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'remaining_base_minor', greatest(b.base_minor - b.paid_base_minor, 0),
    'remaining_total_minor', greatest(b.base_minor - b.paid_base_minor, 0)
                             + round(greatest(b.base_minor - b.paid_base_minor, 0) * br.tax_wallet_bps / 10000.0)::bigint,
    'currency', b.currency,
    'status', b.status,
    'providers', coalesce((select jsonb_agg(i.provider order by i.provider) from public.tenant_integrations i
                           where i.tenant_id = b.tenant_id and i.enabled and i.provider in ('jazzcash', 'easypaisa')), '[]'),
    'raast', (select jsonb_build_object('raast_id', i.settings ->> 'raast_id', 'iban', i.settings ->> 'iban',
                                        'title', i.settings ->> 'account_title', 'bank', i.settings ->> 'bank')
              from public.tenant_integrations i
              where i.tenant_id = b.tenant_id and i.provider = 'raast' and i.enabled),
    'last_attempt', (select jsonb_build_object('status', op.status, 'provider', op.provider, 'at', op.completed_at,
                                               'message', op.response_message)
                     from public.online_payments op where op.bill_id = b.id order by op.created_at desc limit 1)
  )
  from public.bills b join public.branches br on br.id = b.branch_id
  where b.receipt_token = p_receipt_token and private.tenant_access(b.tenant_id) = 'active';
$$;
grant execute on function public.get_receipt_payment_options(text) to anon, authenticated;

-- Receipts name the gateway ("Paid · JazzCash").
create or replace function public.get_receipt(p_receipt_token text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'restaurant', t.name, 'branch', br.name, 'address', br.address, 'phone', br.phone,
    'tax_label', br.tax_label, 'tax_registration', br.tax_registration, 'footer', br.receipt_footer,
    'bill_number', b.bill_number, 'date', b.created_at, 'paid_at', b.paid_at, 'type', b.type, 'status', b.status,
    'table', (select tb.label from public.table_sessions s join public.tables tb on tb.id = s.table_id where s.id = b.session_id),
    'currency', b.currency, 'customer_name', b.customer_name,
    'subtotal_minor', b.subtotal_minor, 'discount_minor', b.discount_minor, 'discount_note', b.discount_note,
    'service_bps', b.service_bps, 'service_minor', b.service_minor, 'base_minor', b.base_minor,
    'tax_minor', b.tax_minor, 'paid_total_minor', b.paid_total_minor,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('name', i.name, 'variant', i.variant_name, 'quantity', i.quantity,
                                          'line_total_minor', i.line_total_minor,
                                          'modifiers', (select coalesce(jsonb_agg(m.name), '[]') from public.order_item_modifiers m where m.order_item_id = i.id))
                       order by o.created_at, i.created_at)
      from public.orders o join public.order_items i on i.order_id = o.id
      where o.bill_id = b.id and o.status <> 'cancelled' and i.status <> 'cancelled'), '[]'),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('method', p.method, 'provider', p.provider, 'amount_minor', p.amount_minor, 'tax_minor', p.tax_minor,
                                          'tax_bps', p.tax_bps, 'tendered_minor', p.tendered_minor, 'change_minor', p.change_minor,
                                          'status', p.status) order by p.created_at)
      from public.payments p where p.bill_id = b.id), '[]')
  )
  from public.bills b
  join public.tenants t on t.id = b.tenant_id
  join public.branches br on br.id = b.branch_id
  where b.receipt_token = p_receipt_token;
$$;
