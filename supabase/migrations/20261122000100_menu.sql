-- =============================================================================
-- Phase 2 · Menu: kitchen stations, categories, products, variants,
-- modifier (add-on) groups, per-branch overrides, translations, images.
--
-- Prices are integer minor units (paisa / cents).
-- Translations: jsonb keyed by language, e.g.
--   {"ur": {"name": "چکن تکہ", "description": "..."}}
-- =============================================================================

create or replace function private.valid_translations(t jsonb)
returns boolean
language sql immutable
set search_path = ''
as $$
  select jsonb_typeof(t) = 'object'
     and not exists (
       select 1 from jsonb_each(t) e
       where e.key !~ '^[a-z]{2}$'
          or jsonb_typeof(e.value) <> 'object'
          or char_length(coalesce(e.value ->> 'name', '')) > 120
          or char_length(coalesce(e.value ->> 'description', '')) > 1000
     );
$$;

-- ---------------------------------------------------------------------------
-- Kitchen stations (BBQ, Fast Food, Drinks, Desserts...)
-- ---------------------------------------------------------------------------
create table public.kitchen_stations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, name)
);
create trigger kitchen_stations_updated_at before update on public.kitchen_stations
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Categories (one level of subcategories via parent_id)
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  parent_id uuid,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  image_path text,
  translations jsonb not null default '{}'::jsonb check (private.valid_translations(translations)),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  check (parent_id is null or parent_id <> id),
  foreign key (parent_id, tenant_id) references public.categories (id, tenant_id) on delete restrict
);
create index categories_tenant_idx on public.categories (tenant_id, sort_order);
create trigger categories_updated_at before update on public.categories
  for each row execute function private.set_updated_at();

-- Only one level of nesting keeps menus simple to browse on a phone.
create or replace function private.enforce_category_depth()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is not null and exists (
    select 1 from public.categories c where c.id = new.parent_id and c.parent_id is not null
  ) then
    raise exception 'Subcategories cannot have their own subcategories' using errcode = '22023';
  end if;
  if new.parent_id is not null and exists (
    select 1 from public.categories c where c.parent_id = new.id
  ) then
    raise exception 'A category with subcategories cannot become a subcategory' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger categories_depth before insert or update of parent_id on public.categories
  for each row execute function private.enforce_category_depth();

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  category_id uuid not null,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  image_path text,
  -- Base price; when the product has variants, each variant carries its own.
  price_minor bigint not null default 0 check (price_minor between 0 and 100000000000),
  -- Optional "was" price, shown struck through to advertise a discount.
  compare_at_price_minor bigint check (compare_at_price_minor is null or compare_at_price_minor > price_minor),
  sku text check (sku is null or char_length(sku) <= 40),
  kitchen_station_id uuid,
  tags text[] not null default '{}'
    check (tags <@ array['vegetarian', 'vegan', 'spicy', 'popular', 'new', 'halal', 'gluten_free']),
  prep_time_minutes int check (prep_time_minutes is null or prep_time_minutes between 0 and 240),
  translations jsonb not null default '{}'::jsonb check (private.valid_translations(translations)),
  -- Quick "sold out today" switch, used often during service.
  is_available boolean not null default true,
  -- Hidden from menus entirely (archived).
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (category_id, tenant_id) references public.categories (id, tenant_id) on delete restrict,
  foreign key (kitchen_station_id, tenant_id) references public.kitchen_stations (id, tenant_id)
    on delete set null (kitchen_station_id)
);
create index products_tenant_category_idx on public.products (tenant_id, category_id, sort_order);
create unique index products_tenant_sku_key on public.products (tenant_id, sku) where sku is not null;
create trigger products_updated_at before update on public.products
  for each row execute function private.set_updated_at();

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  product_id uuid not null,
  name text not null check (char_length(name) between 1 and 60),
  price_minor bigint not null check (price_minor between 0 and 100000000000),
  translations jsonb not null default '{}'::jsonb check (private.valid_translations(translations)),
  is_default boolean not null default false,
  sort_order int not null default 0,
  unique (product_id, name),
  foreign key (product_id, tenant_id) references public.products (id, tenant_id) on delete cascade
);
create index product_variants_product_idx on public.product_variants (product_id);
create unique index product_variants_one_default on public.product_variants (product_id) where is_default;

