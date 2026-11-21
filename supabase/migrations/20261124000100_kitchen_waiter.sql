-- =============================================================================
-- Phase 4 · Kitchen tickets, waiter ordering, table assignment / transfer /
-- merge.
--
-- Each order is split into one kitchen ticket per station automatically.
-- The order's status follows its tickets (all ready → order ready), and
-- order-level actions (accept, serve, cancel) are mirrored onto tickets.
-- =============================================================================

create type public.ticket_status as enum ('new', 'accepted', 'preparing', 'ready', 'served', 'cancelled');

create table public.kitchen_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  order_id uuid not null,
  station_id uuid references public.kitchen_stations (id) on delete set null,
  -- Null-safe key so (order, "no station") is unique too.
  station_key uuid generated always as (coalesce(station_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  status public.ticket_status not null default 'new',
  priority boolean not null default false,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  started_at timestamptz,
  ready_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (order_id, station_key),
  foreign key (order_id, tenant_id) references public.orders (id, tenant_id) on delete cascade,
  foreign key (branch_id, tenant_id) references public.branches (id, tenant_id) on delete cascade
);
create index kitchen_tickets_branch_active_idx on public.kitchen_tickets (branch_id, created_at)
  where status in ('new', 'accepted', 'preparing', 'ready');
create trigger kitchen_tickets_updated_at before update on public.kitchen_tickets
  for each row execute function private.set_updated_at();

-- Waiter assigned to a table (optional).
alter table public.tables add column waiter_id uuid references auth.users (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Ticket creation: one per (order, station) as lines are added.
-- ---------------------------------------------------------------------------
create or replace function private.ensure_ticket()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.kitchen_tickets (tenant_id, branch_id, order_id, station_id)
  select o.tenant_id, o.branch_id, o.id, new.kitchen_station_id
  from public.orders o where o.id = new.order_id
  on conflict (order_id, station_key) do nothing;
  return new;
end;
$$;
create trigger order_items_ensure_ticket after insert on public.order_items
  for each row execute function private.ensure_ticket();

-- ---------------------------------------------------------------------------
-- Keep order status in step with its tickets (kitchen → order).
-- ---------------------------------------------------------------------------
create or replace function private.sync_order_from_tickets(p_order_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_new public.order_status;
  v_live int;
  v_ready int;
  v_preparing int;
  v_accepted int;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.status in ('served', 'completed', 'cancelled') then
    return;
  end if;
  select count(*) filter (where status <> 'cancelled'),
         count(*) filter (where status in ('ready', 'served')),
         count(*) filter (where status = 'preparing'),
         count(*) filter (where status = 'accepted')
  into v_live, v_ready, v_preparing, v_accepted
  from public.kitchen_tickets where order_id = p_order_id;

  v_new := case
    when v_live > 0 and v_ready = v_live then 'ready'
    when v_preparing > 0 or v_ready > 0 then 'preparing'
    when v_accepted > 0 then 'accepted'
    else 'new'
  end::public.order_status;
  if v_new is distinct from v_order.status then
    update public.orders set
      status = v_new,
      accepted_at = case when v_new <> 'new' then coalesce(accepted_at, now()) else accepted_at end,
      ready_at = case when v_new = 'ready' then now() else null end
    where id = p_order_id;
    update public.order_items set status = v_new where order_id = p_order_id and status <> 'cancelled';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Kitchen actions
-- ---------------------------------------------------------------------------
create or replace function public.update_ticket_status(p_ticket_id uuid, p_status public.ticket_status)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_ticket public.kitchen_tickets;
  v_order_status public.order_status;
  v_ranks constant public.ticket_status[] := array['new', 'accepted', 'preparing', 'ready']::public.ticket_status[];
begin
  select * into v_ticket from public.kitchen_tickets where id = p_ticket_id for update;
  if v_ticket.id is null or not private.has_branch_perm(v_ticket.tenant_id, v_ticket.branch_id, 'kitchen.view') then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;
  if not private.has_branch_perm(v_ticket.tenant_id, v_ticket.branch_id, 'kitchen.update') then
    raise exception 'You do not have permission to update kitchen tickets' using errcode = '42501';
  end if;
  if p_status not in ('accepted', 'preparing', 'ready') then
    raise exception 'Use the order actions to serve or cancel' using errcode = '22023';
  end if;
  if v_ticket.status in ('served', 'cancelled') then
    raise exception 'This ticket is already %', v_ticket.status using errcode = 'P0001';
  end if;
  select status into v_order_status from public.orders where id = v_ticket.order_id;
  if v_order_status in ('served', 'completed', 'cancelled') then
    raise exception 'This order is already %', v_order_status using errcode = 'P0001';
  end if;
  -- Forward moves, plus "recall": ready → preparing (bumped by mistake).
  if array_position(v_ranks, p_status) <= array_position(v_ranks, v_ticket.status)
     and not (v_ticket.status = 'ready' and p_status = 'preparing') then
    raise exception 'Tickets can only move forward' using errcode = 'P0001';
  end if;

  update public.kitchen_tickets set
    status = p_status,
    accepted_at = coalesce(accepted_at, now()),
    started_at = case when p_status in ('preparing', 'ready') then coalesce(started_at, now()) else started_at end,
    ready_at = case when p_status = 'ready' then now() else null end
  where id = v_ticket.id;

  perform private.sync_order_from_tickets(v_ticket.order_id);
end;
$$;

create or replace function public.set_ticket_priority(p_ticket_id uuid, p_priority boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_ticket public.kitchen_tickets;
begin
  select * into v_ticket from public.kitchen_tickets where id = p_ticket_id;
  if v_ticket.id is null or not (
       private.has_branch_perm(v_ticket.tenant_id, v_ticket.branch_id, 'kitchen.update')
    or private.has_branch_perm(v_ticket.tenant_id, v_ticket.branch_id, 'orders.edit')) then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;
  update public.kitchen_tickets set priority = p_priority where id = v_ticket.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Order actions now also move the order's tickets (order → kitchen).
-- Wraps the Phase 3 status logic.
-- ---------------------------------------------------------------------------
alter function public.update_order_status(uuid, public.order_status, text) rename to update_order_status_core;
revoke execute on function public.update_order_status_core(uuid, public.order_status, text) from public, anon, authenticated;
alter function public.update_order_status_core(uuid, public.order_status, text) set schema private;

create or replace function public.update_order_status(
  p_order_id uuid,
  p_status public.order_status,
  p_reason text default null
)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform private.update_order_status_core(p_order_id, p_status, p_reason);
  update public.kitchen_tickets set
    status = case p_status
      when 'cancelled' then 'cancelled'::public.ticket_status
      when 'completed' then 'served'::public.ticket_status
      else p_status::text::public.ticket_status end,
    accepted_at = coalesce(accepted_at, now()),
    ready_at = case when p_status in ('ready', 'served', 'completed') then coalesce(ready_at, now()) else ready_at end
  where order_id = p_order_id
    and status not in ('served', 'cancelled')
    and (p_status in ('cancelled', 'served', 'completed')
         or array_position(array['new', 'accepted', 'preparing', 'ready']::public.ticket_status[], status)
            < array_position(array['new', 'accepted', 'preparing', 'ready']::public.ticket_status[], p_status::text::public.ticket_status));
end;
$$;

-- Closing a sitting completes served orders; keep tickets consistent.
create or replace function private.tickets_follow_completion()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status <> 'completed' then
    update public.kitchen_tickets set status = 'served' where order_id = new.id and status not in ('served', 'cancelled');
  end if;
  return new;
end;
$$;
create trigger orders_tickets_follow_completion after update of status on public.orders
  for each row execute function private.tickets_follow_completion();

-- ---------------------------------------------------------------------------
-- Waiter / staff ordering for a table (adds a new order to the sitting).
-- ---------------------------------------------------------------------------
create or replace function public.place_staff_order(p_table_id uuid, p_items jsonb, p_notes text default '')
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_table public.tables;
  v_session public.table_sessions;
  v_order public.orders;
begin
  select * into v_table from public.tables where id = p_table_id and is_active for update;
  if v_table.id is null or not private.has_branch_perm(v_table.tenant_id, v_table.branch_id, 'orders.create') then
    raise exception 'Table not found' using errcode = 'P0002';
  end if;
  select * into v_session from public.table_sessions where table_id = v_table.id and status = 'open';
  if v_session.id is null then
    insert into public.table_sessions (tenant_id, branch_id, table_id)
    values (v_table.tenant_id, v_table.branch_id, v_table.id)
    returning * into v_session;
  end if;
  v_order := private.create_order(v_table.tenant_id, v_table.branch_id, v_table.id, v_session.id,
                                  'waiter', 'dine_in', p_items, p_notes, auth.uid());
  -- A waiter who takes an order for an unassigned table becomes its waiter.
  update public.tables set waiter_id = auth.uid() where id = v_table.id and waiter_id is null;
  return jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'total_minor', v_order.total_minor);
end;
$$;

-- ---------------------------------------------------------------------------
-- Waiter assignment
-- ---------------------------------------------------------------------------
create or replace function public.assign_table_waiter(p_table_id uuid, p_user_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_table public.tables;
begin
  select * into v_table from public.tables where id = p_table_id;
  if v_table.id is null or not private.has_branch_perm(v_table.tenant_id, v_table.branch_id, 'tables.view') then
    raise exception 'Table not found' using errcode = 'P0002';
  end if;
  if private.has_branch_perm(v_table.tenant_id, v_table.branch_id, 'tables.manage') then
    null; -- managers can assign anyone (or clear)
  elsif private.has_branch_perm(v_table.tenant_id, v_table.branch_id, 'orders.edit')
        and p_user_id = auth.uid() and (v_table.waiter_id is null or v_table.waiter_id = auth.uid()) then
    null; -- waiters can claim a free table
  elsif private.has_branch_perm(v_table.tenant_id, v_table.branch_id, 'orders.edit')
        and p_user_id is null and v_table.waiter_id = auth.uid() then
    null; -- or release their own
  else
    raise exception 'You can only claim tables that are not assigned' using errcode = '42501';
  end if;
  if p_user_id is not null and not exists (
    select 1 from public.tenant_members m
    where m.tenant_id = v_table.tenant_id and m.user_id = p_user_id and m.status = 'active'
      and (m.all_branches or exists (select 1 from public.member_branches mb where mb.member_id = m.id and mb.branch_id = v_table.branch_id))
  ) then
    raise exception 'That person does not work at this branch' using errcode = '22023';
  end if;
  update public.tables set waiter_id = p_user_id where id = v_table.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Transfer a sitting to another (free) table in the same branch.
-- ---------------------------------------------------------------------------
create or replace function public.transfer_table_session(p_session_id uuid, p_to_table_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_session public.table_sessions;
  v_to public.tables;
begin
  select * into v_session from public.table_sessions where id = p_session_id and status = 'open' for update;
  if v_session.id is null or not (
       private.has_branch_perm(v_session.tenant_id, v_session.branch_id, 'orders.edit')
    or private.has_branch_perm(v_session.tenant_id, v_session.branch_id, 'tables.manage')) then
    raise exception 'Open table not found' using errcode = 'P0002';
  end if;
  select * into v_to from public.tables where id = p_to_table_id and is_active for update;
  if v_to.id is null or v_to.branch_id <> v_session.branch_id then
    raise exception 'Choose a table in the same branch' using errcode = '22023';
  end if;
  if v_to.id = v_session.table_id then
    raise exception 'Choose a different table' using errcode = '22023';
  end if;
  if exists (select 1 from public.table_sessions where table_id = v_to.id and status = 'open') then
    raise exception 'Table % already has guests. Use merge instead.', v_to.label using errcode = 'P0001';
  end if;

  update public.tables set status = 'cleaning' where id = v_session.table_id;
  update public.table_sessions set table_id = v_to.id where id = v_session.id;
  update public.orders set table_id = v_to.id where session_id = v_session.id;
  update public.guest_requests set table_id = v_to.id where session_id = v_session.id;
  update public.tables set status = 'occupied',
    waiter_id = coalesce(waiter_id, (select waiter_id from public.tables where id = v_session.table_id))
  where id = v_to.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Merge one sitting into another (e.g. a group joins tables).
-- ---------------------------------------------------------------------------
create or replace function public.merge_table_sessions(p_from_session_id uuid, p_into_session_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_from public.table_sessions;
  v_into public.table_sessions;
begin
  if p_from_session_id = p_into_session_id then
    raise exception 'Choose two different tables' using errcode = '22023';
  end if;
  select * into v_from from public.table_sessions where id = p_from_session_id and status = 'open' for update;
  select * into v_into from public.table_sessions where id = p_into_session_id and status = 'open' for update;
  if v_from.id is null or v_into.id is null or v_from.branch_id <> v_into.branch_id or not (
       private.has_branch_perm(v_from.tenant_id, v_from.branch_id, 'orders.edit')
    or private.has_branch_perm(v_from.tenant_id, v_from.branch_id, 'tables.manage')) then
    raise exception 'Open table not found' using errcode = 'P0002';
  end if;

  update public.orders set session_id = v_into.id, table_id = v_into.table_id where session_id = v_from.id;
  update public.guest_requests set session_id = v_into.id, table_id = v_into.table_id where session_id = v_from.id;
  update public.table_sessions set status = 'closed', closed_at = now(), closed_by = auth.uid() where id = v_from.id;
  update public.tables set status = 'cleaning' where id = v_from.table_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges, RLS, realtime
-- ---------------------------------------------------------------------------
revoke all on public.kitchen_tickets from anon, authenticated;
grant select on public.kitchen_tickets to authenticated;
alter table public.kitchen_tickets enable row level security;
create policy kitchen_tickets_select on public.kitchen_tickets for select to authenticated
  using (private.has_branch_perm(tenant_id, branch_id, 'kitchen.view')
         or private.has_branch_perm(tenant_id, branch_id, 'orders.view'));

-- Waiter assignment is changed only through assign_table_waiter.
revoke update (waiter_id) on public.tables from authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.kitchen_tickets;
  end if;
end;
$$;

revoke execute on function
  public.update_ticket_status(uuid, public.ticket_status),
  public.set_ticket_priority(uuid, boolean),
  public.update_order_status(uuid, public.order_status, text),
  public.place_staff_order(uuid, jsonb, text),
  public.assign_table_waiter(uuid, uuid),
  public.transfer_table_session(uuid, uuid),
  public.merge_table_sessions(uuid, uuid)
from public, anon;
grant execute on function
  public.update_ticket_status(uuid, public.ticket_status),
  public.set_ticket_priority(uuid, boolean),
  public.update_order_status(uuid, public.order_status, text),
  public.place_staff_order(uuid, jsonb, text),
  public.assign_table_waiter(uuid, uuid),
  public.transfer_table_session(uuid, uuid),
  public.merge_table_sessions(uuid, uuid)
to authenticated;
revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, anon;
