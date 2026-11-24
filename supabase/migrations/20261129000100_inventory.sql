-- =============================================================================
-- Phase 9: inventory, suppliers, purchases, recipes, costing, expenses.
--
-- * Quantities are in each item's own unit (kg, L, pcs…), 3 decimals.
-- * Costs are paisa per unit with 4 decimals (Rs 95/kg = 9500.0000 per kg),
--   kept as a moving average across all branches.
-- * Stock is per branch: inventory_stock is maintained from stock_movements,
--   the ledger every change goes through.
-- * Recipes deduct stock when an item is ordered (sale) and put it back when
--   the item is cancelled (sale_reversal). Each movement records its cost, so
--   cost of goods sold and wastage cost are exact for any period.
-- * Everything requires the plan's 'inventory' feature.
-- =============================================================================

create type public.stock_movement_kind as enum ('purchase', 'sale', 'sale_reversal', 'wastage', 'count', 'adjustment');

-- ---------------------------------------------------------------------------
-- Items, suppliers
-- ---------------------------------------------------------------------------
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  unit text not null check (unit in ('kg', 'g', 'l', 'ml', 'pcs', 'dozen', 'pack')),
  category text not null default '' check (char_length(category) <= 40),
  sku text check (char_length(sku) <= 40),
  avg_cost_minor numeric(16, 4) not null default 0 check (avg_cost_minor >= 0),
  reorder_level numeric(14, 3) not null default 0 check (reorder_level >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, name)
);
create trigger inventory_items_updated_at before update on public.inventory_items
  for each row execute function private.set_updated_at();

create table public.inventory_stock (
  tenant_id uuid not null,
  branch_id uuid not null,
  item_id uuid not null,
  quantity numeric(14, 3) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (branch_id, item_id),
  foreign key (branch_id, tenant_id) references public.branches (id, tenant_id) on delete cascade,
  foreign key (item_id, tenant_id) references public.inventory_items (id, tenant_id) on delete cascade
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  contact_name text check (char_length(contact_name) <= 80),
  phone text check (char_length(phone) <= 32),
  ntn text check (char_length(ntn) <= 20),
  notes text not null default '' check (char_length(notes) <= 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, name)
);

-- ---------------------------------------------------------------------------
-- Purchases (purchase order → goods received)
-- ---------------------------------------------------------------------------
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  supplier_id uuid,
  status text not null default 'draft' check (status in ('draft', 'received', 'cancelled')),
  reference text check (char_length(reference) <= 60),
  notes text not null default '' check (char_length(notes) <= 500),
  total_minor bigint not null default 0 check (total_minor >= 0),
  created_by uuid references auth.users (id) on delete set null,
  received_by uuid references auth.users (id) on delete set null,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (branch_id, tenant_id) references public.branches (id, tenant_id) on delete cascade,
  foreign key (supplier_id, tenant_id) references public.suppliers (id, tenant_id) on delete set null (supplier_id)
);
create index purchases_branch_idx on public.purchases (branch_id, created_at desc);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  purchase_id uuid not null,
  item_id uuid not null,
  quantity numeric(14, 3) not null check (quantity > 0),
  total_minor bigint not null check (total_minor >= 0),
  foreign key (purchase_id, tenant_id) references public.purchases (id, tenant_id) on delete cascade,
  foreign key (item_id, tenant_id) references public.inventory_items (id, tenant_id)
);
create index purchase_items_purchase_idx on public.purchase_items (purchase_id);

-- ---------------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------------
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  item_id uuid not null,
  kind public.stock_movement_kind not null,
  quantity numeric(14, 3) not null check (quantity <> 0), -- + in, − out
  unit_cost_minor numeric(16, 4) not null default 0,
  business_date date not null,
  purchase_id uuid,
  order_item_id uuid,
  reason text check (char_length(reason) <= 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (branch_id, tenant_id) references public.branches (id, tenant_id) on delete cascade,
  foreign key (item_id, tenant_id) references public.inventory_items (id, tenant_id) on delete cascade
);
create index stock_movements_branch_date_idx on public.stock_movements (branch_id, business_date);
create index stock_movements_item_idx on public.stock_movements (item_id, created_at desc);
create index stock_movements_order_item_idx on public.stock_movements (order_item_id) where order_item_id is not null;

