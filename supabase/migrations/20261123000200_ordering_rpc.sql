-- =============================================================================
-- Phase 3 · Ordering logic.
--
-- private.create_order is the single place where an order is priced and
-- validated. Guests (QR) reach it through place_guest_order; waiters and the
-- POS will reach it through staff RPCs in Phases 4–5. Clients never send
-- prices: every amount is read from the menu inside the database.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.next_order_number(p_branch_id uuid, p_date date)
returns int
language sql
security definer
set search_path = ''
as $$
  insert into public.order_counters (branch_id, business_date, last_number)
  values (p_branch_id, p_date, 1)
  on conflict (branch_id, business_date)
  do update set last_number = public.order_counters.last_number + 1
  returning last_number;
$$;

-- Effective availability / price of a product at a branch.
create or replace function private.product_available_at(p_product public.products, p_branch_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_product.is_active
     and coalesce(
           (select o.is_available from public.product_branch_overrides o
            where o.product_id = p_product.id and o.branch_id = p_branch_id),
           p_product.is_available)
     and exists (
           select 1 from public.categories c
           left join public.categories parent on parent.id = c.parent_id
           where c.id = p_product.category_id and c.is_active and coalesce(parent.is_active, true));
$$;

create or replace function private.product_price_at(p_product public.products, p_branch_id uuid)
returns bigint
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select o.price_minor from public.product_branch_overrides o
     where o.product_id = p_product.id and o.branch_id = p_branch_id),
    p_product.price_minor);
$$;

