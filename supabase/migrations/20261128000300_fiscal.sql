-- =============================================================================
-- Phase 8: tax-authority invoices (FBR / PRA "IMS" POS integration).
--
-- When a bill is paid and the restaurant has the integration on, the bill is
-- queued (message_outbox kind 'fiscal'); the server posts it to the authority
-- and stores the fiscal invoice number on the bill, which the receipt prints
-- with a QR code. Settings live in tenant_integrations (provider 'fbr', with
-- settings.authority = 'fbr' | 'pra').
-- =============================================================================

alter table public.bills
  add column fiscal_status text check (fiscal_status in ('pending', 'done', 'failed')),
  add column fiscal_authority text check (fiscal_authority in ('fbr', 'pra')),
  add column fiscal_invoice_number text check (char_length(fiscal_invoice_number) <= 80),
  add column fiscal_error text check (char_length(fiscal_error) <= 500);

alter table public.message_outbox drop constraint message_outbox_channel_check;
alter table public.message_outbox add constraint message_outbox_channel_check check (channel in ('whatsapp', 'fiscal'));
alter table public.message_outbox drop constraint message_outbox_kind_check;
alter table public.message_outbox add constraint message_outbox_kind_check check (kind in ('receipt', 'order_ready', 'fiscal'));
alter table public.message_outbox alter column to_phone drop not null;
alter table public.message_outbox drop constraint message_outbox_to_phone_check;
alter table public.message_outbox add constraint message_outbox_to_phone_check
  check (case when channel = 'whatsapp' then char_length(to_phone) between 8 and 20 else to_phone is null end);

create or replace function private.queue_fiscal_invoice()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_authority text;
begin
  if new.status = 'paid' and old.status is distinct from 'paid' and new.fiscal_status is null then
    select coalesce(nullif(settings ->> 'authority', ''), 'fbr') into v_authority
    from public.tenant_integrations
    where tenant_id = new.tenant_id and provider = 'fbr' and enabled;
    if v_authority is not null then
      insert into public.message_outbox (tenant_id, branch_id, channel, kind, ref_id, to_phone)
      values (new.tenant_id, new.branch_id, 'fiscal', 'fiscal', new.id, null)
      on conflict (kind, ref_id) do nothing;
      update public.bills set fiscal_status = 'pending', fiscal_authority = v_authority where id = new.id;
    end if;
  end if;
  return null;
end;
$$;
create trigger bills_queue_fiscal after update of status on public.bills
  for each row execute function private.queue_fiscal_invoice();

-- What the server needs to build the authority's invoice for one bill.
create or replace function private.fiscal_payload(p_bill_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'bill_id', b.id, 'bill_number', b.bill_number, 'business_date', b.business_date,
    'paid_at', to_char(coalesce(b.paid_at, now()) at time zone t.timezone, 'YYYY-MM-DD HH24:MI:SS'),
    'branch_code', upper(left(regexp_replace(br.name, '[^A-Za-z0-9]', '', 'g'), 6)),
    'subtotal_minor', b.subtotal_minor, 'discount_minor', b.discount_minor, 'service_minor', b.service_minor,
    'base_minor', b.base_minor, 'tax_minor', b.tax_minor, 'paid_total_minor', b.paid_total_minor,
    'customer_name', b.customer_name, 'customer_phone', b.customer_phone,
    'methods', (select coalesce(jsonb_agg(distinct p.method), '[]') from public.payments p
                where p.bill_id = b.id and p.status = 'completed'),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('code', left(i.product_id::text, 8), 'name', i.name || coalesce(' (' || i.variant_name || ')', ''),
                                          'quantity', i.quantity, 'total_minor', i.line_total_minor)
                       order by i.created_at)
      from public.orders o join public.order_items i on i.order_id = o.id
      where o.bill_id = b.id and o.status <> 'cancelled' and i.status <> 'cancelled'), '[]'))
  from public.bills b
  join public.branches br on br.id = b.branch_id
  join public.tenants t on t.id = b.tenant_id
  where b.id = p_bill_id;
$$;

