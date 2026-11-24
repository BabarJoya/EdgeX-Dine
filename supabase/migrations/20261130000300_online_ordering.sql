-- =============================================================================
-- Phase 10c: online ordering (pickup and delivery) at /o/:slug.
--
-- * Per-branch settings and delivery zones (fee, minimum order, ETA).
-- * Guests order without an account: name + mobile number, with abuse
--   limits; the order lands in Orders / KDS as source 'online' and the guest
--   follows it on a tracking page (the bill's receipt token). They pay on
--   pickup / delivery, or online through the bill link when a gateway is on.
-- * The delivery fee is part of the bill's pre-tax amount.
-- * Needs the plan's 'online_ordering' feature.
-- =============================================================================

alter table public.branches
  add column online_enabled boolean not null default false,
  add column online_pickup boolean not null default true,
  add column online_delivery boolean not null default false,
  add column online_min_order_minor bigint not null default 0 check (online_min_order_minor >= 0),
  add column online_prep_minutes int not null default 25 check (online_prep_minutes between 5 and 240);
grant update (online_enabled, online_pickup, online_delivery, online_min_order_minor, online_prep_minutes)
  on public.branches to authenticated;

create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  name text not null check (char_length(name) between 1 and 60),
  fee_minor bigint not null default 0 check (fee_minor >= 0),
  min_order_minor bigint not null default 0 check (min_order_minor >= 0),
  eta_minutes int not null default 45 check (eta_minutes between 5 and 300),
  sort_order int not null default 0,
  unique (id, tenant_id),
  foreign key (branch_id, tenant_id) references public.branches (id, tenant_id) on delete cascade
);
alter table public.delivery_zones enable row level security;
revoke all on public.delivery_zones from anon, authenticated;
grant select on public.delivery_zones to authenticated;
create policy delivery_zones_select on public.delivery_zones for select to authenticated
  using (private.is_member(tenant_id));

alter table public.bills
  add column delivery_fee_minor bigint not null default 0 check (delivery_fee_minor >= 0),
  add column delivery_address text check (char_length(delivery_address) <= 300),
  add column delivery_zone text check (char_length(delivery_zone) <= 60);

-- Base amount now includes the delivery fee.
create or replace function private.recalc_bill(p_bill_id uuid)
returns public.bills
language plpgsql security definer
set search_path = ''
as $$
declare
  v_bill public.bills;
  v_sub bigint;
begin
  select * into v_bill from public.bills where id = p_bill_id for update;
  if v_bill.id is null or v_bill.status = 'void' then
    return v_bill;
  end if;
  select coalesce(sum(total_minor), 0) into v_sub from public.orders
  where bill_id = v_bill.id and status <> 'cancelled';

  update public.bills b set
    subtotal_minor = v_sub,
    discount_minor = least(b.discount_minor, v_sub),
    service_minor = case when b.type = 'dine_in' then round((v_sub - least(b.discount_minor, v_sub)) * b.service_bps / 10000.0)::bigint else 0 end,
    base_minor = (v_sub - least(b.discount_minor, v_sub))
                 + case when b.type = 'dine_in' then round((v_sub - least(b.discount_minor, v_sub)) * b.service_bps / 10000.0)::bigint else 0 end
                 + b.delivery_fee_minor
  where id = v_bill.id
  returning * into v_bill;

  update public.bills set
    status = case
      when status = 'refunded' then 'refunded'
      when paid_base_minor >= base_minor and base_minor > 0 then 'paid'
      else 'open' end::public.bill_status,
    paid_at = case when paid_base_minor >= base_minor and base_minor > 0 then coalesce(paid_at, now()) else null end
  where id = v_bill.id
  returning * into v_bill;
  return v_bill;
end;
$$;

-- Replace a branch's delivery zones: [{name, fee_minor, min_order_minor, eta_minutes}]
create or replace function public.save_delivery_zones(p_branch_id uuid, p_zones jsonb)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tenant uuid := (select tenant_id from public.branches where id = p_branch_id);
begin
  if v_tenant is null or not private.has_branch_perm(v_tenant, p_branch_id, 'branches.manage') then
    raise exception 'You do not have permission to change this branch' using errcode = '42501';
  end if;
  if jsonb_typeof(p_zones) <> 'array' or jsonb_array_length(p_zones) > 30 then
    raise exception 'Zones must be a list of up to 30' using errcode = '22023';
  end if;
  delete from public.delivery_zones where branch_id = p_branch_id;
  insert into public.delivery_zones (tenant_id, branch_id, name, fee_minor, min_order_minor, eta_minutes, sort_order)
  select v_tenant, p_branch_id, trim(z ->> 'name'), coalesce((z ->> 'fee_minor')::bigint, 0),
         coalesce((z ->> 'min_order_minor')::bigint, 0), coalesce((z ->> 'eta_minutes')::int, 45), n
  from jsonb_array_elements(p_zones) with ordinality as x(z, n);
end;
$$;
revoke execute on function public.save_delivery_zones(uuid, jsonb) from public, anon;
grant execute on function public.save_delivery_zones(uuid, jsonb) to authenticated;

