-- =============================================================================
-- Phase 11: public API and webhooks (Enterprise plan, feature 'api').
--
-- * API keys: shown once, stored as SHA-256 only, revocable, rate limited
--   (120 requests / minute / key). Used by the server functions in api/v1.
-- * Webhooks: HTTPS endpoints subscribed to events; deliveries go through
--   message_outbox (retries, log) and are signed with a per-endpoint secret
--   kept in the private schema.
-- =============================================================================

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  prefix text not null,
  key_hash text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index api_keys_tenant_idx on public.api_keys (tenant_id);
alter table public.api_keys enable row level security;
revoke all on public.api_keys from anon, authenticated;
-- The hash is never readable by clients.
grant select (id, tenant_id, name, prefix, created_by, last_used_at, revoked_at, created_at) on public.api_keys to authenticated;
create policy api_keys_select on public.api_keys for select to authenticated
  using (tenant_id = any ((select private.tenant_ids_with('settings.manage'))::uuid[]));

create table private.api_usage (
  key_id uuid not null references public.api_keys (id) on delete cascade,
  minute timestamptz not null,
  requests int not null default 0,
  primary key (key_id, minute)
);

create table public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  url text not null check (url ~ '^https://[^\s]+$' and char_length(url) <= 500),
  events text[] not null check (events <@ array['order.created', 'order.status_changed', 'bill.paid', 'reservation.created', 'ping']
                                and cardinality(events) > 0),
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index webhook_endpoints_tenant_idx on public.webhook_endpoints (tenant_id);
alter table public.webhook_endpoints enable row level security;
revoke all on public.webhook_endpoints from anon, authenticated;
grant select on public.webhook_endpoints to authenticated;
create policy webhook_endpoints_select on public.webhook_endpoints for select to authenticated
  using (tenant_id = any ((select private.tenant_ids_with('settings.manage'))::uuid[]));

create table private.webhook_secrets (
  endpoint_id uuid primary key references public.webhook_endpoints (id) on delete cascade,
  secret text not null
);

alter table public.message_outbox drop constraint message_outbox_channel_check;
alter table public.message_outbox add constraint message_outbox_channel_check check (channel in ('whatsapp', 'fiscal', 'webhook'));
alter table public.message_outbox drop constraint message_outbox_kind_check;
alter table public.message_outbox add constraint message_outbox_kind_check
  check (kind in ('receipt', 'order_ready', 'fiscal', 'reservation', 'webhook'));

-- ---------------------------------------------------------------------------
-- Managing keys and endpoints (owners / settings.manage, Enterprise)
-- ---------------------------------------------------------------------------
create or replace function private.require_api(p_tenant_id uuid)
returns void
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not private.has_perm(p_tenant_id, 'settings.manage') then
    raise exception 'You do not have permission to manage the API' using errcode = '42501';
  end if;
  if not private.has_feature(p_tenant_id, 'api') then
    raise exception 'The API is part of the Enterprise plan.' using errcode = 'P0001';
  end if;
end;
$$;

-- Returns the key ONCE; only its hash is stored.
create or replace function public.create_api_key(p_tenant_id uuid, p_name text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_key text := 'edgx_' || translate(encode(extensions.gen_random_bytes(30), 'base64'), '+/=', '-_');
  v_id uuid;
begin
  perform private.require_api(p_tenant_id);
  if (select count(*) from public.api_keys where tenant_id = p_tenant_id and revoked_at is null) >= 10 then
    raise exception 'Up to 10 active keys. Revoke one first.' using errcode = 'P0001';
  end if;
  insert into public.api_keys (tenant_id, name, prefix, key_hash, created_by)
  values (p_tenant_id, trim(p_name), left(v_key, 12), encode(extensions.digest(v_key, 'sha256'), 'hex'), auth.uid())
  returning id into v_id;
  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, data)
  values (p_tenant_id, auth.uid(), 'api_key.created', 'api_keys', v_id::text, jsonb_build_object('name', trim(p_name)));
  return jsonb_build_object('id', v_id, 'key', v_key);
end;
$$;

