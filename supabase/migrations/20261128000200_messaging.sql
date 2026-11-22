-- =============================================================================
-- Phase 8: WhatsApp messages through an outbox.
--
-- Messages are queued by the database in the same transaction as the event
-- (bill paid, takeaway/delivery order ready), at most once per event, and only
-- when the restaurant has WhatsApp turned on and the guest left a number.
-- The server (api/notify) claims and sends them with the Cloud API.
-- =============================================================================

create table public.message_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  branch_id uuid,
  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  kind text not null check (kind in ('receipt', 'order_ready')),
  ref_id uuid not null,
  to_phone text not null check (char_length(to_phone) between 8 and 20),
  params jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts int not null default 0,
  provider_message_id text,
  error text check (char_length(error) <= 500),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (kind, ref_id)
);
create index message_outbox_pending_idx on public.message_outbox (created_at) where status in ('pending', 'sending');

alter table public.message_outbox enable row level security;
revoke all on public.message_outbox from anon, authenticated;
grant select on public.message_outbox to authenticated;
create policy message_outbox_select on public.message_outbox for select to authenticated
  using (private.has_perm(tenant_id, 'settings.manage'));

-- Pakistani number → international digits (0300… → 92300…); null if unusable.
create or replace function private.wa_number(p_phone text)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when d is null or length(d) < 10 then null
    when d like '00%' then substr(d, 3)
    when d like '0%' then '92' || substr(d, 2)
    when length(d) = 10 and d like '3%' then '92' || d
    else d end
  from (select nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '') as d) x;
$$;

create or replace function private.whatsapp_on(p_tenant_id uuid, p_setting text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_integrations
    where tenant_id = p_tenant_id and provider = 'whatsapp' and enabled
      and coalesce(settings ->> p_setting, 'true') <> 'false');
$$;

create or replace function private.queue_receipt_message()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_to text := private.wa_number(new.customer_phone);
begin
  if new.status = 'paid' and old.status is distinct from 'paid' and v_to is not null
     and private.whatsapp_on(new.tenant_id, 'send_receipts') then
    insert into public.message_outbox (tenant_id, branch_id, kind, ref_id, to_phone, params)
    values (new.tenant_id, new.branch_id, 'receipt', new.id, v_to, jsonb_build_object(
      'restaurant', (select name from public.tenants where id = new.tenant_id),
      'bill_number', new.bill_number, 'total_minor', new.paid_total_minor, 'currency', new.currency,
      'receipt_token', new.receipt_token))
    on conflict (kind, ref_id) do nothing;
  end if;
  return null;
end;
$$;
create trigger bills_queue_receipt after update of status on public.bills
  for each row execute function private.queue_receipt_message();

create or replace function private.queue_ready_message()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_to text;
begin
  if new.status = 'ready' and old.status is distinct from 'ready' and new.type in ('takeaway', 'delivery')
     and new.bill_id is not null and private.whatsapp_on(new.tenant_id, 'send_ready') then
    select private.wa_number(customer_phone) into v_to from public.bills where id = new.bill_id;
    if v_to is not null then
      insert into public.message_outbox (tenant_id, branch_id, kind, ref_id, to_phone, params)
      values (new.tenant_id, new.branch_id, 'order_ready', new.id, v_to, jsonb_build_object(
        'restaurant', (select name from public.tenants where id = new.tenant_id),
        'order_number', new.order_number, 'type', new.type))
      on conflict (kind, ref_id) do nothing;
    end if;
  end if;
  return null;
end;
$$;
create trigger orders_queue_ready after update of status on public.orders
  for each row execute function private.queue_ready_message();

-- Server only: claim a batch to send (stale 'sending' rows are retried; give
-- up after 5 attempts). Returns credentials for each restaurant involved.
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
    'id', c.id, 'kind', c.kind, 'to', c.to_phone, 'params', c.params,
    'settings', coalesce(i.settings, '{}'),
    'secrets', coalesce((select secrets from private.integration_secrets s where s.tenant_id = c.tenant_id and s.provider = 'whatsapp'), '{}'),
    'enabled', coalesce(i.enabled, false))), '[]')
  into v_rows
  from claimed c
  left join public.tenant_integrations i on i.tenant_id = c.tenant_id and i.provider = 'whatsapp';
  return v_rows;
end;
$$;

create or replace function public.server_message_result(
  p_id uuid, p_ok boolean, p_provider_id text default null, p_error text default null, p_final boolean default false)
returns void
language sql security definer
set search_path = ''
as $$
  update public.message_outbox set
    status = case when p_ok then 'sent' when p_final or attempts >= 5 then 'failed' else 'pending' end,
    provider_message_id = left(p_provider_id, 200),
    error = left(p_error, 500),
    sent_at = case when p_ok then now() else null end
  where id = p_id;
$$;

revoke all on function public.server_claim_messages(int) from public, anon, authenticated;
revoke all on function public.server_message_result(uuid, boolean, text, text, boolean) from public, anon, authenticated;
grant execute on function public.server_claim_messages(int) to service_role;
grant execute on function public.server_message_result(uuid, boolean, text, text, boolean) to service_role;
