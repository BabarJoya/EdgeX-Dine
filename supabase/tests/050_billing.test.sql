-- =============================================================================
-- Billing tests (pgTAP): taxes by payment method, service charge, discounts,
-- split / mixed payments, cash change, shifts, refunds, receipts, PIN
-- operators, permissions and isolation.
--
-- Karachi Grill, Clifton: tax 16% cash / 5% card, service charge 10%.
-- Nadia = Cashier, Wasim = Waiter, Sara = another restaurant.
-- Tikka Rs 1,000, Lassi Rs 200.
-- =============================================================================
begin;
select plan(53);

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-00000000a111', 'ali@karachigrill.pk', '{"full_name":"Ali"}',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000b222', 'sara@lahorebites.pk', '{"full_name":"Sara"}',  'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c333', 'wasim@example.com',   '{"full_name":"Wasim"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000d444', 'nadia@example.com',   '{"full_name":"Nadia"}', 'authenticated', 'authenticated');

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
create function tests.bill(k text) returns public.bills language sql as $$ select * from public.bills where id = tests.id(k) $$;
grant execute on all functions in schema tests to authenticated, anon;

-- Fixtures --------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000b222');
insert into tests.ids values ('t_sara', public.create_tenant('Lahore Bites', 'lahore-bites', 'Gulberg'));

select tests.act_as('00000000-0000-0000-0000-00000000a111');
insert into tests.ids values ('t_ali', public.create_tenant('Karachi Grill', 'karachi-grill', 'Clifton'));
insert into tests.ids select 'branch', id from public.branches;
update public.branches set tax_label = 'PRA Sales Tax', tax_cash_bps = 1600, tax_card_bps = 500, service_charge_bps = 1000;
insert into public.tables (tenant_id, branch_id, label) values (tests.id('t_ali'), tests.id('branch'), 'T1');
insert into tests.ids select 'tok_t1', qr_token from public.tables;
with c as (insert into public.categories (tenant_id, name) values (tests.id('t_ali'), 'Main') returning id)
insert into tests.ids select 'cat', id from c;
insert into tests.ids values ('p_tikka', public.save_product(jsonb_build_object('tenant_id', tests.id('t_ali'), 'category_id', tests.id('cat'), 'name', 'Tikka', 'price_minor', 100000)));
insert into tests.ids values ('p_lassi', public.save_product(jsonb_build_object('tenant_id', tests.id('t_ali'), 'category_id', tests.id('cat'), 'name', 'Lassi', 'price_minor', 20000)));
insert into tests.ids values ('inv_n', public.invite_member(tests.id('t_ali'), 'nadia@example.com', (select id from public.roles where template_key = 'cashier'), true));
insert into tests.ids values ('inv_w', public.invite_member(tests.id('t_ali'), 'wasim@example.com', (select id from public.roles where template_key = 'waiter'), true));
select tests.act_as('00000000-0000-0000-0000-00000000d444');
select public.accept_invite(tests.v('inv_n'));
select tests.act_as('00000000-0000-0000-0000-00000000c333');
select public.accept_invite(tests.v('inv_w'));
update public.branches set tax_cash_bps = 0;
select tests.act_as('00000000-0000-0000-0000-00000000a111');
select is((select tax_cash_bps from public.branches), 1600, 'only managers can change tax settings');

-- Guest orders at T1: 2 × Tikka + Lassi = Rs 2,200
select tests.act_as_anon();
select public.place_guest_order(tests.v('tok_t1'), jsonb_build_array(tests.item('p_tikka', 2), tests.item('p_lassi')));

-- Dine-in bill ----------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000d444');
insert into tests.ids values ('bill', public.open_table_bill((select id from public.table_sessions where status = 'open')));
select is((tests.bill('bill')).subtotal_minor, 220000::bigint, 'bill subtotal is the sum of the sitting''s orders');
select is((tests.bill('bill')).service_minor, 22000::bigint, '10% service charge on dine-in');
select is((tests.bill('bill')).base_minor, 242000::bigint, 'amount before tax');
select is(public.open_table_bill((select id from public.table_sessions where status = 'open')), tests.id('bill'), 'one bill per sitting');

select throws_ok($$ select public.take_payment(tests.id('bill'), 'cash', 1000) $$, 'P0001', 'Open a cash shift before taking payments', 'payments need an open shift');
insert into tests.ids values ('shift_n', public.open_shift(tests.id('branch'), 500000));
select throws_ok($$ select public.open_shift(tests.id('branch'), 0) $$, 'P0001', null, 'one open shift per cashier');
select throws_ok($$ select public.apply_bill_discount(tests.id('bill'), 20000, 'Regular') $$, '42501', null, 'cashiers cannot give discounts');

