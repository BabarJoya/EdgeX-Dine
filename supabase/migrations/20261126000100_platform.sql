-- =============================================================================
-- Phase 6 · Platform (Super Admin): approval, suspension, subscription
-- enforcement, plan features, manual billing records, support tickets.
-- =============================================================================

-- New restaurants can wait for approval (platform setting).
alter type public.tenant_status add value if not exists 'pending' before 'active';

create table public.platform_settings (
  id boolean primary key default true check (id),
  require_approval boolean not null default false,
  grace_days int not null default 3 check (grace_days between 0 and 30),
  support_email text,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (true);

-- ---------------------------------------------------------------------------
-- Subscription state
-- 'active'    → normal
-- 'read_only' → expired / cancelled past the grace period: can view, renew
--               and contact support, but not operate (no orders, payments,
--               menu edits...). Guests cannot order.
-- 'blocked'   → suspended or awaiting approval.
-- ---------------------------------------------------------------------------
create or replace function private.tenant_access(p_tenant_id uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select case
    when t.status::text <> 'active' then 'blocked'
    when s.id is null then 'active'
    when s.status in ('canceled', 'expired') then 'read_only'
    -- A trial ends on its trial date; a paid plan at the end of the paid period.
    when (case when s.status = 'trialing' then s.trial_ends_at else s.current_period_end end) is not null
         and (case when s.status = 'trialing' then s.trial_ends_at else s.current_period_end end)
             + make_interval(days => (select grace_days from public.platform_settings)) < now() then 'read_only'
    else 'active'
  end
  from public.tenants t
  left join public.subscriptions s on s.tenant_id = t.id
  where t.id = p_tenant_id;
$$;

-- Permissions that stay available in read-only mode.
create or replace function private.read_only_allowed(p_perm text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select p_perm like '%.view' or p_perm in ('billing.manage', 'reports.export', 'audit.view');
$$;

create or replace function private.has_feature(p_tenant_id uuid, p_feature text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select p_feature = any (sp.features)
    from public.subscriptions s join public.subscription_plans sp on sp.id = s.plan_id
    where s.tenant_id = p_tenant_id), true);
$$;

-- Core permission check, now aware of subscription state.
create or replace function private.has_perm(p_tenant_id uuid, p_perm text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_members m
    join public.roles r on r.id = m.role_id
    where m.tenant_id = p_tenant_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (r.is_owner or exists (
            select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_key = p_perm))
  )
  and case private.tenant_access(p_tenant_id)
        when 'active' then true
        when 'read_only' then private.read_only_allowed(p_perm)
        else false
      end;
$$;

create or replace function private.user_has_branch_perm(p_user uuid, p_tenant_id uuid, p_branch_id uuid, p_perm text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_members m
    join public.roles r on r.id = m.role_id
    where m.tenant_id = p_tenant_id and m.user_id = p_user and m.status = 'active'
      and (r.is_owner or exists (select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_key = p_perm))
      and (m.all_branches or exists (select 1 from public.member_branches mb where mb.member_id = m.id and mb.branch_id = p_branch_id))
  )
  and case private.tenant_access(p_tenant_id)
        when 'active' then true
        when 'read_only' then private.read_only_allowed(p_perm)
        else false
      end;
$$;

create or replace function public.my_permissions(p_tenant_id uuid)
returns text[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (
      select array_agg(k order by k) from (
        select p.key as k from public.permissions p
        where private.has_perm(p_tenant_id, p.key)
      ) x
    ),
    '{}'::text[]
  );
$$;

-- What the app shows about the restaurant's account.
create or replace function public.my_tenant_access(p_tenant_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select case when private.is_member(p_tenant_id) or private.is_platform_admin() then
    jsonb_build_object(
      'access', private.tenant_access(p_tenant_id),
      'tenant_status', (select status from public.tenants where id = p_tenant_id),
      'features', (select sp.features from public.subscriptions s join public.subscription_plans sp on sp.id = s.plan_id where s.tenant_id = p_tenant_id),
      'ends_at', (select case when status = 'trialing' then trial_ends_at else current_period_end end from public.subscriptions where tenant_id = p_tenant_id),
      'grace_days', (select grace_days from public.platform_settings)
    )
  end;
$$;

-- Guests can only order from restaurants that are operating.
create or replace function private.guest_table(p_table_token text)
returns public.tables
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_table public.tables;
begin
  select tb.* into v_table
  from public.tables tb
  join public.branches b on b.id = tb.branch_id and b.is_active
  join public.tenants t on t.id = tb.tenant_id and t.status = 'active'
  where tb.qr_token = p_table_token and tb.is_active;
  if v_table.id is null then
    raise exception 'This QR code is not valid. Please ask your waiter.' using errcode = 'P0002', hint = 'bad_table';
  end if;
  return v_table;
end;
$$;

create or replace function private.assert_operating(p_tenant_id uuid)
returns void
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if private.tenant_access(p_tenant_id) <> 'active' then
    raise exception 'Ordering is unavailable right now. Please ask your waiter.' using errcode = 'P0001', hint = 'not_operating';
  end if;
end;
$$;

-- Wrap the single ordering entry point.
alter function private.create_order(uuid, uuid, uuid, uuid, public.order_source, public.order_type, jsonb, text, uuid)
  rename to create_order_core;
create or replace function private.create_order(
  p_tenant_id uuid, p_branch_id uuid, p_table_id uuid, p_session_id uuid,
  p_source public.order_source, p_type public.order_type, p_items jsonb, p_notes text, p_created_by uuid
)
returns public.orders
language plpgsql security definer
set search_path = ''
as $$
begin
  perform private.assert_operating(p_tenant_id);
  return private.create_order_core(p_tenant_id, p_branch_id, p_table_id, p_session_id, p_source, p_type, p_items, p_notes, p_created_by);
end;
$$;

-- Kitchen display is a plan feature.
alter function public.update_ticket_status(uuid, public.ticket_status) rename to update_ticket_status_core;
alter function public.update_ticket_status_core(uuid, public.ticket_status) set schema private;
create or replace function public.update_ticket_status(p_ticket_id uuid, p_status public.ticket_status)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.kitchen_tickets where id = p_ticket_id;
  if v_tenant is not null and not private.has_feature(v_tenant, 'kds') then
    raise exception 'The kitchen display is not included in your plan. Upgrade to use it.' using errcode = 'P0001', hint = 'feature:kds';
  end if;
  perform private.update_ticket_status_core(p_ticket_id, p_status);
end;
$$;

-- New restaurants start pending when approval is required.
create or replace function private.tenant_initial_status()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if (select require_approval from public.platform_settings) and not private.is_platform_admin() then
    new.status := 'pending';
  end if;
  return new;
end;
$$;
create trigger tenants_initial_status before insert on public.tenants
  for each row execute function private.tenant_initial_status();

-- ---------------------------------------------------------------------------
-- Platform billing records (manual: bank transfer / Raast / cash for now)
-- ---------------------------------------------------------------------------
create table public.subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  plan_id uuid not null references public.subscription_plans (id),
  billing_cycle public.billing_cycle not null,
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null,
  method text not null check (char_length(method) between 1 and 40),
  reference text check (reference is null or char_length(reference) <= 80),
  period_start timestamptz not null,
  period_end timestamptz not null,
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (period_end > period_start)
);
create index subscription_invoices_tenant_idx on public.subscription_invoices (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Support tickets
-- ---------------------------------------------------------------------------
create type public.ticket_state as enum ('open', 'waiting', 'closed');

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  created_by uuid not null references auth.users (id),
  subject text not null check (char_length(subject) between 3 and 120),
  category text not null default 'general' check (category in ('general', 'billing', 'bug', 'feature', 'upgrade')),
  state public.ticket_state not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_tickets_tenant_idx on public.support_tickets (tenant_id, updated_at desc);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author_id uuid not null references auth.users (id),
  from_platform boolean not null default false,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

create or replace function public.create_support_ticket(p_tenant_id uuid, p_subject text, p_category text, p_body text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.is_member(p_tenant_id) then
    raise exception 'Restaurant not found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.support_tickets where created_by = auth.uid() and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many tickets in a short time. Please add to an existing ticket.' using errcode = 'P0001';
  end if;
  insert into public.support_tickets (tenant_id, created_by, subject, category)
  values (p_tenant_id, auth.uid(), trim(p_subject), coalesce(p_category, 'general'))
  returning id into v_id;
  insert into public.support_messages (ticket_id, author_id, body) values (v_id, auth.uid(), trim(p_body));
  return v_id;
end;
$$;

create or replace function public.reply_support_ticket(p_ticket_id uuid, p_body text, p_state public.ticket_state default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_ticket public.support_tickets;
  v_admin boolean := private.is_platform_admin();
begin
  select * into v_ticket from public.support_tickets where id = p_ticket_id for update;
  if v_ticket.id is null or not (v_admin or private.is_member(v_ticket.tenant_id)) then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;
  if nullif(trim(p_body), '') is not null then
    insert into public.support_messages (ticket_id, author_id, from_platform, body)
    values (v_ticket.id, auth.uid(), v_admin and not private.is_member(v_ticket.tenant_id), trim(p_body));
  end if;
  update public.support_tickets set
    state = coalesce(p_state, case when v_admin and not private.is_member(v_ticket.tenant_id) then 'waiting'::public.ticket_state else 'open'::public.ticket_state end),
    updated_at = now()
  where id = v_ticket.id;
end;
$$;

-- Tenant asks for a plan change (creates a ticket for the platform team).
create or replace function public.request_plan_change(p_tenant_id uuid, p_plan_id uuid, p_cycle public.billing_cycle)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_plan public.subscription_plans;
begin
  if not private.has_perm(p_tenant_id, 'billing.manage') then
    raise exception 'Only the owner (or billing managers) can change the plan' using errcode = '42501';
  end if;
  select * into v_plan from public.subscription_plans where id = p_plan_id and is_active;
  if v_plan.id is null then
    raise exception 'Plan not found' using errcode = 'P0002';
  end if;
  return public.create_support_ticket(p_tenant_id, 'Plan change: ' || v_plan.name || ' (' || p_cycle || ')', 'upgrade',
    'Please move us to the ' || v_plan.name || ' plan, billed ' || p_cycle || '.');
end;
$$;

-- ---------------------------------------------------------------------------
-- Platform admin RPCs
-- ---------------------------------------------------------------------------
create or replace function private.assert_platform_admin()
returns void
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Platform admins only' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.admin_overview()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform private.assert_platform_admin();
  return jsonb_build_object(
    'tenants', (select jsonb_object_agg(status, n) from (select status::text, count(*) n from public.tenants group by status) x),
    'subscriptions', (select jsonb_object_agg(status, n) from (select status::text, count(*) n from public.subscriptions group by status) x),
    'mrr_minor', coalesce((
      select sum(case s.billing_cycle when 'yearly' then round(sp.price_yearly_minor / 12.0) else sp.price_monthly_minor end)
      from public.subscriptions s join public.subscription_plans sp on sp.id = s.plan_id
      where s.status = 'active' and coalesce(s.current_period_end, now()) >= now()), 0),
    'trials_ending_7d', (select count(*) from public.subscriptions where status = 'trialing' and trial_ends_at between now() and now() + interval '7 days'),
    'signups_30d', (select count(*) from public.tenants where created_at > now() - interval '30 days'),
    'orders_30d', (select count(*) from public.orders where created_at > now() - interval '30 days'),
    'open_tickets', (select count(*) from public.support_tickets where state = 'open')
  );
end;
$$;

create or replace function public.admin_list_tenants(p_search text default '')
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform private.assert_platform_admin();
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.created_at desc)
    from (
      select t.id, t.name, t.slug, t.status, t.country, t.currency, t.created_at,
             p.email as owner_email, p.full_name as owner_name,
             sp.name as plan_name, s.status as subscription_status, s.billing_cycle,
             case when s.status = 'trialing' then s.trial_ends_at else s.current_period_end end as ends_at,
             private.tenant_access(t.id) as access,
             (select count(*) from public.branches b where b.tenant_id = t.id) as branches,
             (select count(*) from public.tenant_members m where m.tenant_id = t.id and m.status = 'active') as staff,
             (select count(*) from public.orders o where o.tenant_id = t.id and o.created_at > now() - interval '30 days') as orders_30d,
             (select max(o.created_at) from public.orders o where o.tenant_id = t.id) as last_order_at
      from public.tenants t
      left join public.profiles p on p.id = t.created_by
      left join public.subscriptions s on s.tenant_id = t.id
      left join public.subscription_plans sp on sp.id = s.plan_id
      where coalesce(p_search, '') = ''
         or t.name ilike '%' || p_search || '%' or t.slug ilike '%' || p_search || '%' or p.email ilike '%' || p_search || '%'
      limit 500
    ) x), '[]');
end;
$$;

create or replace function public.admin_set_tenant_status(p_tenant_id uuid, p_status public.tenant_status, p_reason text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform private.assert_platform_admin();
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason' using errcode = '22023';
  end if;
  update public.tenants set status = p_status where id = p_tenant_id;
  if not found then
    raise exception 'Restaurant not found' using errcode = 'P0002';
  end if;
  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, data)
  values (p_tenant_id, auth.uid(), 'platform_status', 'tenants', p_tenant_id::text,
          jsonb_build_object('status', p_status, 'reason', trim(p_reason)));
end;
$$;

create or replace function public.admin_set_subscription(
  p_tenant_id uuid,
  p_plan_id uuid,
  p_status public.subscription_status,
  p_cycle public.billing_cycle,
  p_ends_at timestamptz
)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform private.assert_platform_admin();
  if not exists (select 1 from public.subscription_plans where id = p_plan_id) then
    raise exception 'Plan not found' using errcode = 'P0002';
  end if;
  insert into public.subscriptions (tenant_id, plan_id, status, billing_cycle, trial_ends_at, current_period_end)
  values (p_tenant_id, p_plan_id, p_status, p_cycle,
          case when p_status = 'trialing' then p_ends_at end, p_ends_at)
  on conflict (tenant_id) do update set
    plan_id = excluded.plan_id, status = excluded.status, billing_cycle = excluded.billing_cycle,
    trial_ends_at = case when excluded.status = 'trialing' then p_ends_at else public.subscriptions.trial_ends_at end,
    current_period_end = p_ends_at;
end;
$$;

-- Record a manual payment: extends the paid period and activates the plan.
create or replace function public.admin_record_payment(
  p_tenant_id uuid,
  p_plan_id uuid,
  p_cycle public.billing_cycle,
  p_amount_minor bigint,
  p_method text,
  p_reference text default null
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_plan public.subscription_plans;
  v_start timestamptz;
  v_end timestamptz;
  v_id uuid;
begin
  perform private.assert_platform_admin();
  select * into v_plan from public.subscription_plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'Plan not found' using errcode = 'P0002';
  end if;
  if p_amount_minor < 0 then
    raise exception 'Amount cannot be negative' using errcode = '22023';
  end if;
  select * into v_sub from public.subscriptions where tenant_id = p_tenant_id for update;
  -- New period starts when the current paid period ends (if still in the future).
  v_start := greatest(now(), case when v_sub.status = 'active' then coalesce(v_sub.current_period_end, now()) else now() end);
  v_end := v_start + case p_cycle when 'yearly' then interval '1 year' else interval '1 month' end;

  insert into public.subscription_invoices (tenant_id, plan_id, billing_cycle, amount_minor, currency, method, reference,
                                            period_start, period_end, recorded_by)
  values (p_tenant_id, p_plan_id, p_cycle, p_amount_minor, v_plan.currency, trim(p_method), nullif(trim(p_reference), ''),
          v_start, v_end, auth.uid())
  returning id into v_id;

  perform public.admin_set_subscription(p_tenant_id, p_plan_id, 'active', p_cycle, v_end);
  return v_id;
end;
$$;

create or replace function public.admin_tenant_detail(p_tenant_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform private.assert_platform_admin();
  return jsonb_build_object(
    'branches', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'city', city, 'is_active', is_active) order by created_at), '[]')
                 from public.branches where tenant_id = p_tenant_id),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('name', p.full_name, 'email', p.email, 'role', r.name, 'status', m.status) order by m.created_at), '[]')
                from public.tenant_members m join public.profiles p on p.id = m.user_id join public.roles r on r.id = m.role_id
                where m.tenant_id = p_tenant_id),
    'invoices', (select coalesce(jsonb_agg(jsonb_build_object('amount_minor', amount_minor, 'currency', currency, 'method', method,
                                                             'reference', reference, 'period_end', period_end, 'created_at', created_at)
                                           order by created_at desc), '[]')
                 from public.subscription_invoices where tenant_id = p_tenant_id),
    'usage', jsonb_build_object(
      'products', (select count(*) from public.products where tenant_id = p_tenant_id),
      'tables', (select count(*) from public.tables where tenant_id = p_tenant_id),
      'orders_30d', (select count(*) from public.orders where tenant_id = p_tenant_id and created_at > now() - interval '30 days'),
      'sales_30d_minor', (select coalesce(sum(paid_total_minor), 0) from public.bills where tenant_id = p_tenant_id and created_at > now() - interval '30 days')),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('action', action, 'data', data, 'created_at', created_at) order by created_at desc), '[]')
                from (select * from public.audit_logs where tenant_id = p_tenant_id and action like 'platform%' order by created_at desc limit 20) a)
  );