-- ---------------------------------------------------------------------------
-- Modifier groups ("Choose your sauce", "Extra toppings") and options
-- ---------------------------------------------------------------------------
create table public.modifier_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  translations jsonb not null default '{}'::jsonb check (private.valid_translations(translations)),
  min_select int not null default 0 check (min_select between 0 and 20),
  max_select int not null default 1 check (max_select between 1 and 20),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  check (max_select >= min_select)
);
create trigger modifier_groups_updated_at before update on public.modifier_groups
  for each row execute function private.set_updated_at();

create table public.modifiers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  group_id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  price_minor bigint not null default 0 check (price_minor between 0 and 100000000000),
  translations jsonb not null default '{}'::jsonb check (private.valid_translations(translations)),
  is_available boolean not null default true,
  sort_order int not null default 0,
  unique (group_id, name),
  foreign key (group_id, tenant_id) references public.modifier_groups (id, tenant_id) on delete cascade
);
create index modifiers_group_idx on public.modifiers (group_id);

create table public.product_modifier_groups (
  product_id uuid not null,
  group_id uuid not null,
  tenant_id uuid not null,
  sort_order int not null default 0,
  primary key (product_id, group_id),
  foreign key (product_id, tenant_id) references public.products (id, tenant_id) on delete cascade,
  foreign key (group_id, tenant_id) references public.modifier_groups (id, tenant_id) on delete cascade
);
create index product_modifier_groups_group_idx on public.product_modifier_groups (group_id);

-- ---------------------------------------------------------------------------
-- Per-branch overrides (price and/or availability). Null = use default.
-- ---------------------------------------------------------------------------
create table public.product_branch_overrides (
  product_id uuid not null,
  branch_id uuid not null,
  tenant_id uuid not null,
  price_minor bigint check (price_minor is null or price_minor between 0 and 100000000000),
  is_available boolean,
  updated_at timestamptz not null default now(),
  primary key (product_id, branch_id),
  foreign key (product_id, tenant_id) references public.products (id, tenant_id) on delete cascade,
  foreign key (branch_id, tenant_id) references public.branches (id, tenant_id) on delete cascade
);
create index product_branch_overrides_branch_idx on public.product_branch_overrides (branch_id);
create trigger product_branch_overrides_updated_at before update on public.product_branch_overrides
  for each row execute function private.set_updated_at();

-- Price history matters: audit product and override changes.
create trigger audit_products after insert or update or delete on public.products
  for each row execute function private.audit_row();
create trigger audit_product_branch_overrides after insert or update or delete on public.product_branch_overrides
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- Privileges: reads for anyone with menu.view; writes need menu.manage.
--
-- Supabase grants ALL on new public tables to anon/authenticated by default.
-- Stop that for every future table (each migration must grant explicitly),
-- and strip it from the tables above before granting column by column.
-- ---------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;

revoke all on public.kitchen_stations, public.categories, public.products, public.product_variants,
  public.modifier_groups, public.modifiers, public.product_modifier_groups,
  public.product_branch_overrides from anon, authenticated;

-- ---------------------------------------------------------------------------
-- tenant_id is insert-only (never updatable).
-- ---------------------------------------------------------------------------
grant select, delete on public.kitchen_stations, public.categories, public.products,
  public.product_variants, public.modifier_groups, public.modifiers,
  public.product_modifier_groups, public.product_branch_overrides to authenticated;

grant insert (tenant_id, name, sort_order, is_active) on public.kitchen_stations to authenticated;
grant update (name, sort_order, is_active) on public.kitchen_stations to authenticated;

grant insert (tenant_id, parent_id, name, description, image_path, translations, sort_order, is_active)
  on public.categories to authenticated;
grant update (parent_id, name, description, image_path, translations, sort_order, is_active)
  on public.categories to authenticated;

grant insert (id, tenant_id, category_id, name, description, image_path, price_minor, compare_at_price_minor,
              sku, kitchen_station_id, tags, prep_time_minutes, translations, is_available, is_active, sort_order)
  on public.products to authenticated;
grant update (category_id, name, description, image_path, price_minor, compare_at_price_minor,
              sku, kitchen_station_id, tags, prep_time_minutes, translations, is_available, is_active, sort_order)
  on public.products to authenticated;

grant insert (id, tenant_id, product_id, name, price_minor, translations, is_default, sort_order)
  on public.product_variants to authenticated;
