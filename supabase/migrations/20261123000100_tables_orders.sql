-- =============================================================================
-- Phase 3 · Floor areas, tables, table sessions, orders, guest requests.
-- Guests (anon) never get table privileges: they use the RPCs in the next
-- migration. Staff read through RLS; all writes go through checked RPCs.
-- =============================================================================

create type public.table_status as enum ('available', 'occupied', 'reserved', 'cleaning');
create type public.table_shape as enum ('square', 'round', 'rect');
create type public.session_status as enum ('open', 'closed');
create type public.order_type as enum ('dine_in', 'takeaway', 'delivery');
create type public.order_source as enum ('qr', 'waiter', 'pos', 'online');
create type public.order_status as enum ('new', 'accepted', 'preparing', 'ready', 'served', 'completed', 'cancelled');
create type public.guest_request_type as enum ('assistance', 'water', 'napkins', 'bill', 'other');
create type public.guest_request_status as enum ('open', 'acknowledged', 'resolved');

-- ---------------------------------------------------------------------------
-- Floor areas & tables
-- ---------------------------------------------------------------------------
create table public.floor_areas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  name text not null check (char_length(name) between 1 and 40),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (id, branch_id),
  unique (branch_id, name),
  foreign key (branch_id, tenant_id) references public.branches (id, tenant_id) on delete cascade
);

create table public.tables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  area_id uuid,
  label text not null check (char_length(label) between 1 and 20),
  seats int not null default 4 check (seats between 1 and 50),
  status public.table_status not null default 'available',
  shape public.table_shape not null default 'square',
  -- Floor plan position on a 0–1000 grid.
  pos_x int not null default 0 check (pos_x between 0 and 1000),
  pos_y int not null default 0 check (pos_y between 0 and 1000),
  -- Unguessable token printed in the table's QR code. Regenerating it
  -- invalidates printed codes (e.g. if a card is stolen).
  qr_token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (branch_id, label),
  foreign key (branch_id, tenant_id) references public.branches (id, tenant_id) on delete cascade,
  foreign key (area_id, branch_id) references public.floor_areas (id, branch_id) on delete set null (area_id)
);
create index tables_branch_idx on public.tables (branch_id);
create trigger tables_updated_at before update on public.tables
  for each row execute function private.set_updated_at();

-- Plan limit on tables (per tenant, across branches).
create or replace function private.enforce_table_limit()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_limit int := private.plan_limit(new.tenant_id, 'tables');
begin
  if auth.uid() is not null and not private.has_branch_perm(new.tenant_id, new.branch_id, 'tables.manage') then
    return new; -- RLS rejects it next; reveal nothing about the plan.
  end if;
  if v_limit is not null
     and (select count(*) from public.tables t where t.tenant_id = new.tenant_id) >= v_limit then
    raise exception 'Your plan allows % tables. Upgrade to add more.', v_limit
      using errcode = 'P0001', hint = 'plan_limit:tables';
  end if;
  return new;
end;
$$;
create trigger tables_enforce_limit before insert on public.tables
  for each row execute function private.enforce_table_limit();

-- ---------------------------------------------------------------------------
-- Table sessions: one sitting at a table, from first order to closing.
-- ---------------------------------------------------------------------------
create table public.table_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  table_id uuid not null,
  status public.session_status not null default 'open',
  -- Given to guests who scan the table QR; lets them see this sitting's
  -- orders and send requests. Useless once the session is closed.
  guest_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references auth.users (id) on delete set null,
  unique (id, tenant_id),
  foreign key (table_id, tenant_id) references public.tables (id, tenant_id) on delete cascade,
  foreign key (branch_id, tenant_id) references public.branches (id, tenant_id) on delete cascade
);
create unique index table_sessions_one_open on public.table_sessions (table_id) where status = 'open';
create index table_sessions_branch_idx on public.table_sessions (branch_id, opened_at desc);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create table public.order_counters (
  branch_id uuid not null references public.branches (id) on delete cascade,
  business_date date not null,
  last_number int not null default 0,
  primary key (branch_id, business_date)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  table_id uuid,
  session_id uuid,
  -- Short number shown to guests and the kitchen; restarts daily per branch.
  order_number int not null,
  business_date date not null,
  type public.order_type not null default 'dine_in',
  source public.order_source not null,
  status public.order_status not null default 'new',
  currency text not null,
  subtotal_minor bigint not null default 0 check (subtotal_minor >= 0),
  discount_minor bigint not null default 0 check (discount_minor >= 0),
  service_minor bigint not null default 0 check (service_minor >= 0),
  tax_minor bigint not null default 0 check (tax_minor >= 0),
  total_minor bigint not null default 0 check (total_minor >= 0),
  notes text not null default '' check (char_length(notes) <= 500),
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  ready_at timestamptz,
  served_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (branch_id, business_date, order_number),
  foreign key (branch_id, tenant_id) references public.branches (id, tenant_id) on delete cascade,
  foreign key (table_id, tenant_id) references public.tables (id, tenant_id) on delete set null (table_id),
  foreign key (session_id, tenant_id) references public.table_sessions (id, tenant_id) on delete set null (session_id)
);
create index orders_branch_created_idx on public.orders (branch_id, created_at desc);
create index orders_session_idx on public.orders (session_id);
create index orders_tenant_status_idx on public.orders (tenant_id, status);
create trigger orders_updated_at before update on public.orders
  for each row execute function private.set_updated_at();

