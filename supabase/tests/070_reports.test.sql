-- =============================================================================
-- Reports (pgTAP): the numbers are right, scoped to what the caller may see,
-- gated by permission and plan.
--
-- Karachi Grill, tax 16% cash / 5% card, no service charge.
--   Clifton: guest order 2 × Tikka (1,000) + Lassi (200) = 2,200, paid cash
--            takeaway Lassi = 200, paid card
--            one cancelled order (Lassi)
--   DHA:     guest order Tikka = 1,000, paid cash
-- Expected: net sales 3,400; tax 352 + 10 + 160 = 522; 3 orders; 1 cancelled.
-- =============================================================================
begin;
select plan(24);

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-00000000a111', 'ali@karachigrill.pk', '{"full_name":"Ali"}',    'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000b222', 'sara@lahorebites.pk', '{"full_name":"Sara"}',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c333', 'wasim@example.com',   '{"full_name":"Wasim"}',  'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e555', 'kamran@example.com',  '{"full_name":"Kamran"}', 'authenticated', 'authenticated');

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
create function tests.item(p text, qty int default 1) returns jsonb language sql as $$
  select jsonb_build_object('product_id', tests.id(p), 'quantity', qty) $$;
create function tests.report(b text default null) returns jsonb language sql as $$
  select public.sales_report(tests.id('t'), tests.id(b), current_date - 6, current_date + 1) $$;
grant execute on all functions in schema tests to authenticated, anon;

-- Fixtures --------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000b222');
insert into tests.ids values ('t_sara', public.create_tenant('Lahore Bites', 'lahore-bites', 'Gulberg'));

select tests.act_as('00000000-0000-0000-0000-00000000a111');
insert into tests.ids values ('t', public.create_tenant('Karachi Grill', 'karachi-grill', 'Clifton'));
insert into public.branches (tenant_id, name) values (tests.id('t'), 'DHA');
update public.branches set tax_cash_bps = 1600, tax_card_bps = 500;
insert into tests.ids select 'b_clifton', id from public.branches where name = 'Clifton';
insert into tests.ids select 'b_dha', id from public.branches where name = 'DHA';
insert into public.tables (tenant_id, branch_id, label) values (tests.id('t'), tests.id('b_clifton'), 'C1'), (tests.id('t'), tests.id('b_dha'), 'D1');
insert into tests.ids select 'tok_' || lower(label), qr_token from public.tables;
with c as (insert into public.categories (tenant_id, name) values (tests.id('t'), 'BBQ') returning id) insert into tests.ids select 'cat_bbq', id from c;
with c as (insert into public.categories (tenant_id, name) values (tests.id('t'), 'Drinks') returning id) insert into tests.ids select 'cat_drinks', id from c;
insert into tests.ids values ('tikka', public.save_product(jsonb_build_object('tenant_id', tests.id('t'), 'category_id', tests.id('cat_bbq'), 'name', 'Tikka', 'price_minor', 100000)));
insert into tests.ids values ('lassi', public.save_product(jsonb_build_object('tenant_id', tests.id('t'), 'category_id', tests.id('cat_drinks'), 'name', 'Lassi', 'price_minor', 20000)));
insert into tests.ids values ('inv_w', public.invite_member(tests.id('t'), 'wasim@example.com', (select id from public.roles where template_key = 'waiter'), true));
insert into tests.ids values ('inv_k', public.invite_member(tests.id('t'), 'kamran@example.com', (select id from public.roles where template_key = 'branch_manager'), false, array[tests.id('b_clifton')]));
select tests.act_as('00000000-0000-0000-0000-00000000c333');
select public.accept_invite(tests.v('inv_w'));
select tests.act_as('00000000-0000-0000-0000-00000000e555');
select public.accept_invite(tests.v('inv_k'));

-- Sales
select tests.act_as_anon();
select public.place_guest_order(tests.v('tok_c1'), jsonb_build_array(tests.item('tikka', 2), tests.item('lassi')));
select public.place_guest_order(tests.v('tok_d1'), jsonb_build_array(tests.item('tikka')));
with r as (select public.place_guest_order(tests.v('tok_c1'), jsonb_build_array(tests.item('lassi'))) j)
insert into tests.ids select 'o_cancel', j ->> 'order_id' from r;

