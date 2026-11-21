-- =============================================================================
-- Guest ordering & order management tests (pgTAP).
--
-- Karachi Grill (Ali): branches Clifton (table T1) and DHA (table D1).
-- Menu: Chicken Tikka (Quarter 450 / Half 850, sauce 1–2 required),
--       Lassi 200 (Rs 250 at DHA), Kheer (sold out).
-- Lahore Bites (Sara): Karahi.
-- Wasim: Waiter at Karachi Grill, Clifton only.
-- =============================================================================
begin;
select plan(47);

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-00000000a111', 'ali@karachigrill.pk', '{}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000b222', 'sara@lahorebites.pk', '{}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c333', 'wasim@example.com',   '{}', 'authenticated', 'authenticated');

create schema tests;
create function tests.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function tests.act_as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;
create table tests.ids (k text primary key, v text);
grant usage on schema tests to authenticated, anon;
grant all on tests.ids to authenticated, anon;
create function tests.id(k text) returns uuid language sql as $$ select v::uuid from tests.ids where ids.k = id.k $$;
create function tests.v(k text) returns text language sql as $$ select v from tests.ids where ids.k = v.k $$;
grant execute on all functions in schema tests to authenticated, anon;

-- Item JSON helper: product + optional variant + modifiers.
create function tests.item(p text, var text default null, mods text[] default '{}', qty int default 1)
returns jsonb language sql as $$
  select jsonb_build_object('product_id', tests.id(p), 'variant_id', tests.id(var), 'quantity', qty,
           'modifier_ids', (select coalesce(jsonb_agg(tests.id(m)), '[]') from unnest(mods) m))
$$;
grant execute on function tests.item(text, text, text[], int) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000b222');
insert into tests.ids values ('t_sara', public.create_tenant('Lahore Bites', 'lahore-bites', 'Gulberg'));
with c as (insert into public.categories (tenant_id, name) values (tests.id('t_sara'), 'Karahi') returning id)
insert into tests.ids select 'cat_sara', id from c;
insert into tests.ids values ('p_karahi', public.save_product(
  jsonb_build_object('tenant_id', tests.id('t_sara'), 'category_id', tests.id('cat_sara'), 'name', 'Karahi', 'price_minor', 150000)));

select tests.act_as('00000000-0000-0000-0000-00000000a111');
insert into tests.ids values ('t_ali', public.create_tenant('Karachi Grill', 'karachi-grill', 'Clifton'));
insert into public.branches (tenant_id, name) values (tests.id('t_ali'), 'DHA');
insert into tests.ids select 'b_clifton', id from public.branches where name = 'Clifton';
insert into tests.ids select 'b_dha', id from public.branches where name = 'DHA';
insert into public.tables (tenant_id, branch_id, label) values (tests.id('t_ali'), tests.id('b_clifton'), 'T1');
insert into public.tables (tenant_id, branch_id, label) values (tests.id('t_ali'), tests.id('b_dha'), 'D1');
insert into tests.ids select 'tb_t1', id from public.tables where label = 'T1';
insert into tests.ids select 'tok_t1', qr_token from public.tables where label = 'T1';
insert into tests.ids select 'tok_d1', qr_token from public.tables where label = 'D1';

with c as (insert into public.categories (tenant_id, name) values (tests.id('t_ali'), 'BBQ') returning id)
insert into tests.ids select 'cat', id from c;
insert into tests.ids values ('grp', public.save_modifier_group(
  jsonb_build_object('tenant_id', tests.id('t_ali'), 'name', 'Sauce', 'min_select', 1, 'max_select', 2),
  '[{"name":"Raita","price_minor":0},{"name":"Mayo","price_minor":7000}]'));
insert into tests.ids select 'm_raita', id from public.modifiers where name = 'Raita';
insert into tests.ids select 'm_mayo', id from public.modifiers where name = 'Mayo';
insert into tests.ids values ('p_tikka', public.save_product(
  jsonb_build_object('tenant_id', tests.id('t_ali'), 'category_id', tests.id('cat'), 'name', 'Chicken Tikka'),
  '[{"name":"Quarter","price_minor":45000,"is_default":true},{"name":"Half","price_minor":85000}]',
  array[tests.id('grp')]));
insert into tests.ids select 'v_half', id from public.product_variants where name = 'Half';
insert into tests.ids values ('p_lassi', public.save_product(
  jsonb_build_object('tenant_id', tests.id('t_ali'), 'category_id', tests.id('cat'), 'name', 'Lassi', 'price_minor', 20000)));
insert into tests.ids values ('p_kheer', public.save_product(
  jsonb_build_object('tenant_id', tests.id('t_ali'), 'category_id', tests.id('cat'), 'name', 'Kheer', 'price_minor', 30000, 'is_available', false)));
insert into public.product_branch_overrides (product_id, branch_id, tenant_id, price_minor)
values (tests.id('p_lassi'), tests.id('b_dha'), tests.id('t_ali'), 25000);