select tests.act_as('00000000-0000-0000-0000-00000000c333');
select throws_ok($$ select public.take_payment(tests.id('bill'), 'cash', 1000) $$, '42501', null, 'waiters cannot take payments');
select throws_ok($$ select public.apply_bill_discount(tests.id('bill'), 20000, 'Friend') $$, 'P0002', null, 'waiters cannot touch bills at the POS');

select tests.act_as('00000000-0000-0000-0000-00000000a111');
select throws_ok($$ select public.apply_bill_discount(tests.id('bill'), 20000, '') $$, '22023', null, 'discounts need a reason');
select throws_ok($$ select public.apply_bill_discount(tests.id('bill'), 999999, 'Too much') $$, '22023', null, 'discount cannot exceed the bill');
select public.apply_bill_discount(tests.id('bill'), 20000, 'Regular guest');
select is((tests.bill('bill')).base_minor, 220000::bigint, 'discount applies before service charge: (2,200 − 200) + 10%');

-- Split: half cash (16%), half card (5%)
select tests.act_as('00000000-0000-0000-0000-00000000d444');
select is((public.take_payment(tests.id('bill'), 'cash', 110000, 130000) ->> 'change_minor')::bigint, 2400::bigint,
  'cash half: 1,100 + 16% = 1,276; change from 1,300 is 24');
select is((select amount_minor from public.payments where method = 'cash'), 127600::bigint, 'cash portion taxed at 16%');
select throws_ok($$ select public.take_payment(tests.id('bill'), 'card', 120000) $$, '22023', null, 'cannot pay more than what is left');
select throws_ok($$ select public.take_payment(tests.id('bill'), 'card', 110000, 200000) $$, '22023', null, 'cash received only applies to cash');
select is(public.take_payment(tests.id('bill'), 'card', 110000, null, '4821') ->> 'bill_status', 'paid', 'card half settles the bill');
select is((select amount_minor from public.payments where method = 'card'), 115500::bigint, 'card portion taxed at 5%');
select is((tests.bill('bill')).tax_minor, 23100::bigint, 'bill tax is the sum of each payment''s tax');
select is((tests.bill('bill')).paid_total_minor, 243100::bigint, 'guest paid 2,431 in total');
select ok((tests.bill('bill')).paid_at is not null, 'paid time recorded');

select tests.act_as('00000000-0000-0000-0000-00000000a111');
select throws_ok($$ select public.apply_bill_discount(tests.id('bill'), 0, 'x') $$, 'P0001', null, 'no discount changes after payment');

-- More food after paying reopens the bill for the difference
select tests.act_as_anon();
select public.place_guest_order(tests.v('tok_t1'), jsonb_build_array(tests.item('p_lassi')));
select tests.act_as('00000000-0000-0000-0000-00000000d444');
select is((tests.bill('bill')).status::text, 'open', 'a new order on the table reopens the bill');
select is((tests.bill('bill')).base_minor - (tests.bill('bill')).paid_base_minor, 22000::bigint, 'only the new Lassi + service is due');
select public.take_payment(tests.id('bill'), 'cash', 22000);
select is((tests.bill('bill')).status::text, 'paid', 'settled again');

-- Takeaway at the counter
with r as (select public.create_counter_order(tests.id('branch'), 'takeaway', jsonb_build_array(tests.item('p_tikka')), '', 'Bilal', '03001234567') j)
insert into tests.ids select 'bill_ta', j ->> 'bill_id' from r;
insert into tests.ids select 'receipt', receipt_token from public.bills where id = tests.id('bill_ta');
select is((tests.bill('bill_ta')).service_minor, 0::bigint, 'no service charge on takeaway');
select is((tests.bill('bill_ta')).customer_name, 'Bilal', 'customer details saved on the bill');
select is((public.take_payment(tests.id('bill_ta'), 'cash', 100000) ->> 'amount_minor')::bigint, 116000::bigint, 'takeaway cash with 16% tax');
select throws_ok($$ select public.create_counter_order(tests.id('branch'), 'dine_in', jsonb_build_array(tests.item('p_tikka'))) $$,
  '22023', null, 'dine-in must go through a table');

-- Other restaurant -------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000b222');
select is((select count(*)::int from public.bills), 0, 'another restaurant cannot see bills');
select is((select count(*)::int from public.payments), 0, 'or payments');
select throws_ok($$ select public.take_payment(tests.id('bill_ta'), 'cash', 1) $$, '42501', null, 'or take payments on them');
select throws_ok($$ select count(*) from public.staff_pins $$, '42501', null, 'PIN hashes are never readable');
select throws_ok($$ insert into public.payments (tenant_id, branch_id, bill_id, shift_id, method, base_minor, tax_bps, tax_minor, amount_minor, received_by)
                    values (tests.id('t_ali'), tests.id('branch'), tests.id('bill'), tests.id('shift_n'), 'cash', 1, 0, 0, 1, auth.uid()) $$,
  '42501', null, 'payments cannot be inserted directly');