-- ---------------------------------------------------------------------------
-- Recipes: per product (all variants), per variant (overrides the product),
-- or per modifier ("extra cheese"). Quantities per one unit sold.
-- ---------------------------------------------------------------------------
create table public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  product_id uuid references public.products (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete cascade,
  modifier_id uuid references public.modifiers (id) on delete cascade,
  item_id uuid not null,
  quantity numeric(14, 3) not null check (quantity > 0),
  foreign key (item_id, tenant_id) references public.inventory_items (id, tenant_id) on delete cascade,
  check (num_nonnulls(product_id, variant_id, modifier_id) = 1)
);
create unique index recipe_items_target_idx on public.recipe_items
  (coalesce(product_id, variant_id, modifier_id), item_id);
create index recipe_items_product_idx on public.recipe_items (product_id) where product_id is not null;
create index recipe_items_variant_idx on public.recipe_items (variant_id) where variant_id is not null;
create index recipe_items_modifier_idx on public.recipe_items (modifier_id) where modifier_id is not null;

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  category text not null check (category in ('rent', 'salaries', 'utilities', 'gas', 'maintenance', 'marketing', 'supplies', 'other')),
  amount_minor bigint not null check (amount_minor > 0),
  spent_on date not null,
  paid_to text check (char_length(paid_to) <= 80),
  note text not null default '' check (char_length(note) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (branch_id, tenant_id) references public.branches (id, tenant_id) on delete cascade
);
create index expenses_branch_date_idx on public.expenses (branch_id, spent_on);

-- ---------------------------------------------------------------------------
-- Privileges & RLS: reads through policies, every write through functions.
-- ---------------------------------------------------------------------------
revoke all on public.inventory_items, public.inventory_stock, public.suppliers, public.purchases,
  public.purchase_items, public.stock_movements, public.recipe_items, public.expenses from anon, authenticated;
grant select on public.inventory_items, public.inventory_stock, public.suppliers, public.purchases,
  public.purchase_items, public.stock_movements, public.recipe_items, public.expenses to authenticated;

alter table public.inventory_items enable row level security;
alter table public.inventory_stock enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.recipe_items enable row level security;
alter table public.expenses enable row level security;

create policy inventory_items_select on public.inventory_items for select to authenticated
  using (private.has_perm(tenant_id, 'inventory.view') or private.has_perm(tenant_id, 'menu.manage'));
create policy inventory_stock_select on public.inventory_stock for select to authenticated
  using (private.has_branch_perm(tenant_id, branch_id, 'inventory.view'));
create policy suppliers_select on public.suppliers for select to authenticated
  using (private.has_perm(tenant_id, 'inventory.view'));
create policy purchases_select on public.purchases for select to authenticated
  using (private.has_branch_perm(tenant_id, branch_id, 'inventory.view'));
create policy purchase_items_select on public.purchase_items for select to authenticated
  using (exists (select 1 from public.purchases p where p.id = purchase_id));
create policy stock_movements_select on public.stock_movements for select to authenticated
  using (private.has_branch_perm(tenant_id, branch_id, 'inventory.view'));
create policy recipe_items_select on public.recipe_items for select to authenticated
  using (private.has_perm(tenant_id, 'inventory.view') or private.has_perm(tenant_id, 'menu.manage'));
create policy expenses_select on public.expenses for select to authenticated
  using (private.has_branch_perm(tenant_id, branch_id, 'reports.view')
         or private.has_branch_perm(tenant_id, branch_id, 'inventory.manage'));

create trigger audit_inventory_items after insert or update or delete on public.inventory_items
  for each row execute function private.audit_row();
create trigger audit_suppliers after insert or update or delete on public.suppliers
  for each row execute function private.audit_row();
create trigger audit_expenses after insert or update or delete on public.expenses
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.require_inventory(p_tenant_id uuid, p_branch_id uuid default null)
returns void
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if p_branch_id is null and not private.has_perm(p_tenant_id, 'inventory.manage')
     or p_branch_id is not null and not private.has_branch_perm(p_tenant_id, p_branch_id, 'inventory.manage') then
    raise exception 'You do not have permission to manage inventory' using errcode = '42501';
  end if;
  if not private.has_feature(p_tenant_id, 'inventory') then
    raise exception 'Inventory is not included in your plan. Upgrade to use it.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.branch_today(p_branch_id uuid)
