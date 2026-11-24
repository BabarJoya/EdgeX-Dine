-- =============================================================================
-- Inventory (pgTAP): purchases and moving-average cost, recipe deductions per
-- product / variant / add-on, cancellations, wastage, counts, costing, P&L,
-- permissions and the plan feature.
--
-- Karachi Grill (Clifton), no tax. Chicken Tikka: Quarter Rs 450 (default),
-- Half Rs 850; Sauce add-ons Raita (free) / Mayo Rs 70.
-- Recipes: Tikka 0.25 kg chicken + 0.02 L oil; Half 0.5 kg + 0.03 L;
-- Mayo add-on 0.05 kg mayo.
-- =============================================================================
begin;
select plan(28);

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-00000000a111', 'ali@karachigrill.pk', '{"full_name":"Ali"}',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c333', 'wasim@example.com',   '{"full_name":"Wasim"}', 'authenticated', 'authenticated');

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
create function tests.item(p text, var text default null, mods text[] default '{}', qty int default 1)
returns jsonb language sql as $$
  select jsonb_build_object('product_id', tests.id(p), 'variant_id', tests.id(var), 'quantity', qty,
           'modifier_ids', (select coalesce(jsonb_agg(tests.id(m)), '[]') from unnest(mods) m))
$$;
create function tests.stock(name text) returns numeric language sql as $$
  select s.quantity from public.inventory_stock s join public.inventory_items i on i.id = s.item_id
  where i.name = stock.name and s.branch_id = tests.id('b') $$;
create function tests.inv(name text, unit text, reorder numeric default 0) returns uuid language sql as $$
  select public.save_inventory_item(jsonb_build_object('tenant_id', tests.id('t'), 'name', name, 'unit', unit, 'reorder_level', reorder)) $$;
create function tests.buy(lines jsonb) returns uuid language plpgsql as $$
declare v uuid;
begin
  v := public.save_purchase(jsonb_build_object('tenant_id', tests.id('t'), 'branch_id', tests.id('b'),
         'supplier_id', tests.id('sup'), 'reference', 'INV-1', 'items', lines));
  perform public.receive_purchase(v);
  return v;
end $$;
grant execute on all functions in schema tests to authenticated, anon;

-- Fixtures --------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000a111');
insert into tests.ids values ('t', public.create_tenant('Karachi Grill', 'karachi-grill', 'Clifton'));
insert into tests.ids select 'b', id from public.branches where tenant_id = tests.id('t');
insert into public.tables (tenant_id, branch_id, label) values (tests.id('t'), tests.id('b'), 'T1'), (tests.id('t'), tests.id('b'), 'T2');
insert into tests.ids select 'tok_' || lower(label), qr_token from public.tables;
with c as (insert into public.categories (tenant_id, name) values (tests.id('t'), 'BBQ') returning id) insert into tests.ids select 'cat', id from c;
insert into tests.ids values ('grp', public.save_modifier_group(
  jsonb_build_object('tenant_id', tests.id('t'), 'name', 'Sauce', 'min_select', 0, 'max_select', 2),
  '[{"name":"Raita","price_minor":0},{"name":"Mayo","price_minor":7000}]'));
insert into tests.ids select 'm_mayo', id from public.modifiers where name = 'Mayo';
insert into tests.ids select 'm_raita', id from public.modifiers where name = 'Raita';
insert into tests.ids values ('tikka', public.save_product(
  jsonb_build_object('tenant_id', tests.id('t'), 'category_id', tests.id('cat'), 'name', 'Chicken Tikka'),
  '[{"name":"Quarter","price_minor":45000,"is_default":true},{"name":"Half","price_minor":85000}]',
  array[tests.id('grp')]));
insert into tests.ids select 'quarter', id from public.product_variants where name = 'Quarter';
insert into tests.ids select 'half', id from public.product_variants where name = 'Half';
insert into tests.ids values ('inv_w', public.invite_member(tests.id('t'), 'wasim@example.com', (select id from public.roles where template_key = 'waiter'), true));
select tests.act_as('00000000-0000-0000-0000-00000000c333');
select public.accept_invite(tests.v('inv_w'));
select tests.act_as('00000000-0000-0000-0000-00000000a111');