-- ---------------------------------------------------------------------------
-- create_order: validates and prices every line, then writes the order.
-- p_items: [{ "product_id", "variant_id"?, "quantity", "modifier_ids"?: [], "notes"? }]
-- ---------------------------------------------------------------------------
create or replace function private.create_order(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_table_id uuid,
  p_session_id uuid,
  p_source public.order_source,
  p_type public.order_type,
  p_items jsonb,
  p_notes text,
  p_created_by uuid
)
returns public.orders
language plpgsql security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_tz text;
  v_currency text;
  v_item jsonb;
  v_product public.products;
  v_variant public.product_variants;
  v_qty int;
  v_unit bigint;
  v_mods_total bigint;
  v_mod_ids uuid[];
  v_item_id uuid;
  v_subtotal bigint := 0;
  v_group record;
  v_selected int;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your order is empty' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Too many lines in one order' using errcode = '22023';
  end if;

  select coalesce(b.timezone, t.timezone), t.currency into v_tz, v_currency
  from public.branches b join public.tenants t on t.id = b.tenant_id
  where b.id = p_branch_id and b.tenant_id = p_tenant_id;

  insert into public.orders (tenant_id, branch_id, table_id, session_id, order_number, business_date,
                             type, source, currency, notes, created_by)
  values (p_tenant_id, p_branch_id, p_table_id, p_session_id,
          private.next_order_number(p_branch_id, (now() at time zone v_tz)::date),
          (now() at time zone v_tz)::date,
          p_type, p_source, v_currency, left(coalesce(trim(p_notes), ''), 500), p_created_by)
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    -- Product: same tenant, active, available here.
    select * into v_product from public.products
    where id = (v_item ->> 'product_id')::uuid and tenant_id = p_tenant_id;
    if v_product.id is null then
      raise exception 'An item in your order is no longer on the menu' using errcode = 'P0002';
    end if;
    if not private.product_available_at(v_product, p_branch_id) then
      raise exception '% is not available right now', v_product.name using errcode = 'P0001', hint = 'unavailable';
    end if;

    v_qty := (v_item ->> 'quantity')::int;
    if v_qty is null or v_qty < 1 or v_qty > 50 then
      raise exception 'Quantity must be between 1 and 50' using errcode = '22023';
    end if;

    -- Size / variant.
    v_variant := null;
    if exists (select 1 from public.product_variants where product_id = v_product.id) then
      select * into v_variant from public.product_variants
      where id = nullif(v_item ->> 'variant_id', '')::uuid and product_id = v_product.id;
      if v_variant.id is null then
        raise exception 'Choose a size for %', v_product.name using errcode = '22023';
      end if;
      v_unit := v_variant.price_minor;
    else
      if nullif(v_item ->> 'variant_id', '') is not null then
        raise exception '% has no sizes', v_product.name using errcode = '22023';
      end if;
      v_unit := private.product_price_at(v_product, p_branch_id);
    end if;

    -- Add-ons: must belong to a group attached to this product, be available,
    -- and respect each group's min/max.
    v_mod_ids := coalesce(array(select distinct (x)::uuid from jsonb_array_elements_text(coalesce(v_item -> 'modifier_ids', '[]')) x), '{}');
    if exists (
      select 1 from unnest(v_mod_ids) m(id)
      where not exists (
        select 1 from public.modifiers md
        join public.product_modifier_groups pmg on pmg.group_id = md.group_id and pmg.product_id = v_product.id
        where md.id = m.id and md.is_available)
    ) then
      raise exception 'An add-on you chose for % is not available', v_product.name using errcode = '22023';
    end if;
    for v_group in
      select g.* from public.modifier_groups g
      join public.product_modifier_groups pmg on pmg.group_id = g.id
      where pmg.product_id = v_product.id
    loop
      select count(*) into v_selected from public.modifiers md
      where md.group_id = v_group.id and md.id = any (v_mod_ids);
      if v_selected < v_group.min_select or v_selected > v_group.max_select then
        raise exception '%: choose % for "%"', v_product.name,
          case when v_group.min_select = v_group.max_select then v_group.min_select::text
               else v_group.min_select || '–' || v_group.max_select end,
          v_group.name
          using errcode = '22023';
      end if;
    end loop;
    select coalesce(sum(price_minor), 0) into v_mods_total from public.modifiers where id = any (v_mod_ids);

    insert into public.order_items (tenant_id, order_id, product_id, variant_id, name, variant_name,
      kitchen_station_id, quantity, unit_price_minor, modifiers_minor, line_total_minor, notes)
    values (p_tenant_id, v_order.id, v_product.id, v_variant.id, v_product.name, v_variant.name,
      v_product.kitchen_station_id, v_qty, v_unit, v_mods_total, (v_unit + v_mods_total) * v_qty,
      left(coalesce(trim(v_item ->> 'notes'), ''), 200))
    returning id into v_item_id;

    insert into public.order_item_modifiers (tenant_id, order_item_id, modifier_id, group_name, name, price_minor)
    select p_tenant_id, v_item_id, md.id, g.name, md.name, md.price_minor
    from public.modifiers md join public.modifier_groups g on g.id = md.group_id
    where md.id = any (v_mod_ids)
    order by g.sort_order, md.sort_order;

    v_subtotal := v_subtotal + (v_unit + v_mods_total) * v_qty;
  end loop;

  -- Taxes and service charges are applied at billing (Phase 5).
  update public.orders set subtotal_minor = v_subtotal, total_minor = v_subtotal
  where id = v_order.id
  returning * into v_order;

  if p_table_id is not null then
    update public.tables set status = 'occupied' where id = p_table_id and status <> 'occupied';
  end if;

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- Guest context from a table QR token (active table, branch and restaurant).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- get_guest_menu: everything the QR menu needs in one call.
-- With a table token: that branch's prices/availability and ordering on.
-- Without: browse-only menu (restaurant-wide QR), base prices.
-- ---------------------------------------------------------------------------
create or replace function public.get_guest_menu(p_slug text, p_table_token text default null)
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
  end if;

  return jsonb_build_object(
    'restaurant', jsonb_build_object(
      'name', v_tenant.name, 'slug', v_tenant.slug, 'currency', v_tenant.currency,
      'logo_url', v_tenant.logo_url, 'brand_color', v_tenant.brand_color),
    'branch', case when v_branch.id is null then null else jsonb_build_object('name', v_branch.name) end,
    'table', case when v_table.id is null then null else jsonb_build_object('label', v_table.label) end,
    'can_order', v_table.id is not null,
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

-- ---------------------------------------------------------------------------
-- place_guest_order
-- ---------------------------------------------------------------------------
create or replace function public.place_guest_order(
  p_table_token text,
  p_items jsonb,
  p_notes text default ''
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_table public.tables := private.guest_table(p_table_token);
  v_session public.table_sessions;
  v_order public.orders;
begin
  -- Flood protection: a real table rarely sends more than a few orders in
  -- ten minutes. (IP-level limits belong at the edge, e.g. Vercel firewall.)
  if (select count(*) from public.orders o
      where o.table_id = v_table.id and o.source = 'qr' and o.created_at > now() - interval '10 minutes') >= 6 then
    raise exception 'Too many orders from this table. Please ask your waiter.' using errcode = 'P0001', hint = 'rate_limited';
  end if;

  -- Join the table's open sitting, or start one. Serialise per table so two
  -- phones ordering at once share the same session.
  perform 1 from public.tables where id = v_table.id for update;
  select * into v_session from public.table_sessions where table_id = v_table.id and status = 'open';
  if v_session.id is null then
    insert into public.table_sessions (tenant_id, branch_id, table_id)
    values (v_table.tenant_id, v_table.branch_id, v_table.id)
    returning * into v_session;
  end if;

  v_order := private.create_order(v_table.tenant_id, v_table.branch_id, v_table.id, v_session.id,
                                  'qr', 'dine_in', p_items, p_notes, null);

  return jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number,
                            'total_minor', v_order.total_minor, 'guest_token', v_session.guest_token);
end;
$$;

-- ---------------------------------------------------------------------------
-- get_guest_session: the guest's view of their table's orders and requests.
-- ---------------------------------------------------------------------------
create or replace function public.get_guest_session(p_guest_token text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', s.status,
    'table', tb.label,
    'currency', t.currency,
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'number', o.order_number, 'status', o.status, 'created_at', o.created_at,
        'total_minor', o.total_minor, 'notes', o.notes,
        'items', (select jsonb_agg(jsonb_build_object(
                    'name', i.name, 'variant_name', i.variant_name, 'quantity', i.quantity,
                    'line_total_minor', i.line_total_minor, 'notes', i.notes,
                    'modifiers', (select coalesce(jsonb_agg(m.name order by m.id), '[]')
                                  from public.order_item_modifiers m where m.order_item_id = i.id))
                  order by i.created_at)
                  from public.order_items i where i.order_id = o.id))
        order by o.created_at desc)
      from public.orders o where o.session_id = s.id), '[]'),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object('type', r.type, 'status', r.status, 'created_at', r.created_at)
                       order by r.created_at desc)
      from public.guest_requests r where r.session_id = s.id and r.created_at > now() - interval '3 hours'), '[]')
  )
  from public.table_sessions s
  join public.tables tb on tb.id = s.table_id
  join public.tenants t on t.id = s.tenant_id
  where s.guest_token = p_guest_token
    -- A closed sitting stays visible briefly (for the receipt), then expires.
    and (s.status = 'open' or s.closed_at > now() - interval '2 hours');