grant update (name, price_minor, translations, is_default, sort_order) on public.product_variants to authenticated;

grant insert (id, tenant_id, name, translations, min_select, max_select, sort_order)
  on public.modifier_groups to authenticated;
grant update (name, translations, min_select, max_select, sort_order) on public.modifier_groups to authenticated;

grant insert (id, tenant_id, group_id, name, price_minor, translations, is_available, sort_order)
  on public.modifiers to authenticated;
grant update (name, price_minor, translations, is_available, sort_order) on public.modifiers to authenticated;

grant insert (product_id, group_id, tenant_id, sort_order) on public.product_modifier_groups to authenticated;
grant update (sort_order) on public.product_modifier_groups to authenticated;

grant insert (product_id, branch_id, tenant_id, price_minor, is_available)
  on public.product_branch_overrides to authenticated;
grant update (price_minor, is_available) on public.product_branch_overrides to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['kitchen_stations', 'categories', 'products', 'product_variants',
                           'modifier_groups', 'modifiers', 'product_modifier_groups'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy %1$s_select on public.%1$I for select to authenticated
                     using (private.has_perm(tenant_id, 'menu.view') or private.has_perm(tenant_id, 'menu.manage'))$p$, t);
    execute format($p$create policy %1$s_insert on public.%1$I for insert to authenticated
                     with check (private.has_perm(tenant_id, 'menu.manage'))$p$, t);
    execute format($p$create policy %1$s_update on public.%1$I for update to authenticated
                     using (private.has_perm(tenant_id, 'menu.manage'))
                     with check (private.has_perm(tenant_id, 'menu.manage'))$p$, t);
    execute format($p$create policy %1$s_delete on public.%1$I for delete to authenticated
                     using (private.has_perm(tenant_id, 'menu.manage'))$p$, t);
  end loop;
end;
$$;

-- Branch overrides: managers may only touch branches they have access to.
alter table public.product_branch_overrides enable row level security;
create policy product_branch_overrides_select on public.product_branch_overrides for select to authenticated
  using (private.has_perm(tenant_id, 'menu.view') or private.has_perm(tenant_id, 'menu.manage'));
create policy product_branch_overrides_insert on public.product_branch_overrides for insert to authenticated
  with check (private.has_branch_perm(tenant_id, branch_id, 'menu.manage'));
create policy product_branch_overrides_update on public.product_branch_overrides for update to authenticated
  using (private.has_branch_perm(tenant_id, branch_id, 'menu.manage'))
  with check (private.has_branch_perm(tenant_id, branch_id, 'menu.manage'));
create policy product_branch_overrides_delete on public.product_branch_overrides for delete to authenticated
  using (private.has_branch_perm(tenant_id, branch_id, 'menu.manage'));

-- ---------------------------------------------------------------------------
-- save_product: product + variants + add-on groups in one transaction.
-- SECURITY INVOKER: runs as the caller, so every statement is checked by the
-- RLS policies and column grants above. No privilege is borrowed.
-- ---------------------------------------------------------------------------
create or replace function public.save_product(
  p_product jsonb,
  p_variants jsonb default '[]'::jsonb,
  p_group_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_product ->> 'id', '')::uuid;
  v_tenant uuid := (p_product ->> 'tenant_id')::uuid;
  v_keep uuid[];
  v_variant jsonb;
  v_i int := 0;