-- Lines keep a snapshot of names and prices: later menu edits never change
-- what an old order (or its receipt) says.
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_id uuid not null,
  product_id uuid,
  variant_id uuid,
  name text not null,
  variant_name text,
  kitchen_station_id uuid,
  quantity int not null check (quantity between 1 and 99),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  modifiers_minor bigint not null default 0 check (modifiers_minor >= 0),
  line_total_minor bigint not null check (line_total_minor >= 0),
  notes text not null default '' check (char_length(notes) <= 200),
  status public.order_status not null default 'new',
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (order_id, tenant_id) references public.orders (id, tenant_id) on delete cascade,
  foreign key (product_id) references public.products (id) on delete set null,
  foreign key (variant_id) references public.product_variants (id) on delete set null,
  foreign key (kitchen_station_id) references public.kitchen_stations (id) on delete set null
);
create index order_items_order_idx on public.order_items (order_id);

create table public.order_item_modifiers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_item_id uuid not null,
  modifier_id uuid references public.modifiers (id) on delete set null,
  group_name text not null,
  name text not null,
  price_minor bigint not null check (price_minor >= 0),
  foreign key (order_item_id, tenant_id) references public.order_items (id, tenant_id) on delete cascade
);
create index order_item_modifiers_item_idx on public.order_item_modifiers (order_item_id);

-- ---------------------------------------------------------------------------
-- Guest requests (call waiter, water, bill...)
-- ---------------------------------------------------------------------------
create table public.guest_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  table_id uuid not null,
  session_id uuid,
  type public.guest_request_type not null,
  note text not null default '' check (char_length(note) <= 200),
  status public.guest_request_status not null default 'open',
  handled_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  foreign key (table_id, tenant_id) references public.tables (id, tenant_id) on delete cascade,
  foreign key (session_id, tenant_id) references public.table_sessions (id, tenant_id) on delete cascade
);
create index guest_requests_branch_open_idx on public.guest_requests (branch_id, created_at desc) where status <> 'resolved';

-- Audit what matters for money and disputes.
create trigger audit_tables after insert or update of qr_token, label, is_active or delete on public.tables
  for each row execute function private.audit_row();
create trigger audit_orders after update of status on public.orders
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- Privileges & RLS
-- ---------------------------------------------------------------------------
revoke all on public.floor_areas, public.tables, public.table_sessions, public.order_counters, public.orders,
  public.order_items, public.order_item_modifiers, public.guest_requests from anon, authenticated;

grant select, delete on public.floor_areas to authenticated;
grant insert (tenant_id, branch_id, name, sort_order) on public.floor_areas to authenticated;
grant update (name, sort_order) on public.floor_areas to authenticated;

grant select, delete on public.tables to authenticated;
grant insert (tenant_id, branch_id, area_id, label, seats, shape, pos_x, pos_y, is_active) on public.tables to authenticated;
grant update (area_id, label, seats, shape, pos_x, pos_y, is_active) on public.tables to authenticated;

grant select on public.table_sessions, public.orders, public.order_items, public.order_item_modifiers,
  public.guest_requests to authenticated;

alter table public.floor_areas enable row level security;
alter table public.tables enable row level security;
alter table public.table_sessions enable row level security;
alter table public.order_counters enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_item_modifiers enable row level security;
alter table public.guest_requests enable row level security;

create policy floor_areas_select on public.floor_areas for select to authenticated
  using (private.has_branch_perm(tenant_id, branch_id, 'tables.view'));
create policy floor_areas_write on public.floor_areas for all to authenticated
  using (private.has_branch_perm(tenant_id, branch_id, 'tables.manage'))
  with check (private.has_branch_perm(tenant_id, branch_id, 'tables.manage'));

create policy tables_select on public.tables for select to authenticated
  using (private.has_branch_perm(tenant_id, branch_id, 'tables.view')
         or private.has_branch_perm(tenant_id, branch_id, 'orders.view'));
create policy tables_write on public.tables for all to authenticated
  using (private.has_branch_perm(tenant_id, branch_id, 'tables.manage'))
  with check (private.has_branch_perm(tenant_id, branch_id, 'tables.manage'));

create policy table_sessions_select on public.table_sessions for select to authenticated
  using (private.has_branch_perm(tenant_id, branch_id, 'tables.view')
         or private.has_branch_perm(tenant_id, branch_id, 'orders.view'));

create policy orders_select on public.orders for select to authenticated
  using (private.has_branch_perm(tenant_id, branch_id, 'orders.view')
         or private.has_branch_perm(tenant_id, branch_id, 'kitchen.view'));

-- Items/modifiers: visible when the parent order is (RLS on orders applies
-- inside the EXISTS subquery).
create policy order_items_select on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy order_item_modifiers_select on public.order_item_modifiers for select to authenticated
  using (exists (select 1 from public.order_items i where i.id = order_item_id));

create policy guest_requests_select on public.guest_requests for select to authenticated
  using (private.has_branch_perm(tenant_id, branch_id, 'orders.view')
         or private.has_branch_perm(tenant_id, branch_id, 'tables.view'));

-- ---------------------------------------------------------------------------
-- Realtime: staff screens subscribe to changes (filtered by RLS above).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.orders, public.guest_requests, public.tables;
  end if;
end;
$$;