create or replace function public.revoke_api_key(p_key_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tenant uuid := (select tenant_id from public.api_keys where id = p_key_id);
begin
  if v_tenant is null or not private.has_perm(v_tenant, 'settings.manage') then
    raise exception 'Key not found' using errcode = 'P0002';
  end if;
  update public.api_keys set revoked_at = coalesce(revoked_at, now()) where id = p_key_id;
  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, data)
  values (v_tenant, auth.uid(), 'api_key.revoked', 'api_keys', p_key_id::text, '{}');
end;
$$;

-- Returns the signing secret ONCE.
create or replace function public.create_webhook(p_tenant_id uuid, p_url text, p_events text[])
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_secret text := 'whsec_' || encode(extensions.gen_random_bytes(24), 'hex');
  v_id uuid;
  v_constraint text;
begin
  perform private.require_api(p_tenant_id);
  if (select count(*) from public.webhook_endpoints where tenant_id = p_tenant_id) >= 10 then
    raise exception 'Up to 10 webhook endpoints' using errcode = 'P0001';
  end if;
  begin
    insert into public.webhook_endpoints (tenant_id, url, events, created_by)
    values (p_tenant_id, trim(p_url), p_events, auth.uid())
    returning id into v_id;
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'webhook_endpoints_public_host_check' then
      raise exception 'Use a public address (not localhost or a private network)' using errcode = '22023';
    end if;
    raise exception 'Use an https:// URL and at least one event' using errcode = '22023';
  end;
  insert into private.webhook_secrets (endpoint_id, secret) values (v_id, v_secret);
  return jsonb_build_object('id', v_id, 'secret', v_secret);
end;
$$;

create or replace function public.set_webhook_active(p_endpoint_id uuid, p_active boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tenant uuid := (select tenant_id from public.webhook_endpoints where id = p_endpoint_id);
begin
  if v_tenant is null or not private.has_perm(v_tenant, 'settings.manage') then
    raise exception 'Webhook not found' using errcode = 'P0002';
  end if;
  update public.webhook_endpoints set is_active = p_active where id = p_endpoint_id;
end;
$$;

create or replace function public.delete_webhook(p_endpoint_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tenant uuid := (select tenant_id from public.webhook_endpoints where id = p_endpoint_id);
begin
  if v_tenant is null or not private.has_perm(v_tenant, 'settings.manage') then
    raise exception 'Webhook not found' using errcode = 'P0002';
  end if;
  delete from public.webhook_endpoints where id = p_endpoint_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Events → outbox (one delivery per endpoint)
-- ---------------------------------------------------------------------------
create or replace function private.emit_event(p_tenant_id uuid, p_event text, p_data jsonb)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.has_feature(p_tenant_id, 'api') then
    return;
  end if;
  insert into public.message_outbox (tenant_id, channel, kind, ref_id, to_phone, params)
  select p_tenant_id, 'webhook', 'webhook', gen_random_uuid(), null,
         jsonb_build_object('endpoint_id', e.id, 'event', p_event, 'created_at', now(), 'data', p_data)
  from public.webhook_endpoints e
  where e.tenant_id = p_tenant_id and e.is_active and p_event = any (e.events);
end;
$$;

create or replace function private.order_payload(p_order_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('id', o.id, 'branch_id', o.branch_id, 'number', o.order_number, 'business_date', o.business_date,
    'type', o.type, 'source', o.source, 'status', o.status, 'total_minor', o.total_minor, 'currency', o.currency,
    'created_at', o.created_at, 'table', (select label from public.tables where id = o.table_id),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'variant', i.variant_name, 'quantity', i.quantity,
                                                           'line_total_minor', i.line_total_minor, 'status', i.status)
                                        order by i.created_at), '[]')
              from public.order_items i where i.order_id = o.id))
  from public.orders o where o.id = p_order_id;
$$;

create or replace function private.webhook_on_order()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.emit_event(new.tenant_id, 'order.created', jsonb_build_object('order_id', new.id));
  elsif new.status is distinct from old.status then
    perform private.emit_event(new.tenant_id, 'order.status_changed',
      jsonb_build_object('order_id', new.id, 'from', old.status, 'to', new.status));
  end if;
  return null;
end;
$$;
create trigger orders_webhook after insert or update of status on public.orders
  for each row execute function private.webhook_on_order();