-- Refunds ----------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000d444');
select throws_ok($$ select public.refund_payment((select id from public.payments where method = 'card'), 'Wrong card') $$,
  '42501', null, 'cashiers cannot refund');
select tests.act_as('00000000-0000-0000-0000-00000000a111');
select throws_ok($$ select public.refund_payment((select id from public.payments where method = 'card'), 'Wrong card') $$,
  'P0001', null, 'refunds also need an open shift');
insert into tests.ids values ('shift_a', public.open_shift(tests.id('branch'), 0));
select public.refund_payment((select id from public.payments where method = 'card'), 'Charged the wrong card');
select is((tests.bill('bill')).status::text, 'refunded', 'refunded bill is marked');
select throws_ok($$ select public.refund_payment((select id from public.payments where method = 'card'), 'Again') $$,
  'P0001', null, 'a payment can be refunded once');

-- PIN operators on a shared POS ----------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000d444');
select throws_ok($$ select public.set_my_pin(tests.id('t_ali'), '123456') $$, '22023', null, 'obvious PINs rejected');
select public.set_my_pin(tests.id('t_ali'), '482913');
select tests.act_as('00000000-0000-0000-0000-00000000a111');
select throws_ok($$ select public.set_my_pin(tests.id('t_ali'), '482913') $$, '23505', null, 'PINs are unique within a restaurant');
-- The owner's device is the shared POS; Nadia unlocks it with her PIN.
insert into tests.ids select 'op', public.pos_unlock(tests.id('branch'), '482913') ->> 'token';
with r as (select public.create_counter_order(tests.id('branch'), 'takeaway', jsonb_build_array(tests.item('p_lassi')), '', null, null, tests.v('op')) j)
insert into tests.ids select 'bill_op', j ->> 'bill_id' from r;
select public.take_payment(tests.id('bill_op'), 'cash', 20000, null, null, '', tests.v('op'));
select is((select received_by from public.payments where bill_id = tests.id('bill_op')), '00000000-0000-0000-0000-00000000d444'::uuid,
  'payment is recorded under the cashier who unlocked with her PIN');
select is((select shift_id from public.payments where bill_id = tests.id('bill_op')), tests.id('shift_n'), 'and goes into her cash drawer');
select is(public.pos_unlock(tests.id('branch'), '000001') ->> 'error', 'bad_pin', 'wrong PIN rejected');
select public.pos_unlock(tests.id('branch'), '000009') from generate_series(1, 4);
select is(public.pos_unlock(tests.id('branch'), '482913') ->> 'error', 'locked', 'five wrong PINs lock the device, even for the right PIN');

select tests.act_as('00000000-0000-0000-0000-00000000c333');
select throws_ok($$ select public.pos_unlock(tests.id('branch'), '482913') $$, '42501', null, 'a waiter''s phone cannot become a POS');
select throws_ok(format($$ select public.take_payment(tests.id('bill_ta'), 'cash', 1, null, null, '', %L) $$, tests.v('op')),
  '42501', null, 'a cashier token only works on the device that unlocked it');

-- Shift close & report ----------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000d444');
select public.record_cash_movement(tests.id('shift_n'), 'out', 10000, 'Bought ice');
-- Expected: float 5,000 + cash 1,276 + 255.20 + 1,160 + 232 (PIN sale, +16%) − 100 out
select is((public.close_shift(tests.id('shift_n'), 777000, 'Counted twice') ->> 'expected_cash_minor')::bigint,
  (500000 + 127600 + 25520 + 116000 + 23200 - 10000)::bigint, 'expected cash = float + cash takings − cash out');
select is((select variance_minor from public.cash_shifts where id = tests.id('shift_n')), 777000::bigint - (500000 + 127600 + 25520 + 116000 + 23200 - 10000),
  'shortage / excess recorded');
select is(((public.shift_report(tests.id('shift_n')) -> 'by_method' -> 'cash') ->> 'count')::int, 4, 'Z-report counts cash payments');
select throws_ok($$ select public.take_payment(tests.id('bill_ta'), 'cash', 1) $$, 'P0001', null, 'no payments after closing the shift');

-- Receipts ------------------------------------------------------------------------------
select tests.act_as_anon();
select is(jsonb_array_length(public.get_receipt(tests.v('receipt')) -> 'items'), 1, 'receipt link shows the items');
select is(public.get_receipt('not-a-real-token'), null, 'unknown receipt links show nothing');

select * from finish();
rollback;