begin
  if jsonb_typeof(p_variants) <> 'array' then
    raise exception 'Variants must be a list' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(p_variants) v where (v ->> 'is_default')::boolean) > 1 then
    raise exception 'Only one variant can be the default' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.products (tenant_id, category_id, name, description, image_path, price_minor,
      compare_at_price_minor, sku, kitchen_station_id, tags, prep_time_minutes, translations,
      is_available, is_active, sort_order)
    values (
      v_tenant,
      (p_product ->> 'category_id')::uuid,
      trim(p_product ->> 'name'),
      coalesce(p_product ->> 'description', ''),
      nullif(p_product ->> 'image_path', ''),
      coalesce((p_product ->> 'price_minor')::bigint, 0),
      (p_product ->> 'compare_at_price_minor')::bigint,
      nullif(trim(p_product ->> 'sku'), ''),
      nullif(p_product ->> 'kitchen_station_id', '')::uuid,
      coalesce(array(select jsonb_array_elements_text(p_product -> 'tags')), '{}'),
      (p_product ->> 'prep_time_minutes')::int,
      coalesce(p_product -> 'translations', '{}'::jsonb),
      coalesce((p_product ->> 'is_available')::boolean, true),
      coalesce((p_product ->> 'is_active')::boolean, true),
      coalesce((p_product ->> 'sort_order')::int,
               (select coalesce(max(sort_order), 0) + 1 from public.products
                where category_id = (p_product ->> 'category_id')::uuid))
    )
    returning id, tenant_id into v_id, v_tenant;
  else
    update public.products set
      category_id = (p_product ->> 'category_id')::uuid,
      name = trim(p_product ->> 'name'),
      description = coalesce(p_product ->> 'description', ''),
      image_path = nullif(p_product ->> 'image_path', ''),
      price_minor = coalesce((p_product ->> 'price_minor')::bigint, 0),
      compare_at_price_minor = (p_product ->> 'compare_at_price_minor')::bigint,
      sku = nullif(trim(p_product ->> 'sku'), ''),
      kitchen_station_id = nullif(p_product ->> 'kitchen_station_id', '')::uuid,
      tags = coalesce(array(select jsonb_array_elements_text(p_product -> 'tags')), '{}'),
      prep_time_minutes = (p_product ->> 'prep_time_minutes')::int,
      translations = coalesce(p_product -> 'translations', '{}'::jsonb),
      is_available = coalesce((p_product ->> 'is_available')::boolean, true),
      is_active = coalesce((p_product ->> 'is_active')::boolean, true)
    where id = v_id
    returning tenant_id into v_tenant;
    if v_tenant is null then
      raise exception 'Menu item not found' using errcode = 'P0002';
    end if;
  end if;

  -- Variants: update existing (by id), insert new, delete removed.
  select coalesce(array_agg((v ->> 'id')::uuid), '{}') into v_keep
  from jsonb_array_elements(p_variants) v where nullif(v ->> 'id', '') is not null;
  delete from public.product_variants where product_id = v_id and not (id = any (v_keep));
  -- Clear defaults first so the unique "one default" index never trips mid-update.
  update public.product_variants set is_default = false where product_id = v_id;

  for v_variant in select * from jsonb_array_elements(p_variants) loop
    v_i := v_i + 1;
    if nullif(v_variant ->> 'id', '') is null then
      insert into public.product_variants (tenant_id, product_id, name, price_minor, translations, is_default, sort_order)
      values (v_tenant, v_id, trim(v_variant ->> 'name'), (v_variant ->> 'price_minor')::bigint,
              coalesce(v_variant -> 'translations', '{}'::jsonb),
              coalesce((v_variant ->> 'is_default')::boolean, false), v_i);
    else
      update public.product_variants set
        name = trim(v_variant ->> 'name'),
        price_minor = (v_variant ->> 'price_minor')::bigint,
        translations = coalesce(v_variant -> 'translations', '{}'::jsonb),
        is_default = coalesce((v_variant ->> 'is_default')::boolean, false),
        sort_order = v_i
      where id = (v_variant ->> 'id')::uuid and product_id = v_id;
    end if;
  end loop;

  -- Add-on groups: replace the set, keeping the given order.
  delete from public.product_modifier_groups where product_id = v_id;
  insert into public.product_modifier_groups (product_id, group_id, tenant_id, sort_order)
  select v_id, g.id, v_tenant, g.ord
  from unnest(p_group_ids) with ordinality as g(id, ord);

  return v_id;
end;
$$;

-- save_modifier_group: group + its options atomically (also SECURITY INVOKER).
create or replace function public.save_modifier_group(p_group jsonb, p_modifiers jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_group ->> 'id', '')::uuid;
  v_tenant uuid := (p_group ->> 'tenant_id')::uuid;
  v_keep uuid[];
  v_m jsonb;
  v_i int := 0;