create or replace function private.webhook_on_bill()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    perform private.emit_event(new.tenant_id, 'bill.paid', jsonb_build_object(
      'bill_id', new.id, 'branch_id', new.branch_id, 'number', new.bill_number, 'business_date', new.business_date,
      'type', new.type, 'net_minor', new.base_minor, 'tax_minor', new.tax_minor, 'total_minor', new.paid_total_minor,
      'currency', new.currency, 'paid_at', new.paid_at));
  end if;
  return null;
end;
$$;
create trigger bills_webhook after update of status on public.bills
  for each row execute function private.webhook_on_bill();

create or replace function private.webhook_on_reservation()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform private.emit_event(new.tenant_id, 'reservation.created', jsonb_build_object(
    'reservation_id', new.id, 'branch_id', new.branch_id, 'name', new.name, 'party_size', new.party_size,
    'starts_at', new.starts_at, 'status', new.status, 'source', new.source));
  return null;
end;
$$;
create trigger reservations_webhook after insert on public.reservations
  for each row execute function private.webhook_on_reservation();

create or replace function public.send_test_webhook(p_endpoint_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  e public.webhook_endpoints;
begin
  select * into e from public.webhook_endpoints where id = p_endpoint_id;
  if e.id is null then
    raise exception 'Webhook not found' using errcode = 'P0002';
  end if;
  perform private.require_api(e.tenant_id);
  insert into public.message_outbox (tenant_id, channel, kind, ref_id, to_phone, params)
  values (e.tenant_id, 'webhook', 'webhook', gen_random_uuid(), null,
          jsonb_build_object('endpoint_id', e.id, 'event', 'ping', 'created_at', now(), 'data', jsonb_build_object('message', 'Hello from EdgeX')));
end;
$$;

-- Recent deliveries for the settings screen.
create or replace function public.webhook_deliveries(p_tenant_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'endpoint_id', m.params ->> 'endpoint_id', 'event', m.params ->> 'event',
           'status', m.status, 'attempts', m.attempts, 'error', m.error, 'response', m.provider_message_id,
           'created_at', m.created_at, 'sent_at', m.sent_at) order by m.created_at desc), '[]')
  from (select * from public.message_outbox where tenant_id = p_tenant_id and channel = 'webhook'
        order by created_at desc limit 50) m
  where private.has_perm(p_tenant_id, 'settings.manage');
$$;

revoke execute on function public.create_api_key(uuid, text), public.revoke_api_key(uuid),
  public.create_webhook(uuid, text, text[]), public.set_webhook_active(uuid, boolean), public.delete_webhook(uuid),
  public.send_test_webhook(uuid), public.webhook_deliveries(uuid) from public, anon;
grant execute on function public.create_api_key(uuid, text), public.revoke_api_key(uuid),
  public.create_webhook(uuid, text, text[]), public.set_webhook_active(uuid, boolean), public.delete_webhook(uuid),
  public.send_test_webhook(uuid), public.webhook_deliveries(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Server side (service role): authenticate a key, read data, deliver hooks
-- ---------------------------------------------------------------------------
create or replace function public.server_api_auth(p_key_hash text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  k public.api_keys;
  v_minute timestamptz := date_trunc('minute', now());
  v_n int;
begin
  select * into k from public.api_keys where key_hash = p_key_hash and revoked_at is null;
  if k.id is null then
    return jsonb_build_object('ok', false, 'status', 401, 'error', 'Invalid or revoked API key');
  end if;
  if private.tenant_access(k.tenant_id) <> 'active' or not private.has_feature(k.tenant_id, 'api') then
    return jsonb_build_object('ok', false, 'status', 403, 'error', 'The API is not available on this account');
  end if;
  insert into private.api_usage (key_id, minute, requests) values (k.id, v_minute, 1)
  on conflict (key_id, minute) do update set requests = private.api_usage.requests + 1
  returning requests into v_n;
  if v_n > 120 then
    return jsonb_build_object('ok', false, 'status', 429, 'error', 'Rate limit: 120 requests per minute');
  end if;
  update public.api_keys set last_used_at = now() where id = k.id and (last_used_at is null or last_used_at < now() - interval '1 minute');
  delete from private.api_usage where minute < now() - interval '1 hour' and key_id = k.id;
  return jsonb_build_object('ok', true, 'tenant_id', k.tenant_id, 'key_id', k.id, 'remaining', 120 - v_n);
end;
$$;

create or replace function public.server_api_orders(p_tenant_id uuid, p_from date, p_to date, p_branch_id uuid,
                                                    p_status text, p_limit int, p_after timestamptz)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.order_payload(o.id) order by o.created_at desc), '[]')
  from (select id, created_at from public.orders
        where tenant_id = p_tenant_id and business_date between p_from and p_to
          and (p_branch_id is null or branch_id = p_branch_id)
          and (p_status is null or status::text = p_status)
          and (p_after is null or created_at < p_after)
        order by created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) o;