insert into tests.ids values ('inv', public.invite_member(tests.id('t_ali'), 'wasim@example.com',
  (select id from public.roles where template_key = 'waiter'), false, array[tests.id('b_clifton')]));
select tests.act_as('00000000-0000-0000-0000-00000000c333');
select public.accept_invite(tests.v('inv'));

-- ---------------------------------------------------------------------------
-- Guest menu
-- ---------------------------------------------------------------------------
select tests.act_as_anon();
select is((public.get_guest_menu('karachi-grill', tests.v('tok_t1')) ->> 'can_order')::boolean, true,
  'table QR enables ordering');
select is((public.get_guest_menu('karachi-grill') ->> 'can_order')::boolean, false,
  'restaurant-wide QR is browse-only');
select is(jsonb_array_length(public.get_guest_menu('karachi-grill', tests.v('tok_t1')) -> 'products'), 3,
  'menu lists active products');
select is((select (p ->> 'price_minor')::bigint from jsonb_array_elements(public.get_guest_menu('karachi-grill', tests.v('tok_d1')) -> 'products') p
           where p ->> 'name' = 'Lassi'), 25000::bigint, 'DHA table sees the DHA price');
select throws_ok(format($$ select public.get_guest_menu('karachi-grill', 'not-a-token') $$), 'P0002', null, 'bad table token rejected');
select throws_ok(format($$ select public.get_guest_menu('lahore-bites', %L) $$, tests.v('tok_t1')),
  'P0002', null, 'a table token only works with its own restaurant');
select throws_ok($$ select count(*) from public.orders $$, '42501', null, 'guests cannot read orders directly');
select throws_ok($$ select count(*) from public.tables $$, '42501', null, 'guests cannot read tables (or their QR tokens)');

-- ---------------------------------------------------------------------------
-- Placing orders: prices always come from the database
-- ---------------------------------------------------------------------------
insert into tests.ids select 'o1', r ->> 'order_id' from (
  select public.place_guest_order(tests.v('tok_t1'), jsonb_build_array(
    tests.item('p_tikka', 'v_half', array['m_raita', 'm_mayo'], 2) || '{"price_minor": 1, "unit_price_minor": 1}',
    tests.item('p_lassi')), 'Less spicy please') r) x;
insert into tests.ids select 'guest1', public.place_guest_order(tests.v('tok_t1'), jsonb_build_array(tests.item('p_lassi'))) ->> 'guest_token';

select tests.act_as('00000000-0000-0000-0000-00000000a111');
select is((select total_minor from public.orders where id = tests.id('o1')), 204000::bigint,
  'total is computed by the database: (850 + 70) × 2 + 200, client prices ignored');
select is((select count(*)::int from public.order_item_modifiers m join public.order_items i on i.id = m.order_item_id
           where i.order_id = tests.id('o1')), 2, 'add-ons stored with the line');
select is((select array_agg(order_number order by order_number) from public.orders where branch_id = tests.id('b_clifton')),
  array[1, 2], 'order numbers count up per branch');
select is((select count(distinct session_id)::int from public.orders where table_id = tests.id('tb_t1')), 1,
  'orders from the same table share one sitting');
select is((select status::text from public.tables where id = tests.id('tb_t1')), 'occupied', 'ordering marks the table occupied');

select tests.act_as_anon();
select is((public.place_guest_order(tests.v('tok_d1'), jsonb_build_array(tests.item('p_lassi'))) ->> 'total_minor')::bigint,
  25000::bigint, 'branch price override is applied');
select tests.act_as('00000000-0000-0000-0000-00000000a111');
select is((select order_number from public.orders where branch_id = tests.id('b_dha')), 1, 'each branch has its own numbering');

select tests.act_as_anon();
select throws_ok(format($$ select public.place_guest_order(%L, jsonb_build_array(tests.item('p_tikka', null, array['m_raita']))) $$, tests.v('tok_t1')),
  '22023', 'Choose a size for Chicken Tikka', 'size is required for items with sizes');
select throws_ok(format($$ select public.place_guest_order(%L, jsonb_build_array(tests.item('p_tikka', 'v_half'))) $$, tests.v('tok_t1')),
  '22023', null, 'required add-on group enforced (min 1)');
select throws_ok(format($$ select public.place_guest_order(%L, jsonb_build_array(tests.item('p_lassi', null, array['m_mayo']))) $$, tests.v('tok_t1')),
  '22023', null, 'add-ons not attached to the item are rejected');
select throws_ok(format($$ select public.place_guest_order(%L, jsonb_build_array(tests.item('p_lassi', 'v_half'))) $$, tests.v('tok_t1')),
  '22023', null, 'another item''s size cannot be used');
select throws_ok(format($$ select public.place_guest_order(%L, jsonb_build_array(tests.item('p_kheer'))) $$, tests.v('tok_t1')),
  'P0001', 'Kheer is not available right now', 'sold-out items cannot be ordered');
select throws_ok(format($$ select public.place_guest_order(%L, jsonb_build_array(tests.item('p_karahi'))) $$, tests.v('tok_t1')),
  'P0002', null, 'items from another restaurant cannot be ordered');
