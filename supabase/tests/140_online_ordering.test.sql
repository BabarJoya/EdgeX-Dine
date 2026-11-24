-- =============================================================================
-- Online ordering (pgTAP): settings, pickup and delivery, zone fee and
-- minimum, tracking, abuse limits, plan feature.
-- =============================================================================
begin;
select plan(19);

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-00000000a111', 'ali@karachigrill.pk', '{"full_name":"Ali"}', 'authenticated', 'authenticated');

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
create function tests.items(p text, qty int) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('product_id', tests.id(p), 'quantity', qty)) $$;
grant execute on all functions in schema tests to authenticated, anon;

select tests.act_as('00000000-0000-0000-0000-00000000a111');
insert into tests.ids values ('t', public.create_tenant('Karachi Grill', 'karachi-grill', 'Clifton'));
insert into tests.ids select 'b', id from public.branches where tenant_id = tests.id('t');
with c as (insert into public.categories (tenant_id, name) values (tests.id('t'), 'BBQ') returning id) insert into tests.ids select 'cat', id from c;
insert into tests.ids values ('tikka', public.save_product(jsonb_build_object('tenant_id', tests.id('t'), 'category_id', tests.id('cat'), 'name', 'Tikka', 'price_minor', 100000)));
insert into tests.ids values ('lassi', public.save_product(jsonb_build_object('tenant_id', tests.id('t'), 'category_id', tests.id('cat'), 'name', 'Lassi', 'price_minor', 20000)));

select tests.act_as_anon();
select is(jsonb_array_length(public.get_online_info('karachi-grill') -> 'branches'), 0, 'online ordering is off by default');
select throws_ok($$ select public.place_online_order(tests.id('b'), 'takeaway', tests.items('tikka', 1), 'Hamza', '03001234567') $$,
  'P0001', 'This restaurant is not taking online orders right now', 'and orders are refused');

select tests.act_as('00000000-0000-0000-0000-00000000a111');
update public.branches set online_enabled = true, online_delivery = true where id = tests.id('b');
select public.save_delivery_zones(tests.id('b'), '[{"name":"DHA","fee_minor":15000,"min_order_minor":100000,"eta_minutes":40}]');
insert into tests.ids select 'zone', id from public.delivery_zones where name = 'DHA';

select tests.act_as_anon();
select is(public.get_online_info('karachi-grill') -> 'branches' -> 0 -> 'zones' -> 0 ->> 'name', 'DHA', 'the site lists delivery areas');
select is(jsonb_array_length(public.get_guest_menu('karachi-grill', null, tests.id('b')) -> 'products'), 2, 'menu for the chosen branch');
select is((public.get_guest_menu('karachi-grill', null, tests.id('b')) ->> 'can_order')::boolean, true, 'which can be ordered from');
select is((public.get_guest_menu('karachi-grill') ->> 'can_order')::boolean, false, 'the plain menu link stays browse-only');

-- Pickup --------------------------------------------------------------------------------
insert into tests.ids select 'pickup', public.place_online_order(tests.id('b'), 'takeaway', tests.items('tikka', 2), 'Hamza', '0300 1234567', null, null, 'Extra chutney') ->> 'token';
select is((public.track_online_order(tests.v('pickup')) ->> 'status'), 'new', 'the guest can track the order');
select is((public.track_online_order(tests.v('pickup')) ->> 'base_minor')::bigint, 200000::bigint, 'priced by the server');

-- Delivery ------------------------------------------------------------------------------
select throws_ok($$ select public.place_online_order(tests.id('b'), 'delivery', tests.items('tikka', 1), 'Sana', '03211112223') $$,
  '22023', 'Please choose your delivery area', 'delivery needs an area');
select throws_ok($$ select public.place_online_order(tests.id('b'), 'delivery', tests.items('tikka', 1), 'Sana', '03211112223', tests.id('zone')) $$,
  '22023', 'Please enter your delivery address', 'and an address');
select throws_ok($$ select public.place_online_order(tests.id('b'), 'delivery', tests.items('lassi', 1), 'Sana', '03211112223', tests.id('zone'), 'House 12') $$,
  'P0001', 'The minimum order is 1000', 'the area minimum applies');
insert into tests.ids select 'delivery', public.place_online_order(tests.id('b'), 'delivery', tests.items('tikka', 1), 'Sana', '03211112223', tests.id('zone'), 'House 12, Street 4, Phase 6') ->> 'token';
select is((select row(t ->> 'delivery_fee_minor', t ->> 'base_minor', t ->> 'eta_minutes', t ->> 'delivery_address')::text
           from public.track_online_order(tests.v('delivery')) t),
  row('15000', '115000', '40', 'House 12, Street 4, Phase 6')::text, 'the delivery fee is part of the bill; ETA from the area');
select throws_ok($$ select public.place_online_order(tests.id('b'), 'takeaway', tests.items('tikka', 1), 'X', '12') $$,
  '22023', 'Please enter a valid mobile number', 'a mobile number is required');

-- Abuse limit -----------------------------------------------------------------------------
select public.place_online_order(tests.id('b'), 'takeaway', tests.items('tikka', 1), 'Hamza', '+923001234567');
select throws_ok($$ select public.place_online_order(tests.id('b'), 'takeaway', tests.items('tikka', 1), 'Hamza', '03001234567') $$,
  'P0001', null, 'at most two orders in progress per number');

-- Staff side -------------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000a111');
select is((select count(*)::int from public.orders where source = 'online' and branch_id = tests.id('b')), 3, 'online orders reach the restaurant');
select is((select notes from public.orders where source = 'online' order by created_at limit 1), 'Extra chutney', 'with the guest''s notes');
select is((public.get_receipt(tests.v('delivery')) ->> 'delivery_fee_minor')::bigint, 15000::bigint, 'the receipt shows the delivery fee');
select is((select status from public.bills where receipt_token = tests.v('delivery')), 'open', 'paid on delivery or online later');

-- Plan --------------------------------------------------------------------------------------
reset role;
update public.subscriptions set plan_id = (select id from public.subscription_plans where code = 'starter') where tenant_id = tests.id('t');
select tests.act_as_anon();
select throws_ok($$ select public.place_online_order(tests.id('b'), 'takeaway', tests.items('tikka', 1), 'Ali', '03330001112') $$,
  'P0001', 'This restaurant is not taking online orders right now', 'online ordering needs a plan that includes it');

select * from finish();
rollback;