begin
  if jsonb_typeof(p_modifiers) <> 'array' or jsonb_array_length(p_modifiers) = 0 then
    raise exception 'Add at least one option' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.modifier_groups (tenant_id, name, translations, min_select, max_select)
    values (v_tenant, trim(p_group ->> 'name'), coalesce(p_group -> 'translations', '{}'::jsonb),
            coalesce((p_group ->> 'min_select')::int, 0), coalesce((p_group ->> 'max_select')::int, 1))
    returning id, tenant_id into v_id, v_tenant;
  else
    update public.modifier_groups set
      name = trim(p_group ->> 'name'),
      translations = coalesce(p_group -> 'translations', '{}'::jsonb),
      min_select = coalesce((p_group ->> 'min_select')::int, 0),
      max_select = coalesce((p_group ->> 'max_select')::int, 1)
    where id = v_id
    returning tenant_id into v_tenant;
    if v_tenant is null then
      raise exception 'Add-on group not found' using errcode = 'P0002';
    end if;
  end if;

  if (select coalesce((p_group ->> 'min_select')::int, 0)) > jsonb_array_length(p_modifiers) then
    raise exception 'Minimum choices is more than the number of options' using errcode = '22023';
  end if;

  select coalesce(array_agg((m ->> 'id')::uuid), '{}') into v_keep
  from jsonb_array_elements(p_modifiers) m where nullif(m ->> 'id', '') is not null;
  delete from public.modifiers where group_id = v_id and not (id = any (v_keep));

  for v_m in select * from jsonb_array_elements(p_modifiers) loop
    v_i := v_i + 1;
    if nullif(v_m ->> 'id', '') is null then
      insert into public.modifiers (tenant_id, group_id, name, price_minor, translations, is_available, sort_order)
      values (v_tenant, v_id, trim(v_m ->> 'name'), coalesce((v_m ->> 'price_minor')::bigint, 0),
              coalesce(v_m -> 'translations', '{}'::jsonb), coalesce((v_m ->> 'is_available')::boolean, true), v_i);
    else
      update public.modifiers set
        name = trim(v_m ->> 'name'),
        price_minor = coalesce((v_m ->> 'price_minor')::bigint, 0),
        translations = coalesce(v_m -> 'translations', '{}'::jsonb),
        is_available = coalesce((v_m ->> 'is_available')::boolean, true),
        sort_order = v_i
      where id = (v_m ->> 'id')::uuid and group_id = v_id;
    end if;
  end loop;

  return v_id;
end;
$$;

-- reorder_menu: set sort_order from an ordered list of ids (invoker → RLS applies).
create or replace function public.reorder_menu(p_kind text, p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_kind = 'categories' then
    update public.categories c set sort_order = o.ord
    from unnest(p_ids) with ordinality as o(id, ord) where c.id = o.id;
  elsif p_kind = 'products' then
    update public.products p set sort_order = o.ord
    from unnest(p_ids) with ordinality as o(id, ord) where p.id = o.id;
  elsif p_kind = 'kitchen_stations' then
    update public.kitchen_stations k set sort_order = o.ord
    from unnest(p_ids) with ordinality as o(id, ord) where k.id = o.id;
  elsif p_kind = 'modifier_groups' then
    update public.modifier_groups g set sort_order = o.ord
    from unnest(p_ids) with ordinality as o(id, ord) where g.id = o.id;
  else
    raise exception 'Unknown list' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.save_product(jsonb, jsonb, uuid[]),
  public.save_modifier_group(jsonb, jsonb), public.reorder_menu(text, uuid[]) from public, anon;
grant execute on function public.save_product(jsonb, jsonb, uuid[]),
  public.save_modifier_group(jsonb, jsonb), public.reorder_menu(text, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: menu images. Public read (guest menus show them); writes only to
-- the tenant's own folder `<tenant_id>/...` by members with menu.manage.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-images', 'menu-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create or replace function private.storage_tenant(p_name text)
returns uuid
language plpgsql immutable
set search_path = ''
as $$
begin
  return (storage.foldername(p_name))[1]::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create policy menu_images_select on storage.objects for select to authenticated
  using (bucket_id = 'menu-images' and private.has_perm(private.storage_tenant(name), 'menu.manage'));
create policy menu_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'menu-images'
              and private.has_perm(private.storage_tenant(name), 'menu.manage'));
create policy menu_images_update on storage.objects for update to authenticated
  using (bucket_id = 'menu-images' and private.has_perm(private.storage_tenant(name), 'menu.manage'))
  with check (bucket_id = 'menu-images' and private.has_perm(private.storage_tenant(name), 'menu.manage'));
create policy menu_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'menu-images' and private.has_perm(private.storage_tenant(name), 'menu.manage'));

grant execute on function private.storage_tenant(text) to authenticated, anon;