select throws_ok(format($$ select public.place_guest_order(%L, jsonb_build_array(tests.item('p_lassi', null, '{}', 0))) $$, tests.v('tok_t1')),
  '22023', null, 'quantity must be at least 1');
select throws_ok(format($$ select public.place_guest_order(%L, jsonb_build_array(tests.item('p_lassi', null, '{}', 51))) $$, tests.v('tok_t1')),
  '22023', null, 'quantity is capped');
select throws_ok(format($$ select public.place_guest_order(%L, '[]') $$, tests.v('tok_t1')),
  '22023', null, 'empty orders are rejected');

-- ---------------------------------------------------------------------------
-- Guest session view & requests
-- ---------------------------------------------------------------------------
select is(jsonb_array_length(public.get_guest_session(tests.v('guest1')) -> 'orders'), 2, 'guest sees their table''s orders');
select is(public.get_guest_session('made-up-token'), null, 'unknown guest token reveals nothing');
select ok(not exists (select 1 from jsonb_array_elements(public.get_guest_session(tests.v('guest1')) -> 'orders') o
                      where (o ->> 'total_minor')::bigint = 25000), 'guest does not see other tables'' orders');
select is(public.create_guest_request(tests.v('tok_t1'), 'water') ->> 'duplicate', 'false', 'guest asks for water');
select is(public.create_guest_request(tests.v('tok_t1'), 'water') ->> 'duplicate', 'true', 'repeat taps do not spam the waiter');

-- Flood protection: max 6 QR orders per table per 10 minutes (2 placed so far).
select public.place_guest_order(tests.v('tok_t1'), jsonb_build_array(tests.item('p_lassi'))) from generate_series(1, 4);
select throws_ok(format($$ select public.place_guest_order(%L, jsonb_build_array(tests.item('p_lassi'))) $$, tests.v('tok_t1')),
  'P0001', null, 'order flooding from one table is blocked');

-- ---------------------------------------------------------------------------
-- Staff visibility
-- ---------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000b222');
select is((select count(*)::int from public.orders), 0, 'another restaurant cannot see these orders');
select is((select count(*)::int from public.guest_requests), 0, 'another restaurant cannot see guest requests');
select throws_ok(format($$ select public.update_order_status(%L, 'accepted') $$, tests.id('o1')),
  'P0002', null, 'another restaurant cannot change these orders');

select tests.act_as('00000000-0000-0000-0000-00000000c333');
select is((select count(*)::int from public.orders where branch_id = tests.id('b_dha')), 0, 'waiter does not see other branches');
select is((select count(*)::int from public.orders where branch_id = tests.id('b_clifton')), 6, 'waiter sees their branch''s orders');
select is((select count(*)::int from public.tables), 1, 'waiter sees only their branch''s tables');
select lives_ok(format($$ select public.update_order_status(%L, 'accepted') $$, tests.id('o1')), 'waiter can accept an order');
select throws_ok(format($$ select public.update_order_status(%L, 'cancelled', 'test') $$, tests.id('o1')),
  '42501', null, 'waiter cannot cancel (no orders.cancel)');
select throws_ok(format($$ select public.update_order_status(%L, 'new') $$, tests.id('o1')),
  'P0001', 'Orders can only move forward', 'status cannot go backwards');

-- ---------------------------------------------------------------------------
-- Owner: cancel rules, closing the sitting, QR regeneration
-- ---------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000a111');
select throws_ok(format($$ select public.update_order_status(%L, 'cancelled') $$, tests.id('o1')),
  '22023', null, 'cancelling needs a reason');
select throws_ok(format($$ select public.close_table_session(%L) $$, (select session_id from public.orders where id = tests.id('o1'))),
  'P0001', 'Serve or cancel the open orders first', 'cannot close a table with unserved orders');
select public.update_order_status(id, 'served') from public.orders where table_id = tests.id('tb_t1');
select public.close_table_session((select session_id from public.orders where id = tests.id('o1')));
select is((select status::text from public.tables where id = tests.id('tb_t1')), 'cleaning', 'closing the sitting marks the table for cleaning');
select is((select count(*)::int from public.orders where table_id = tests.id('tb_t1') and status = 'completed'), 6, 'served orders are completed');
select ok((select count(*) from public.audit_logs where entity = 'orders') >= 6, 'order status changes are audited');

select tests.act_as_anon();
select is(public.get_guest_session(tests.v('guest1')) ->> 'status', 'closed', 'guest sees their sitting closed (receipt view)');

select tests.act_as('00000000-0000-0000-0000-00000000a111');
select ok(public.regenerate_table_qr(tests.id('tb_t1')) <> tests.v('tok_t1'), 'QR code regenerated');
select tests.act_as_anon();
select throws_ok(format($$ select public.get_guest_menu('karachi-grill', %L) $$, tests.v('tok_t1')),
  'P0002', null, 'the old printed QR stops working');

select * from finish();
rollback;