end;
$$;

create or replace function public.admin_update_settings(p_require_approval boolean, p_grace_days int, p_support_email text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform private.assert_platform_admin();
  update public.platform_settings set require_approval = p_require_approval, grace_days = p_grace_days,
    support_email = nullif(trim(p_support_email), ''), updated_at = now()
  where id;  -- single-row table; the API rejects UPDATE without WHERE
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges & RLS
-- ---------------------------------------------------------------------------
revoke all on public.platform_settings, public.subscription_invoices, public.support_tickets, public.support_messages
  from anon, authenticated;

grant select on public.platform_settings to authenticated;
grant select on public.subscription_invoices, public.support_tickets, public.support_messages to authenticated;

-- Plans: platform admins manage them directly (RLS below).
grant insert (code, name, description, currency, price_monthly_minor, price_yearly_minor, trial_days, limits, features,
              is_active, is_default_trial, sort_order) on public.subscription_plans to authenticated;
grant update (name, description, currency, price_monthly_minor, price_yearly_minor, trial_days, limits, features,
              is_active, is_default_trial, sort_order) on public.subscription_plans to authenticated;
create policy plans_admin_insert on public.subscription_plans for insert to authenticated with check (private.is_platform_admin());
create policy plans_admin_update on public.subscription_plans for update to authenticated
  using (private.is_platform_admin()) with check (private.is_platform_admin());

alter table public.platform_settings enable row level security;
alter table public.subscription_invoices enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

create policy platform_settings_select on public.platform_settings for select to authenticated using (true);
create policy subscription_invoices_select on public.subscription_invoices for select to authenticated
  using (private.has_perm(tenant_id, 'billing.manage') or private.is_platform_admin());
create policy support_tickets_select on public.support_tickets for select to authenticated
  using (private.is_member(tenant_id) or private.is_platform_admin());
create policy support_messages_select on public.support_messages for select to authenticated
  using (exists (select 1 from public.support_tickets t where t.id = ticket_id));

-- Platform admins can read restaurant-level data for support (read-only).
create policy profiles_admin_select on public.profiles for select to authenticated using (private.is_platform_admin());

revoke execute on function
  public.my_tenant_access(uuid), public.create_support_ticket(uuid, text, text, text),
  public.reply_support_ticket(uuid, text, public.ticket_state), public.request_plan_change(uuid, uuid, public.billing_cycle),
  public.admin_overview(), public.admin_list_tenants(text), public.admin_set_tenant_status(uuid, public.tenant_status, text),
  public.admin_set_subscription(uuid, uuid, public.subscription_status, public.billing_cycle, timestamptz),
  public.admin_record_payment(uuid, uuid, public.billing_cycle, bigint, text, text),
  public.admin_tenant_detail(uuid), public.admin_update_settings(boolean, int, text),
  public.update_ticket_status(uuid, public.ticket_status)
from public, anon;
grant execute on function
  public.my_tenant_access(uuid), public.create_support_ticket(uuid, text, text, text),
  public.reply_support_ticket(uuid, text, public.ticket_state), public.request_plan_change(uuid, uuid, public.billing_cycle),
  public.admin_overview(), public.admin_list_tenants(text), public.admin_set_tenant_status(uuid, public.tenant_status, text),
  public.admin_set_subscription(uuid, uuid, public.subscription_status, public.billing_cycle, timestamptz),
  public.admin_record_payment(uuid, uuid, public.billing_cycle, bigint, text, text),
  public.admin_tenant_detail(uuid), public.admin_update_settings(boolean, int, text),
  public.update_ticket_status(uuid, public.ticket_status)
to authenticated;
revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, anon;