$$;

create or replace function public.server_api_order(p_tenant_id uuid, p_order_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select private.order_payload(id) from public.orders where id = p_order_id and tenant_id = p_tenant_id;
$$;

create or replace function public.server_api_branches(p_tenant_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'address', address, 'phone', phone,
                                               'is_active', is_active) order by name), '[]')
  from public.branches where tenant_id = p_tenant_id;
$$;

create or replace function public.server_api_menu(p_tenant_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select public.get_guest_menu(slug) - 'table' - 'can_order' - 'branch' from public.tenants where id = p_tenant_id;
$$;

create or replace function public.server_api_sales(p_tenant_id uuid, p_from date, p_to date, p_branch_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('date', d::date,
           'net_minor', coalesce(x.net, 0), 'tax_minor', coalesce(x.tax, 0), 'total_minor', coalesce(x.total, 0),
           'bills', coalesce(x.bills, 0)) order by d), '[]')
  from generate_series(p_from, p_to, interval '1 day') d
  left join (
    select b.business_date, sum(p.base_minor) as net, sum(p.tax_minor) as tax, sum(p.amount_minor) as total,
           count(distinct b.id) as bills
    from public.bills b join public.payments p on p.bill_id = b.id and p.status = 'completed'
    where b.tenant_id = p_tenant_id and b.business_date between p_from and p_to
      and (p_branch_id is null or b.branch_id = p_branch_id)
    group by b.business_date) x on x.business_date = d::date;
$$;

-- Webhook delivery details (URL + secret) for the sender.
create or replace function public.server_webhook_target(p_endpoint_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('url', e.url, 'active', e.is_active, 'secret', s.secret)
  from public.webhook_endpoints e join private.webhook_secrets s on s.endpoint_id = e.id
  where e.id = p_endpoint_id;
$$;

revoke all on function public.server_api_auth(text), public.server_api_orders(uuid, date, date, uuid, text, int, timestamptz),
  public.server_api_order(uuid, uuid), public.server_api_branches(uuid), public.server_api_menu(uuid),
  public.server_api_sales(uuid, date, date, uuid), public.server_webhook_target(uuid) from public, anon, authenticated;
grant execute on function public.server_api_auth(text), public.server_api_orders(uuid, date, date, uuid, text, int, timestamptz),
  public.server_api_order(uuid, uuid), public.server_api_branches(uuid), public.server_api_menu(uuid),
  public.server_api_sales(uuid, date, date, uuid), public.server_webhook_target(uuid) to service_role;

-- The sender only gets integration settings for WhatsApp and tax rows
-- (webhook rows carry their own target).
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
    on i.tenant_id = c.tenant_id
    and i.provider = case c.channel when 'fiscal' then 'fbr' when 'whatsapp' then 'whatsapp' end;
  return v_rows;
end;
$$;

-- Deliver-time payload: order events carry the order as it is when sent
-- (its items are saved after the order row that fired the event).
drop function public.server_webhook_target(uuid);
create or replace function public.server_webhook_target(p_endpoint_id uuid, p_order_id uuid default null)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('url', e.url, 'active', e.is_active, 'secret', s.secret,
                            'order', case when p_order_id is not null then
                                       (select private.order_payload(o.id) from public.orders o
                                        where o.id = p_order_id and o.tenant_id = e.tenant_id) end)
  from public.webhook_endpoints e join private.webhook_secrets s on s.endpoint_id = e.id
  where e.id = p_endpoint_id;
$$;
revoke all on function public.server_webhook_target(uuid, uuid) from public, anon, authenticated;
grant execute on function public.server_webhook_target(uuid, uuid) to service_role;

-- No webhooks into private networks (the server makes these requests).
alter table public.webhook_endpoints add constraint webhook_endpoints_public_host_check check (
  url !~* '^https://(localhost|[^/]*\.local(host)?|127\.|10\.|0\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|169\.254\.|\[)');