-- Menu for one branch (online ordering) as well as for a table.
drop function public.get_guest_menu(text, text);
create or replace function public.get_guest_menu(p_slug text, p_table_token text default null, p_branch_id uuid default null)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_tenant public.tenants;
  v_table public.tables;
  v_branch public.branches;
begin
  select * into v_tenant from public.tenants where slug = lower(p_slug) and status = 'active';
  if v_tenant.id is null then
    raise exception 'Menu not found' using errcode = 'P0002', hint = 'bad_menu';
  end if;

  if nullif(p_table_token, '') is not null then
    v_table := private.guest_table(p_table_token);
    if v_table.tenant_id <> v_tenant.id then
      raise exception 'This QR code is not valid. Please ask your waiter.' using errcode = 'P0002', hint = 'bad_table';
    end if;
    select * into v_branch from public.branches where id = v_table.branch_id;
  elsif p_branch_id is not null then
    -- Online ordering: prices and availability of one branch.
    select * into v_branch from public.branches where id = p_branch_id and tenant_id = v_tenant.id and is_active;
    if v_branch.id is null then
      raise exception 'Branch not found' using errcode = 'P0002';
    end if;
  end if;

  return jsonb_build_object(
    'restaurant', jsonb_build_object(
      'name', v_tenant.name, 'slug', v_tenant.slug, 'currency', v_tenant.currency,
      'logo_url', v_tenant.logo_url, 'brand_color', v_tenant.brand_color),
    'branch', case when v_branch.id is null then null else jsonb_build_object('name', v_branch.name) end,
    'table', case when v_table.id is null then null else jsonb_build_object('label', v_table.label) end,
    'can_order', v_table.id is not null or (p_branch_id is not null and v_branch.online_enabled),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'parent_id', c.parent_id, 'name', c.name, 'translations', c.translations)
        order by coalesce(parent.sort_order, c.sort_order), c.parent_id nulls first, c.sort_order)
      from public.categories c
      left join public.categories parent on parent.id = c.parent_id
      where c.tenant_id = v_tenant.id and c.is_active and coalesce(parent.is_active, true)), '[]'),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'category_id', p.category_id, 'name', p.name, 'description', p.description,
        'translations', p.translations, 'image_path', p.image_path, 'tags', p.tags,
        'price_minor', case when v_branch.id is null then p.price_minor else private.product_price_at(p, v_branch.id) end,
        'compare_at_price_minor', p.compare_at_price_minor,
        'is_available', case when v_branch.id is null then p.is_available else private.product_available_at(p, v_branch.id) end,
        'variants', coalesce((
          select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'translations', v.translations,
                                              'price_minor', v.price_minor, 'is_default', v.is_default)
                           order by v.sort_order)
          from public.product_variants v where v.product_id = p.id), '[]'),
        'group_ids', coalesce((
          select jsonb_agg(pmg.group_id order by pmg.sort_order)
          from public.product_modifier_groups pmg where pmg.product_id = p.id), '[]'))
        order by p.sort_order)
      from public.products p
      join public.categories c on c.id = p.category_id and c.is_active
      where p.tenant_id = v_tenant.id and p.is_active
        and (v_branch.id is null or coalesce(
              (select o.is_available from public.product_branch_overrides o
               where o.product_id = p.id and o.branch_id = v_branch.id), true))), '[]'),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'translations', g.translations,
        'min_select', g.min_select, 'max_select', g.max_select,
        'modifiers', coalesce((
          select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'translations', m.translations,
                                              'price_minor', m.price_minor, 'is_available', m.is_available)
                           order by m.sort_order)
          from public.modifiers m where m.group_id = g.id), '[]')))
      from public.modifier_groups g where g.tenant_id = v_tenant.id), '[]')
  );
end;
$$;
grant execute on function public.get_guest_menu(text, text, uuid) to anon, authenticated;

-- Public: what the ordering site needs (branches taking orders, zones).
create or replace function public.get_online_info(p_slug text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'restaurant', jsonb_build_object('name', t.name, 'slug', t.slug, 'currency', t.currency,
                                     'logo_url', t.logo_url, 'brand_color', t.brand_color),
    'available', private.has_feature(t.id, 'online_ordering'),
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'name', b.name, 'address', b.address, 'phone', b.phone,
        'pickup', b.online_pickup, 'delivery', b.online_delivery,
        'min_order_minor', b.online_min_order_minor, 'prep_minutes', b.online_prep_minutes,
        'zones', coalesce((select jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name, 'fee_minor', z.fee_minor,
                                                               'min_order_minor', z.min_order_minor, 'eta_minutes', z.eta_minutes)
                                            order by z.sort_order)
                           from public.delivery_zones z where z.branch_id = b.id), '[]'))
        order by b.name)
      from public.branches b
      where b.tenant_id = t.id and b.is_active and b.online_enabled
        and private.has_feature(t.id, 'online_ordering')), '[]'))
  from public.tenants t
  where t.slug = lower(p_slug) and private.tenant_access(t.id) = 'active';