-- Claim now covers both channels; fiscal rows carry the invoice payload and
-- the tax-authority credentials.
create or replace function public.server_claim_messages(p_limit int default 20)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  with picked as (
    select id from public.message_outbox
    where (status = 'pending' or (status = 'sending' and sent_at is null and created_at < now() - interval '2 minutes'))
      and attempts < 5
    order by created_at
    limit least(greatest(p_limit, 1), 100)
    for update skip locked
  ), claimed as (
    update public.message_outbox m set status = 'sending', attempts = attempts + 1
    from picked where m.id = picked.id
    returning m.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'channel', c.channel, 'kind', c.kind, 'to', c.to_phone,
    'params', case when c.kind = 'fiscal' then private.fiscal_payload(c.ref_id) else c.params end,
    'mode', coalesce(i.mode, 'sandbox'),
    'settings', coalesce(i.settings, '{}'),
    'secrets', coalesce((select secrets from private.integration_secrets s where s.tenant_id = c.tenant_id and s.provider = i.provider), '{}'),
    'enabled', coalesce(i.enabled, false))), '[]')
  into v_rows
  from claimed c
  left join public.tenant_integrations i
    on i.tenant_id = c.tenant_id and i.provider = case when c.channel = 'fiscal' then 'fbr' else 'whatsapp' end;
  return v_rows;
end;
$$;

-- Fiscal outcome: also stamps the bill.
create or replace function public.server_message_result(
  p_id uuid, p_ok boolean, p_provider_id text default null, p_error text default null, p_final boolean default false)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v public.message_outbox;
begin
  update public.message_outbox set
    status = case when p_ok then 'sent' when p_final or attempts >= 5 then 'failed' else 'pending' end,
    provider_message_id = left(p_provider_id, 200),
    error = left(p_error, 500),
    sent_at = case when p_ok then now() else null end
  where id = p_id
  returning * into v;
  if v.kind = 'fiscal' then
    update public.bills set
      fiscal_status = case when p_ok then 'done' when v.status = 'failed' then 'failed' else 'pending' end,
      fiscal_invoice_number = case when p_ok then left(p_provider_id, 80) else fiscal_invoice_number end,
      fiscal_error = case when p_ok then null else left(p_error, 500) end
    where id = v.ref_id;
  end if;
end;
$$;
revoke all on function public.server_claim_messages(int) from public, anon, authenticated;
revoke all on function public.server_message_result(uuid, boolean, text, text, boolean) from public, anon, authenticated;
grant execute on function public.server_claim_messages(int) to service_role;
grant execute on function public.server_message_result(uuid, boolean, text, text, boolean) to service_role;

-- Owners can send a failed invoice again from the bill.
create or replace function public.retry_fiscal_invoice(p_bill_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_bill public.bills;
begin
  select * into v_bill from public.bills where id = p_bill_id;
  if v_bill.id is null or not (private.has_branch_perm(v_bill.tenant_id, v_bill.branch_id, 'payments.take')
                               or private.has_perm(v_bill.tenant_id, 'settings.manage')) then
    raise exception 'Bill not found' using errcode = 'P0002';
  end if;
  if v_bill.fiscal_status is distinct from 'failed' then
    raise exception 'Only failed invoices can be sent again' using errcode = 'P0001';
  end if;
  update public.message_outbox set status = 'pending', attempts = 0, error = null
  where kind = 'fiscal' and ref_id = p_bill_id;
  update public.bills set fiscal_status = 'pending', fiscal_error = null where id = p_bill_id;
end;
$$;

-- Receipts print the fiscal invoice number.
create or replace function public.get_receipt(p_receipt_token text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'restaurant', t.name, 'branch', br.name, 'address', br.address, 'phone', br.phone,
    'tax_label', br.tax_label, 'tax_registration', br.tax_registration, 'footer', br.receipt_footer,
    'bill_number', b.bill_number, 'fiscal_authority', b.fiscal_authority, 'fiscal_invoice_number', b.fiscal_invoice_number,
    'fiscal_status', b.fiscal_status, 'date', b.created_at, 'paid_at', b.paid_at, 'type', b.type, 'status', b.status,
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