select tests.act_as('00000000-0000-0000-0000-00000000a111');
select public.update_order_status(tests.id('o_cancel'), 'cancelled', 'Guest changed mind');
select public.open_shift(tests.id('b_clifton'), 0);
select public.open_shift(tests.id('b_dha'), 0);
select public.take_payment(public.open_table_bill((select s.id from public.table_sessions s join public.tables t on t.id = s.table_id where t.label = 'C1')), 'cash', 220000);
select public.take_payment(public.open_table_bill((select s.id from public.table_sessions s join public.tables t on t.id = s.table_id where t.label = 'D1')), 'cash', 100000);
select public.take_payment((public.create_counter_order(tests.id('b_clifton'), 'takeaway', jsonb_build_array(tests.item('lassi'))) ->> 'bill_id')::uuid, 'card', 20000);
-- Kitchen: mark one ticket ready so prep times exist
select public.update_ticket_status((select id from public.kitchen_tickets limit 1), 'ready');
-- A guest request answered by Wasim
select tests.act_as_anon();
select public.create_guest_request(tests.v('tok_c1'), 'water');
select tests.act_as('00000000-0000-0000-0000-00000000c333');
select public.respond_guest_request((select id from public.guest_requests limit 1), 'acknowledged');

-- Owner: whole restaurant -----------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000a111');
select is((tests.report() -> 'totals' ->> 'net_sales_minor')::bigint, 340000::bigint, 'net sales = 2,200 + 200 + 1,000');
select is((tests.report() -> 'totals' ->> 'tax_minor')::bigint, 52200::bigint, 'tax by payment method: 352 + 10 + 160');
select is((tests.report() -> 'totals' ->> 'collected_minor')::bigint, 392200::bigint, 'collected incl. tax');
select is((tests.report() -> 'totals' ->> 'orders')::int, 3, 'orders exclude the cancelled one (two tables + takeaway)');
select is((tests.report() -> 'totals' ->> 'cancelled_orders')::int, 1, 'cancelled orders counted separately');
select is((tests.report() -> 'totals' ->> 'bills')::int, 3, 'three paid bills');
select is((tests.report() -> 'totals' ->> 'avg_bill_minor')::bigint, 113333::bigint, 'average bill = 3,400 / 3');
select is(jsonb_array_length(tests.report() -> 'daily'), 8, 'one row per day in the range, including empty days');
select is((tests.report() -> 'top_items' -> 0 ->> 'name'), 'Tikka', 'best seller by revenue');
select is((tests.report() -> 'top_items' -> 0 ->> 'quantity')::int, 3, 'with quantity sold');
select is((select (c ->> 'revenue_minor')::bigint from jsonb_array_elements(tests.report() -> 'categories') c where c ->> 'name' = 'Drinks'),
  40000::bigint, 'category revenue excludes cancelled items');
select is((select (m ->> 'payments')::int from jsonb_array_elements(tests.report() -> 'payment_methods') m where m ->> 'method' = 'cash'), 2,
  'payment method breakdown');
select is(jsonb_array_length(tests.report() -> 'branches'), 2, 'branch comparison lists both branches');
select is((tests.report('b_dha') -> 'totals' ->> 'net_sales_minor')::bigint, 100000::bigint, 'filtered to one branch');
select ok((select (k ->> 'tickets')::int from jsonb_array_elements(tests.report() -> 'kitchen') k limit 1) >= 1, 'kitchen prep times are reported');
select ok((select (s ->> 'requests_handled')::int from jsonb_array_elements(tests.report() -> 'staff') s where s ->> 'name' = 'Wasim') = 1,
  'staff performance includes guest requests handled');
select is((public.dashboard_today(tests.id('t'), null) ->> 'net_sales_minor')::bigint, 340000::bigint, 'dashboard shows today''s sales');
select throws_ok($$ select public.sales_report(tests.id('t'), null, current_date - 400, current_date) $$, '22023', null, 'ranges are capped at a year');

-- Branch manager (Clifton only) sees only Clifton -----------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000e555');
select is((tests.report() -> 'totals' ->> 'net_sales_minor')::bigint, 240000::bigint, 'branch manager sees only their branch');
select throws_ok($$ select tests.report('b_dha') $$, '42501', null, 'and cannot ask for another branch');

-- No access ---------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000c333');
select throws_ok($$ select tests.report() $$, '42501', null, 'waiters cannot see reports');
select tests.act_as('00000000-0000-0000-0000-00000000b222');
select throws_ok($$ select tests.report() $$, '42501', null, 'another restaurant cannot see them');
select is(public.dashboard_today(tests.id('t'), null), null, 'or its dashboard');

-- Plan feature ------------------------------------------------------------------------
reset role;
update public.subscriptions set plan_id = (select id from public.subscription_plans where code = 'starter') where tenant_id = tests.id('t');
select tests.act_as('00000000-0000-0000-0000-00000000a111');
select throws_ok($$ select tests.report() $$, 'P0001', 'Reports are not included in your plan. Upgrade to use them.', 'reports need a plan that includes them');

select * from finish();
rollback;