-- Items, supplier, purchases ----------------------------------------------------
insert into tests.ids values ('chicken', tests.inv('Chicken', 'kg', 5)), ('oil', tests.inv('Cooking oil', 'l', 1)), ('mayo', tests.inv('Mayo', 'kg', 2));
select throws_ok($$ select tests.inv('Chicken', 'kg') $$, '23505', 'An item with this name already exists', 'item names are unique');
insert into tests.ids values ('sup', public.save_supplier(jsonb_build_object('tenant_id', tests.id('t'), 'name', 'Sabzi Mandi Traders', 'phone', '03001112223')));

insert into tests.ids values ('po', public.save_purchase(jsonb_build_object('tenant_id', tests.id('t'), 'branch_id', tests.id('b'),
  'supplier_id', tests.id('sup'), 'items', jsonb_build_array(
    jsonb_build_object('item_id', tests.id('chicken'), 'quantity', 10, 'total_minor', 800000),
    jsonb_build_object('item_id', tests.id('oil'), 'quantity', 5, 'total_minor', 250000),
    jsonb_build_object('item_id', tests.id('mayo'), 'quantity', 2, 'total_minor', 120000)))));
select is((select row(status, total_minor)::text from public.purchases where id = tests.id('po')), row('draft', 1170000::bigint)::text,
  'a purchase order starts as a draft with its total');
select is(tests.stock('Chicken'), null, 'a draft does not change stock');
select public.receive_purchase(tests.id('po'));
select is(tests.stock('Chicken'), 10.000, 'receiving puts stock in');
select is((select avg_cost_minor from public.inventory_items where id = tests.id('chicken')), 80000.0000, 'cost per kg from the purchase');
select throws_ok($$ select public.receive_purchase(tests.id('po')) $$, 'P0001', 'This purchase is already received', 'cannot receive twice');

select tests.buy(jsonb_build_array(jsonb_build_object('item_id', tests.id('chicken'), 'quantity', 10, 'total_minor', 1000000)));
select is((select avg_cost_minor from public.inventory_items where id = tests.id('chicken')), 90000.0000,
  'moving average: (10 × 800 + 10 × 1,000) / 20 = Rs 900/kg');

-- Recipes ------------------------------------------------------------------------
select public.save_recipe(tests.id('t'), jsonb_build_object('product_id', tests.id('tikka')),
  jsonb_build_array(jsonb_build_object('item_id', tests.id('chicken'), 'quantity', 0.25), jsonb_build_object('item_id', tests.id('oil'), 'quantity', 0.02)));
select public.save_recipe(tests.id('t'), jsonb_build_object('variant_id', tests.id('half')),
  jsonb_build_array(jsonb_build_object('item_id', tests.id('chicken'), 'quantity', 0.5), jsonb_build_object('item_id', tests.id('oil'), 'quantity', 0.03)));
select public.save_recipe(tests.id('t'), jsonb_build_object('modifier_id', tests.id('m_mayo')),
  jsonb_build_array(jsonb_build_object('item_id', tests.id('mayo'), 'quantity', 0.05)));
select throws_ok($$ select public.save_recipe(tests.id('t'), jsonb_build_object('product_id', tests.id('tikka')),
  jsonb_build_array(jsonb_build_object('item_id', tests.id('chicken'), 'quantity', 0))) $$, '22023', null, 'recipe quantities must be above zero');

select is((select (c ->> 'cost_minor')::bigint from jsonb_array_elements(public.menu_costing(tests.id('t'))) c where c ->> 'variant_id' = tests.v('quarter')),
  23500::bigint, 'Quarter costs 0.25 × 900 + 0.02 × 500 = Rs 235 (product recipe)');
select is((select row((c ->> 'cost_minor')::bigint, (c ->> 'margin_pct')::numeric)::text from jsonb_array_elements(public.menu_costing(tests.id('t'))) c
           where c ->> 'variant_id' = tests.v('half')), row(46500::bigint, 45.3)::text, 'Half uses its own recipe: Rs 465, 45.3% margin');

-- Sales deduct, cancellations return -----------------------------------------------
select tests.act_as_anon();
select public.place_guest_order(tests.v('tok_t1'), jsonb_build_array(
  tests.item('tikka', 'quarter', array['m_mayo'], 2), tests.item('tikka', 'half', array['m_raita'])));
select tests.act_as('00000000-0000-0000-0000-00000000a111');
select is(tests.stock('Chicken'), 19.000, 'chicken: 2 × 0.25 + 1 × 0.5 = 1 kg used');
select is(tests.stock('Cooking oil'), 4.930, 'oil: 2 × 0.02 + 0.03 = 0.07 L used');
select is(tests.stock('Mayo'), 1.900, 'mayo add-on: 2 × 0.05 kg');