$$;

create or replace function public.place_online_order(
  p_branch_id uuid,
  p_type public.order_type,
  p_items jsonb,
  p_name text,
  p_phone text,
  p_zone_id uuid default null,
  p_address text default null,
  p_notes text default ''
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  b public.branches;
  z public.delivery_zones;
  v_phone text := private.wa_number(p_phone);
  v_bill public.bills;
  v_order public.orders;
  v_min bigint;
begin
  select * into b from public.branches where id = p_branch_id and is_active and online_enabled;
  if b.id is null or private.tenant_access(b.tenant_id) <> 'active' or not private.has_feature(b.tenant_id, 'online_ordering') then
    raise exception 'This restaurant is not taking online orders right now' using errcode = 'P0001';
  end if;
  if p_type = 'takeaway' and not b.online_pickup or p_type = 'delivery' and not b.online_delivery or p_type = 'dine_in' then
    raise exception 'That order type is not available' using errcode = '22023';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Please enter your name' using errcode = '22023';
  end if;
  if v_phone is null then
    raise exception 'Please enter a valid mobile number' using errcode = '22023';
  end if;
  if p_type = 'delivery' then
    select * into z from public.delivery_zones where id = p_zone_id and branch_id = b.id;
    if z.id is null then
      raise exception 'Please choose your delivery area' using errcode = '22023';
    end if;
    if coalesce(trim(p_address), '') = '' then
      raise exception 'Please enter your delivery address' using errcode = '22023';
    end if;
  end if;
  -- Abuse limits: two orders in progress per number, ten per hour per branch.
  if (select count(*) from public.bills bl
      where bl.branch_id = b.id and bl.status = 'open' and private.wa_number(bl.customer_phone) = v_phone
        and exists (select 1 from public.orders o where o.bill_id = bl.id and o.source = 'online'
                    and o.status not in ('completed', 'cancelled'))) >= 2 then
    raise exception 'You already have orders in progress. Please wait for them or call the restaurant.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.orders where branch_id = b.id and source = 'online' and status = 'new'
      and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'The restaurant is very busy. Please try again in a few minutes.' using errcode = 'P0001';
  end if;

  v_bill := private.new_bill(b.id, p_type, null, null);
  v_order := private.create_order(b.tenant_id, b.id, null, null, 'online', p_type, p_items, p_notes, null);
  v_min := greatest(b.online_min_order_minor, coalesce(z.min_order_minor, 0));
  if v_order.total_minor < v_min then
    raise exception 'The minimum order is %', v_min / 100 using errcode = 'P0001', hint = 'min_order';
  end if;
  update public.bills set customer_name = trim(p_name), customer_phone = trim(p_phone),
    delivery_fee_minor = coalesce(z.fee_minor, 0), delivery_address = nullif(trim(p_address), ''), delivery_zone = z.name
  where id = v_bill.id;
  update public.orders set bill_id = v_bill.id where id = v_order.id;
  perform private.recalc_bill(v_bill.id);

  return jsonb_build_object('token', v_bill.receipt_token, 'order_number', v_order.order_number);
end;
$$;

-- Public: an online order's progress (by its bill token).
create or replace function public.track_online_order(p_token text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'restaurant', t.name, 'slug', t.slug, 'branch', br.name, 'branch_phone', br.phone, 'currency', bl.currency,
    'type', bl.type, 'bill_status', bl.status, 'customer_name', bl.customer_name,
    'delivery_address', bl.delivery_address, 'delivery_zone', bl.delivery_zone,
    'subtotal_minor', bl.subtotal_minor, 'delivery_fee_minor', bl.delivery_fee_minor, 'base_minor', bl.base_minor,
    'paid_total_minor', bl.paid_total_minor,
    'order_number', o.order_number, 'status', o.status, 'placed_at', o.created_at,
    'eta_minutes', case when bl.type = 'delivery'
                        then (select z.eta_minutes from public.delivery_zones z where z.branch_id = br.id and z.name = bl.delivery_zone limit 1)
                        else br.online_prep_minutes end,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'variant', i.variant_name, 'quantity', i.quantity,
                                                           'line_total_minor', i.line_total_minor) order by i.created_at), '[]')
              from public.order_items i where i.order_id = o.id and i.status <> 'cancelled'))
  from public.bills bl
  join public.orders o on o.bill_id = bl.id and o.source = 'online'
  join public.branches br on br.id = bl.branch_id
  join public.tenants t on t.id = bl.tenant_id
  where bl.receipt_token = p_token
  order by o.created_at
  limit 1;
$$;

grant execute on function public.get_online_info(text),
  public.place_online_order(uuid, public.order_type, jsonb, text, text, uuid, text, text),
  public.track_online_order(text) to anon, authenticated;

-- Receipts show the delivery fee and address.
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
    'service_bps', b.service_bps, 'service_minor', b.service_minor,
    'delivery_fee_minor', b.delivery_fee_minor, 'delivery_address', b.delivery_address, 'base_minor', b.base_minor,
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