returns date
language sql stable security definer
set search_path = ''
as $$
  select (now() at time zone t.timezone)::date
  from public.branches b join public.tenants t on t.id = b.tenant_id where b.id = p_branch_id;
$$;

-- Every stock change goes through here: ledger row + running balance.
create or replace function private.move_stock(
  p_tenant_id uuid, p_branch_id uuid, p_item_id uuid, p_kind public.stock_movement_kind,
  p_quantity numeric, p_unit_cost numeric, p_reason text default null,
  p_purchase_id uuid default null, p_order_item_id uuid default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_quantity = 0 then
    return;
  end if;
  insert into public.stock_movements (tenant_id, branch_id, item_id, kind, quantity, unit_cost_minor, business_date,
                                      purchase_id, order_item_id, reason, created_by)
  values (p_tenant_id, p_branch_id, p_item_id, p_kind, p_quantity, coalesce(p_unit_cost, 0),
          private.branch_today(p_branch_id), p_purchase_id, p_order_item_id, nullif(trim(p_reason), ''), auth.uid());
  insert into public.inventory_stock (tenant_id, branch_id, item_id, quantity)
  values (p_tenant_id, p_branch_id, p_item_id, p_quantity)
  on conflict (branch_id, item_id) do update
    set quantity = public.inventory_stock.quantity + excluded.quantity, updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Items, suppliers, recipes
-- ---------------------------------------------------------------------------
create or replace function public.save_inventory_item(p jsonb)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_tenant uuid := (p ->> 'tenant_id')::uuid;
begin
  perform private.require_inventory(v_tenant);
  if v_id is null then
    insert into public.inventory_items (tenant_id, name, unit, category, sku, avg_cost_minor, reorder_level)
    values (v_tenant, trim(p ->> 'name'), p ->> 'unit', coalesce(trim(p ->> 'category'), ''), nullif(trim(p ->> 'sku'), ''),
            coalesce((p ->> 'avg_cost_minor')::numeric, 0), coalesce((p ->> 'reorder_level')::numeric, 0))
    returning id into v_id;
  else
    update public.inventory_items set
      name = trim(p ->> 'name'), unit = p ->> 'unit', category = coalesce(trim(p ->> 'category'), ''),
      sku = nullif(trim(p ->> 'sku'), ''), reorder_level = coalesce((p ->> 'reorder_level')::numeric, 0),
      is_active = coalesce((p ->> 'is_active')::boolean, true),
      -- Cost can be set by hand until the first purchase sets it.
      avg_cost_minor = case when p ? 'avg_cost_minor' then (p ->> 'avg_cost_minor')::numeric else avg_cost_minor end
    where id = v_id and tenant_id = v_tenant;
    if not found then
      raise exception 'Item not found' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'An item with this name already exists' using errcode = '23505';
end;
$$;

create or replace function public.save_supplier(p jsonb)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_tenant uuid := (p ->> 'tenant_id')::uuid;
begin
  perform private.require_inventory(v_tenant);
  if v_id is null then
    insert into public.suppliers (tenant_id, name, contact_name, phone, ntn, notes)
    values (v_tenant, trim(p ->> 'name'), nullif(trim(p ->> 'contact_name'), ''), nullif(trim(p ->> 'phone'), ''),
            nullif(trim(p ->> 'ntn'), ''), coalesce(p ->> 'notes', ''))
    returning id into v_id;
  else
    update public.suppliers set name = trim(p ->> 'name'), contact_name = nullif(trim(p ->> 'contact_name'), ''),
      phone = nullif(trim(p ->> 'phone'), ''), ntn = nullif(trim(p ->> 'ntn'), ''), notes = coalesce(p ->> 'notes', ''),
      is_active = coalesce((p ->> 'is_active')::boolean, true)
    where id = v_id and tenant_id = v_tenant;
    if not found then
      raise exception 'Supplier not found' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'A supplier with this name already exists' using errcode = '23505';
end;
$$;

-- Replace the recipe of one product, variant or modifier.
-- p_target: {"product_id"} | {"variant_id"} | {"modifier_id"}; p_lines: [{item_id, quantity}]
create or replace function public.save_recipe(p_tenant_id uuid, p_target jsonb, p_lines jsonb)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_product uuid := nullif(p_target ->> 'product_id', '')::uuid;
  v_variant uuid := nullif(p_target ->> 'variant_id', '')::uuid;
  v_modifier uuid := nullif(p_target ->> 'modifier_id', '')::uuid;
begin
  perform private.require_inventory(p_tenant_id);
  if num_nonnulls(v_product, v_variant, v_modifier) <> 1 then
    raise exception 'Choose one product, variant or add-on' using errcode = '22023';
  end if;
  if not (v_product is not null and exists (select 1 from public.products where id = v_product and tenant_id = p_tenant_id)
       or v_variant is not null and exists (select 1 from public.product_variants where id = v_variant and tenant_id = p_tenant_id)
       or v_modifier is not null and exists (select 1 from public.modifiers where id = v_modifier and tenant_id = p_tenant_id)) then
    raise exception 'Menu item not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Recipe lines must be a list' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lines) l
             where not exists (select 1 from public.inventory_items i where i.id = (l ->> 'item_id')::uuid and i.tenant_id = p_tenant_id)
                or coalesce((l ->> 'quantity')::numeric, 0) <= 0) then
    raise exception 'Each line needs an ingredient and a quantity above zero' using errcode = '22023';
  end if;

  delete from public.recipe_items
  where tenant_id = p_tenant_id and (product_id = v_product or variant_id = v_variant or modifier_id = v_modifier);
  insert into public.recipe_items (tenant_id, product_id, variant_id, modifier_id, item_id, quantity)
  select p_tenant_id, v_product, v_variant, v_modifier, (l ->> 'item_id')::uuid, sum((l ->> 'quantity')::numeric)
  from jsonb_array_elements(p_lines) l
  group by (l ->> 'item_id')::uuid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Purchases