select tests.act_as_anon();
insert into tests.ids select 'o2', public.place_guest_order(tests.v('tok_t2'), jsonb_build_array(tests.item('tikka', 'half'))) ->> 'order_id';
select tests.act_as('00000000-0000-0000-0000-00000000a111');
select is(tests.stock('Chicken'), 18.500, 'a second order takes more');
select public.update_order_status(tests.id('o2'), 'cancelled', 'Guest left');
select is(tests.stock('Chicken'), 19.000, 'cancelling puts it back');
select is((select count(*)::int from public.stock_movements where kind = 'sale_reversal'), 2, 'as reversal entries in the ledger');

-- Wastage, counts ------------------------------------------------------------------
select throws_ok($$ select public.record_wastage(tests.id('b'), tests.id('chicken'), 0.5, '') $$, '22023', null, 'wastage needs a reason');
select public.record_wastage(tests.id('b'), tests.id('chicken'), 0.5, 'Dropped on the floor');
select is(tests.stock('Chicken'), 18.500, 'wastage takes stock out');
select is(public.count_stock(tests.id('b'), jsonb_build_array(
  jsonb_build_object('item_id', tests.id('oil'), 'counted', 4.9), jsonb_build_object('item_id', tests.id('chicken'), 'counted', 18.5))), 1,
  'a count only records differences');
select is(tests.stock('Cooking oil'), 4.900, 'stock matches the count');

select ok(exists (select 1 from jsonb_array_elements(public.low_stock(tests.id('t'))) x where x ->> 'name' = 'Mayo'),
  'mayo at 1.9 kg is below its 2 kg reorder level');
select ok(not exists (select 1 from jsonb_array_elements(public.low_stock(tests.id('t'))) x where x ->> 'name' = 'Chicken'),
  'chicken is fine');

-- Profit & loss --------------------------------------------------------------------
select public.open_shift(tests.id('b'), 0);
select public.take_payment(public.open_table_bill((select s.id from public.table_sessions s join public.tables t on t.id = s.table_id where t.label = 'T1')), 'cash', 189000);
select public.save_expense(jsonb_build_object('tenant_id', tests.id('t'), 'branch_id', tests.id('b'), 'category', 'gas', 'amount_minor', 300000));
select is(public.profit_loss(tests.id('t'), null, private.branch_today(tests.id('b')), private.branch_today(tests.id('b'))),
  jsonb_build_object('net_sales_minor', 189000, 'food_cost_minor', 99500, 'wastage_minor', 45000, 'stock_count_minor', 1500,
    'gross_profit_minor', 43000, 'expenses', jsonb_build_array(jsonb_build_object('category', 'gas', 'amount_minor', 300000)),
    'expenses_minor', 300000, 'net_profit_minor', -257000, 'food_cost_pct', 52.6),
  'P&L: Rs 1,890 sales − Rs 995 food − Rs 450 waste − Rs 15 count − Rs 3,000 gas');
select is((select (x ->> 'used_cost_minor')::bigint from jsonb_array_elements(public.inventory_report(tests.id('t'), null,
  private.branch_today(tests.id('b')), private.branch_today(tests.id('b')))) x where x ->> 'name' = 'Chicken'), 90000::bigint,
  'usage report: 1 kg of chicken used = Rs 900');

-- Permissions & plan ------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000c333');
select is((select count(*)::int from public.inventory_items), 0, 'waiters cannot see inventory');
select throws_ok($$ select public.record_wastage(tests.id('b'), tests.id('chicken'), 1, 'x') $$, '42501', null, 'or change it');

reset role;
update public.subscriptions set plan_id = (select id from public.subscription_plans where code = 'starter') where tenant_id = tests.id('t');
select tests.act_as('00000000-0000-0000-0000-00000000a111');
select throws_ok($$ select tests.inv('Rice', 'kg') $$, 'P0001', 'Inventory is not included in your plan. Upgrade to use it.',
  'inventory needs a plan that includes it');
select tests.act_as_anon();
select public.place_guest_order(tests.v('tok_t2'), jsonb_build_array(tests.item('tikka', 'half')));
select tests.act_as('00000000-0000-0000-0000-00000000a111');
reset role;
select is(tests.stock('Chicken'), 18.500, 'and sales stop deducting stock without it');

select * from finish();
rollback;