$$;

-- ---------------------------------------------------------------------------
-- create_guest_request: call waiter / water / napkins / bill / other.
-- Idempotent per type while one is still open.
-- ---------------------------------------------------------------------------
create or replace function public.create_guest_request(
  p_table_token text,
  p_type public.guest_request_type,
  p_note text default ''
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_table public.tables := private.guest_table(p_table_token);
  v_session_id uuid;
  v_req public.guest_requests;
begin
  select id into v_session_id from public.table_sessions where table_id = v_table.id and status = 'open';

  select * into v_req from public.guest_requests
  where table_id = v_table.id and type = p_type and status <> 'resolved';
  if v_req.id is not null then
    return jsonb_build_object('status', v_req.status, 'duplicate', true);
  end if;

  if (select count(*) from public.guest_requests
      where table_id = v_table.id and created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'Please wait a moment, your waiter has been notified.' using errcode = 'P0001', hint = 'rate_limited';
  end if;

  insert into public.guest_requests (tenant_id, branch_id, table_id, session_id, type, note)
  values (v_table.tenant_id, v_table.branch_id, v_table.id, v_session_id, p_type, left(coalesce(trim(p_note), ''), 200))
  returning * into v_req;
  return jsonb_build_object('status', v_req.status, 'duplicate', false);
end;
$$;

-- =============================================================================
-- Staff actions
-- =============================================================================

create or replace function public.update_order_status(
  p_order_id uuid,
  p_status public.order_status,
  p_reason text default null
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_rank_from int;
  v_rank_to int;
  v_ranks constant public.order_status[] := array['new', 'accepted', 'preparing', 'ready', 'served', 'completed']::public.order_status[];
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null or not (
       private.has_branch_perm(v_order.tenant_id, v_order.branch_id, 'orders.view')
    or private.has_branch_perm(v_order.tenant_id, v_order.branch_id, 'kitchen.view')) then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.status in ('completed', 'cancelled') then
    raise exception 'This order is already %', v_order.status using errcode = 'P0001';
  end if;

  if p_status = 'cancelled' then
    if not private.has_branch_perm(v_order.tenant_id, v_order.branch_id, 'orders.cancel') then
      raise exception 'You do not have permission to cancel orders' using errcode = '42501';
    end if;
    if v_order.status in ('served') then
      raise exception 'A served order cannot be cancelled; refund it at billing instead' using errcode = 'P0001';
    end if;
    if coalesce(trim(p_reason), '') = '' then
      raise exception 'Give a reason for cancelling' using errcode = '22023';
    end if;
  else
    v_rank_from := array_position(v_ranks, v_order.status);
    v_rank_to := array_position(v_ranks, p_status);
    if v_rank_to <= v_rank_from then
      raise exception 'Orders can only move forward' using errcode = 'P0001';
    end if;
    if p_status in ('accepted', 'preparing', 'ready') and not (
         private.has_branch_perm(v_order.tenant_id, v_order.branch_id, 'kitchen.update')
      or private.has_branch_perm(v_order.tenant_id, v_order.branch_id, 'orders.edit')) then
      raise exception 'You do not have permission to update this order' using errcode = '42501';
    end if;
    if p_status = 'served' and not private.has_branch_perm(v_order.tenant_id, v_order.branch_id, 'orders.edit') then
      raise exception 'You do not have permission to update this order' using errcode = '42501';
    end if;
    if p_status = 'completed' and not (
         private.has_branch_perm(v_order.tenant_id, v_order.branch_id, 'payments.take')
      or private.has_branch_perm(v_order.tenant_id, v_order.branch_id, 'orders.edit')) then
      raise exception 'You do not have permission to complete orders' using errcode = '42501';
    end if;
  end if;

  update public.orders set
    status = p_status,
    cancel_reason = case when p_status = 'cancelled' then trim(p_reason) else cancel_reason end,
    accepted_at = case when p_status in ('accepted', 'preparing', 'ready', 'served') then coalesce(accepted_at, now()) else accepted_at end,
    ready_at = case when p_status in ('ready', 'served') then coalesce(ready_at, now()) else ready_at end,
    served_at = case when p_status = 'served' then now() else served_at end
  where id = v_order.id;

  update public.order_items set status = p_status
  where order_id = v_order.id and status <> 'cancelled';
end;
$$;

create or replace function public.respond_guest_request(p_request_id uuid, p_status public.guest_request_status)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_req public.guest_requests;
begin
  select * into v_req from public.guest_requests where id = p_request_id;
  if v_req.id is null or not private.has_branch_perm(v_req.tenant_id, v_req.branch_id, 'orders.view') then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if p_status = 'open' then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  update public.guest_requests set
    status = p_status,
    handled_by = auth.uid(),
    acknowledged_at = coalesce(acknowledged_at, now()),
    resolved_at = case when p_status = 'resolved' then now() else resolved_at end
  where id = v_req.id;
end;
$$;

create or replace function public.set_table_status(p_table_id uuid, p_status public.table_status)
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
  if not (private.has_branch_perm(v_table.tenant_id, v_table.branch_id, 'tables.manage')
       or private.has_branch_perm(v_table.tenant_id, v_table.branch_id, 'orders.edit')) then
    raise exception 'You do not have permission to change table status' using errcode = '42501';
  end if;
  update public.tables set status = p_status where id = v_table.id;
end;
$$;

-- Close the sitting (after the bill is settled). Phase 5 calls this from payment.
create or replace function public.close_table_session(p_session_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_session public.table_sessions;
begin
  select * into v_session from public.table_sessions where id = p_session_id for update;
  if v_session.id is null or not (
       private.has_branch_perm(v_session.tenant_id, v_session.branch_id, 'tables.manage')
    or private.has_branch_perm(v_session.tenant_id, v_session.branch_id, 'payments.take')) then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;
  if v_session.status = 'closed' then
    return;
  end if;
  if exists (select 1 from public.orders where session_id = v_session.id
             and status in ('new', 'accepted', 'preparing', 'ready')) then
    raise exception 'Serve or cancel the open orders first' using errcode = 'P0001';
  end if;
  update public.table_sessions set status = 'closed', closed_at = now(), closed_by = auth.uid()
  where id = v_session.id;
  update public.orders set status = 'completed' where session_id = v_session.id and status = 'served';
  update public.order_items set status = 'completed'
  where status = 'served' and order_id in (select id from public.orders where session_id = v_session.id);
  update public.guest_requests set status = 'resolved', resolved_at = now()
  where session_id = v_session.id and status <> 'resolved';
  update public.tables set status = 'cleaning' where id = v_session.table_id;
end;
$$;

create or replace function public.regenerate_table_qr(p_table_id uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_table public.tables;
  v_token text;
begin
  select * into v_table from public.tables where id = p_table_id;
  if v_table.id is null or not private.has_branch_perm(v_table.tenant_id, v_table.branch_id, 'tables.manage') then
    raise exception 'Table not found' using errcode = 'P0002';
  end if;
  update public.tables set qr_token = encode(extensions.gen_random_bytes(16), 'hex')
  where id = v_table.id returning qr_token into v_token;
  return v_token;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.get_guest_menu(text, text),
  public.place_guest_order(text, jsonb, text),
  public.get_guest_session(text),
  public.create_guest_request(text, public.guest_request_type, text),
  public.get_invite(text)
to anon, authenticated;
grant execute on function
  public.update_order_status(uuid, public.order_status, text),
  public.respond_guest_request(uuid, public.guest_request_status),
  public.set_table_status(uuid, public.table_status),
  public.close_table_session(uuid),
  public.regenerate_table_qr(uuid)
to authenticated;
-- Re-grant earlier RPCs (the blanket revoke above covers all public functions).
grant execute on function
  public.is_slug_available(text),
  public.create_tenant(text, text, text, text, text, text, text),
  public.my_permissions(uuid),
  public.invite_member(uuid, text, uuid, boolean, uuid[]),
  public.accept_invite(text),
  public.update_member(uuid, uuid, boolean, uuid[], public.member_status),
  public.remove_member(uuid),
  public.set_role_permissions(uuid, text[]),
  public.save_product(jsonb, jsonb, uuid[]),
  public.save_modifier_group(jsonb, jsonb),
  public.reorder_menu(text, uuid[])
to authenticated;

revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, anon;