-- ---------------------------------------------------------------------------
-- Create or update a purchase order (draft). p: {id?, tenant_id, branch_id,
-- supplier_id?, reference?, notes?, items: [{item_id, quantity, total_minor}]}
create or replace function public.save_purchase(p jsonb)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_tenant uuid := (p ->> 'tenant_id')::uuid;
  v_branch uuid := (p ->> 'branch_id')::uuid;
begin
  perform private.require_inventory(v_tenant, v_branch);
  if jsonb_typeof(p -> 'items') <> 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception 'Add at least one item' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p -> 'items') l
             where coalesce((l ->> 'quantity')::numeric, 0) <= 0 or coalesce((l ->> 'total_minor')::bigint, -1) < 0
                or not exists (select 1 from public.inventory_items i where i.id = (l ->> 'item_id')::uuid and i.tenant_id = v_tenant)) then
    raise exception 'Each line needs an item, a quantity above zero and a cost' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.purchases (tenant_id, branch_id, supplier_id, reference, notes, created_by)
    values (v_tenant, v_branch, nullif(p ->> 'supplier_id', '')::uuid, nullif(trim(p ->> 'reference'), ''),
            coalesce(p ->> 'notes', ''), auth.uid())
    returning id into v_id;
  else
    update public.purchases set supplier_id = nullif(p ->> 'supplier_id', '')::uuid,
      reference = nullif(trim(p ->> 'reference'), ''), notes = coalesce(p ->> 'notes', '')
    where id = v_id and tenant_id = v_tenant and branch_id = v_branch and status = 'draft';
    if not found then
      raise exception 'Only draft purchase orders can be changed' using errcode = 'P0001';
    end if;
    delete from public.purchase_items where purchase_id = v_id;
  end if;
  insert into public.purchase_items (tenant_id, purchase_id, item_id, quantity, total_minor)
  select v_tenant, v_id, (l ->> 'item_id')::uuid, (l ->> 'quantity')::numeric, (l ->> 'total_minor')::bigint
  from jsonb_array_elements(p -> 'items') l;
  update public.purchases set total_minor = (select coalesce(sum(total_minor), 0) from public.purchase_items where purchase_id = v_id)
  where id = v_id;
  return v_id;
end;
$$;

-- Goods received: stock in at the purchase cost, moving-average cost updated.
create or replace function public.receive_purchase(p_purchase_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v public.purchases;
  l record;
  v_on_hand numeric;
  v_cost numeric;
begin
  select * into v from public.purchases where id = p_purchase_id for update;
  if v.id is null then
    raise exception 'Purchase not found' using errcode = 'P0002';
  end if;
  perform private.require_inventory(v.tenant_id, v.branch_id);
  if v.status <> 'draft' then
    raise exception 'This purchase is already %', v.status using errcode = 'P0001';
  end if;

  for l in
    select pi.item_id, sum(pi.quantity) as quantity, sum(pi.total_minor) as total_minor
    from public.purchase_items pi where pi.purchase_id = v.id group by pi.item_id
  loop
    select coalesce(sum(quantity), 0) into v_on_hand from public.inventory_stock where item_id = l.item_id;
    v_cost := l.total_minor / l.quantity;
    update public.inventory_items set avg_cost_minor = round(case
        when v_on_hand <= 0 then v_cost
        else (v_on_hand * avg_cost_minor + l.total_minor) / (v_on_hand + l.quantity) end, 4)
    where id = l.item_id;
    perform private.move_stock(v.tenant_id, v.branch_id, l.item_id, 'purchase', l.quantity, round(v_cost, 4),
                               v.reference, v.id, null);
  end loop;

  update public.purchases set status = 'received', received_at = now(), received_by = auth.uid() where id = v.id;
end;
$$;

create or replace function public.cancel_purchase(p_purchase_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v public.purchases;
begin
  select * into v from public.purchases where id = p_purchase_id for update;
  if v.id is null then
    raise exception 'Purchase not found' using errcode = 'P0002';
  end if;
  perform private.require_inventory(v.tenant_id, v.branch_id);
  if v.status <> 'draft' then
    raise exception 'Only draft purchase orders can be cancelled' using errcode = 'P0001';
  end if;
  update public.purchases set status = 'cancelled' where id = v.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Wastage and stock counts
-- ---------------------------------------------------------------------------
create or replace function public.record_wastage(p_branch_id uuid, p_item_id uuid, p_quantity numeric, p_reason text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_item public.inventory_items;
begin
  select i.* into v_item from public.inventory_items i join public.branches b on b.tenant_id = i.tenant_id
  where i.id = p_item_id and b.id = p_branch_id;
  if v_item.id is null then
    raise exception 'Item not found' using errcode = 'P0002';
  end if;
  perform private.require_inventory(v_item.tenant_id, p_branch_id);
  if coalesce(p_quantity, 0) <= 0 then
    raise exception 'Quantity must be more than zero' using errcode = '22023';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why it was wasted' using errcode = '22023';
  end if;
  perform private.move_stock(v_item.tenant_id, p_branch_id, v_item.id, 'wastage', -p_quantity, v_item.avg_cost_minor, p_reason);
end;
$$;

-- Physical count: [{item_id, counted}] → one 'count' movement per difference.
create or replace function public.count_stock(p_branch_id uuid, p_counts jsonb, p_note text default null)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tenant uuid := (select tenant_id from public.branches where id = p_branch_id);
  c record;
  v_changed int := 0;
begin
  if v_tenant is null then
    raise exception 'Branch not found' using errcode = 'P0002';
  end if;
  perform private.require_inventory(v_tenant, p_branch_id);
  for c in
    select i.id, i.avg_cost_minor, (x ->> 'counted')::numeric as counted, coalesce(s.quantity, 0) as on_hand
    from jsonb_array_elements(p_counts) x
    join public.inventory_items i on i.id = (x ->> 'item_id')::uuid and i.tenant_id = v_tenant
    left join public.inventory_stock s on s.item_id = i.id and s.branch_id = p_branch_id
  loop
    if c.counted is null or c.counted < 0 then
      raise exception 'Counts must be zero or more' using errcode = '22023';
    end if;
    if c.counted <> c.on_hand then
      perform private.move_stock(v_tenant, p_branch_id, c.id, 'count', c.counted - c.on_hand, c.avg_cost_minor,
                                 coalesce(nullif(trim(p_note), ''), 'Stock count'));
      v_changed := v_changed + 1;
    end if;
  end loop;
  return v_changed;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sales deduct stock; cancellations put it back
-- ---------------------------------------------------------------------------
create or replace function private.deduct_for_item(p_item public.order_items, p_lines jsonb)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_branch uuid := (select branch_id from public.orders where id = p_item.order_id);
  l record;
begin
  for l in
    select r.item_id, sum(r.quantity) as quantity, i.avg_cost_minor
    from jsonb_to_recordset(p_lines) as r(item_id uuid, quantity numeric)
    join public.inventory_items i on i.id = r.item_id
    group by r.item_id, i.avg_cost_minor
  loop
    perform private.move_stock(p_item.tenant_id, v_branch, l.item_id, 'sale', -(l.quantity * p_item.quantity),
                               l.avg_cost_minor, null, null, p_item.id);
  end loop;
end;
$$;

create or replace function private.stock_on_order_item()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_lines jsonb;
begin
  if not private.has_feature(new.tenant_id, 'inventory') or new.status = 'cancelled' then
    return null;
  end if;
  -- Variant recipe overrides the product recipe.
  select jsonb_agg(jsonb_build_object('item_id', item_id, 'quantity', quantity)) into v_lines
  from public.recipe_items where new.variant_id is not null and variant_id = new.variant_id;
  if v_lines is null then
    select jsonb_agg(jsonb_build_object('item_id', item_id, 'quantity', quantity)) into v_lines
    from public.recipe_items where product_id = new.product_id;
  end if;
  if v_lines is not null then
    perform private.deduct_for_item(new, v_lines);
  end if;
  return null;
end;
$$;
create trigger order_items_deduct_stock after insert on public.order_items
  for each row execute function private.stock_on_order_item();

create or replace function private.stock_on_order_item_modifier()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_item public.order_items;
  v_lines jsonb;
begin
  select * into v_item from public.order_items where id = new.order_item_id;
  if new.modifier_id is null or v_item.status = 'cancelled' or not private.has_feature(new.tenant_id, 'inventory') then
    return null;
  end if;
  select jsonb_agg(jsonb_build_object('item_id', item_id, 'quantity', quantity)) into v_lines
  from public.recipe_items where modifier_id = new.modifier_id;
  if v_lines is not null then
    perform private.deduct_for_item(v_item, v_lines);
  end if;
  return null;
end;
$$;
create trigger order_item_modifiers_deduct_stock after insert on public.order_item_modifiers
  for each row execute function private.stock_on_order_item_modifier();

create or replace function private.stock_on_item_cancel()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  m record;
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    -- Put back exactly what this item took, at the cost it was taken at.
    for m in
      select branch_id, item_id, unit_cost_minor, -sum(quantity) as quantity
      from public.stock_movements
      where order_item_id = new.id and kind in ('sale', 'sale_reversal')
      group by branch_id, item_id, unit_cost_minor
      having sum(quantity) <> 0
    loop
      perform private.move_stock(new.tenant_id, m.branch_id, m.item_id, 'sale_reversal', m.quantity, m.unit_cost_minor,
                                 'Cancelled', null, new.id);
    end loop;
  end if;
  return null;
end;
$$;
create trigger order_items_return_stock after update of status on public.order_items
  for each row execute function private.stock_on_item_cancel();

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------
create or replace function public.save_expense(p jsonb)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_tenant uuid := (p ->> 'tenant_id')::uuid;
  v_branch uuid := (p ->> 'branch_id')::uuid;
begin
  perform private.require_inventory(v_tenant, v_branch);
  if v_id is null then
    insert into public.expenses (tenant_id, branch_id, category, amount_minor, spent_on, paid_to, note, created_by)
    values (v_tenant, v_branch, p ->> 'category', (p ->> 'amount_minor')::bigint,
            coalesce((p ->> 'spent_on')::date, private.branch_today(v_branch)),
            nullif(trim(p ->> 'paid_to'), ''), coalesce(p ->> 'note', ''), auth.uid())
    returning id into v_id;
  else
    update public.expenses set category = p ->> 'category', amount_minor = (p ->> 'amount_minor')::bigint,
      spent_on = (p ->> 'spent_on')::date, paid_to = nullif(trim(p ->> 'paid_to'), ''), note = coalesce(p ->> 'note', '')
    where id = v_id and tenant_id = v_tenant and branch_id = v_branch;
    if not found then
      raise exception 'Expense not found' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.delete_expense(p_expense_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v public.expenses;
begin
  select * into v from public.expenses where id = p_expense_id;
  if v.id is null then
    raise exception 'Expense not found' using errcode = 'P0002';
  end if;
  perform private.require_inventory(v.tenant_id, v.branch_id);
  delete from public.expenses where id = v.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Costing and reports
-- ---------------------------------------------------------------------------
-- Food cost per menu item (and variant) from recipes × average cost.
create or replace function public.menu_costing(p_tenant_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with cost_of as (
    select coalesce(r.product_id, r.variant_id) as target, round(sum(r.quantity * i.avg_cost_minor))::bigint as cost_minor,
           count(*) as lines
    from public.recipe_items r join public.inventory_items i on i.id = r.item_id
    where r.tenant_id = p_tenant_id and r.modifier_id is null
    group by 1
  ), rows as (
    select p.id as product_id, null::uuid as variant_id, p.name, c2.name as category, p.price_minor,
           pc.cost_minor, coalesce(pc.lines, 0) as lines, p.sort_order, 0 as vsort
    from public.products p
    left join public.categories c2 on c2.id = p.category_id
    left join cost_of pc on pc.target = p.id
    where p.tenant_id = p_tenant_id and p.is_active
    union all
    select p.id, v.id, p.name || ' (' || v.name || ')', c2.name, v.price_minor,
           coalesce(vc.cost_minor, pc.cost_minor), coalesce(vc.lines, pc.lines, 0), p.sort_order, v.sort_order + 1
    from public.product_variants v
    join public.products p on p.id = v.product_id
    left join public.categories c2 on c2.id = p.category_id
    left join cost_of vc on vc.target = v.id
    left join cost_of pc on pc.target = p.id
    where p.tenant_id = p_tenant_id and p.is_active
  )
  select case when private.has_perm(p_tenant_id, 'inventory.view') or private.has_perm(p_tenant_id, 'menu.manage') then
    coalesce(jsonb_agg(jsonb_build_object(
      'product_id', product_id, 'variant_id', variant_id, 'name', name, 'category', category,
      'price_minor', price_minor, 'cost_minor', cost_minor, 'has_recipe', lines > 0,
      'margin_pct', case when cost_minor is not null and price_minor > 0
                         then round((price_minor - cost_minor) * 100.0 / price_minor, 1) end)
      order by category nulls last, sort_order, name, vsort), '[]')
  end
  from rows;
$$;

-- Profit & loss for a period: net sales − cost of food sold − wastage − expenses.
create or replace function public.profit_loss(p_tenant_id uuid, p_branch_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_branches uuid[] := private.report_branches(p_tenant_id, p_branch_id);
  v_sales bigint;
  v_cogs bigint;
  v_waste bigint;
  v_count bigint;
  v_expenses jsonb;
  v_exp_total bigint;
begin
  if cardinality(v_branches) = 0 or p_branch_id is not null and not (p_branch_id = any (v_branches)) then
    raise exception 'You do not have permission to view reports' using errcode = '42501';
  end if;
  if not private.has_feature(p_tenant_id, 'inventory') then
    raise exception 'Profit & loss needs inventory, which is not in your plan.' using errcode = 'P0001';
  end if;
  if p_from > p_to or p_to - p_from > 366 then
    raise exception 'Choose a range of up to one year' using errcode = '22023';
  end if;

  select coalesce(sum(p.base_minor), 0) into v_sales
  from public.payments p join public.bills b on b.id = p.bill_id
  where b.branch_id = any (v_branches) and b.business_date between p_from and p_to and p.status = 'completed';

  select coalesce(round(sum(-quantity * unit_cost_minor) filter (where kind in ('sale', 'sale_reversal'))), 0),
         coalesce(round(sum(-quantity * unit_cost_minor) filter (where kind = 'wastage')), 0),
         coalesce(round(sum(-quantity * unit_cost_minor) filter (where kind in ('count', 'adjustment'))), 0)
  into v_cogs, v_waste, v_count
  from public.stock_movements
  where branch_id = any (v_branches) and business_date between p_from and p_to;

  select coalesce(jsonb_agg(jsonb_build_object('category', category, 'amount_minor', amount) order by amount desc), '[]'),
         coalesce(sum(amount), 0)
  into v_expenses, v_exp_total
  from (select category, sum(amount_minor) as amount from public.expenses
        where branch_id = any (v_branches) and spent_on between p_from and p_to group by category) e;

  return jsonb_build_object(
    'net_sales_minor', v_sales,
    'food_cost_minor', v_cogs,
    'wastage_minor', v_waste,
    'stock_count_minor', v_count,
    'gross_profit_minor', v_sales - v_cogs - v_waste - v_count,
    'expenses', v_expenses,
    'expenses_minor', v_exp_total,
    'net_profit_minor', v_sales - v_cogs - v_waste - v_count - v_exp_total,
    'food_cost_pct', case when v_sales > 0 then round(v_cogs * 100.0 / v_sales, 1) end);
end;
$$;

-- Ingredient usage for a period (what was used, wasted, bought).
create or replace function public.inventory_report(p_tenant_id uuid, p_branch_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_branches uuid[];
begin
  select coalesce(array_agg(b.id), '{}') into v_branches from public.branches b
  where b.tenant_id = p_tenant_id and (p_branch_id is null or b.id = p_branch_id)
    and private.has_branch_perm(p_tenant_id, b.id, 'inventory.view');
  if cardinality(v_branches) = 0 then
    raise exception 'You do not have permission to view inventory' using errcode = '42501';
  end if;
  if p_from > p_to or p_to - p_from > 366 then
    raise exception 'Choose a range of up to one year' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) - 'sort_cost' order by x.sort_cost desc, x.name)
    from (
      select i.id as item_id, i.name, i.unit,
        coalesce(-sum(m.quantity) filter (where m.kind in ('sale', 'sale_reversal')), 0) as used,
        coalesce(round(-sum(m.quantity * m.unit_cost_minor) filter (where m.kind in ('sale', 'sale_reversal'))), 0) as used_cost_minor,
        coalesce(-sum(m.quantity) filter (where m.kind = 'wastage'), 0) as wasted,
        coalesce(round(-sum(m.quantity * m.unit_cost_minor) filter (where m.kind = 'wastage')), 0) as wasted_cost_minor,
        coalesce(sum(m.quantity) filter (where m.kind = 'purchase'), 0) as purchased,
        coalesce(round(sum(m.quantity * m.unit_cost_minor) filter (where m.kind = 'purchase')), 0) as purchased_cost_minor,
        coalesce(-sum(m.quantity * m.unit_cost_minor) filter (where m.kind in ('sale', 'sale_reversal', 'wastage')), 0) as sort_cost
      from public.inventory_items i
      join public.stock_movements m on m.item_id = i.id
      where i.tenant_id = p_tenant_id and m.branch_id = any (v_branches) and m.business_date between p_from and p_to
      group by i.id, i.name, i.unit
    ) x), '[]');
end;
$$;

-- Items at or below their reorder level, per branch the caller can see.
create or replace function public.low_stock(p_tenant_id uuid, p_branch_id uuid default null)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'item_id', i.id, 'name', i.name, 'unit', i.unit, 'branch_id', b.id, 'branch', b.name,
    'quantity', coalesce(s.quantity, 0), 'reorder_level', i.reorder_level) order by b.name, i.name), '[]')
  from public.inventory_items i
  join public.branches b on b.tenant_id = i.tenant_id and (p_branch_id is null or b.id = p_branch_id)
  left join public.inventory_stock s on s.item_id = i.id and s.branch_id = b.id
  where i.tenant_id = p_tenant_id and i.is_active and i.reorder_level > 0
    and coalesce(s.quantity, 0) <= i.reorder_level
    and private.has_branch_perm(p_tenant_id, b.id, 'inventory.view')
    and private.has_feature(p_tenant_id, 'inventory');
$$;

revoke execute on function public.save_inventory_item(jsonb), public.save_supplier(jsonb), public.save_recipe(uuid, jsonb, jsonb),
  public.save_purchase(jsonb), public.receive_purchase(uuid), public.cancel_purchase(uuid),
  public.record_wastage(uuid, uuid, numeric, text), public.count_stock(uuid, jsonb, text),
  public.save_expense(jsonb), public.delete_expense(uuid), public.menu_costing(uuid),
  public.profit_loss(uuid, uuid, date, date), public.inventory_report(uuid, uuid, date, date),
  public.low_stock(uuid, uuid) from public, anon;
grant execute on function public.save_inventory_item(jsonb), public.save_supplier(jsonb), public.save_recipe(uuid, jsonb, jsonb),
  public.save_purchase(jsonb), public.receive_purchase(uuid), public.cancel_purchase(uuid),
  public.record_wastage(uuid, uuid, numeric, text), public.count_stock(uuid, jsonb, text),
  public.save_expense(jsonb), public.delete_expense(uuid), public.menu_costing(uuid),
  public.profit_loss(uuid, uuid, date, date), public.inventory_report(uuid, uuid, date, date),
  public.low_stock(uuid, uuid) to authenticated;
