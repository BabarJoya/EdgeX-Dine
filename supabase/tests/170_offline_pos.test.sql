-- =============================================================================
-- Offline POS sync (pgTAP): idempotent replay, completed + back-dated,
-- price-change flag, needs a shift and POS permission.
-- =============================================================================
begin;
select plan(11);

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-00000000a111', 'ali@karachigrill.pk', '{"full_name":"Ali"}',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c333', 'wasim@example.com',   '{"full_name":"Wasim"}', 'authenticated', 'authenticated');

create schema tests;
create function tests.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create table tests.ids (k text primary key, v text);
grant usage on schema tests to authenticated;
grant all on tests.ids to authenticated;
create function tests.id(k text) returns uuid language sql as $$ select v::uuid from tests.ids where ids.k = id.k $$;
create function tests.v(k text) returns text language sql as $$ select v from tests.ids where ids.k = v.k $$;
create function tests.sync(ref uuid, charged bigint, method public.payment_method default 'cash') returns jsonb language sql as $$
  select public.sync_offline_sale(tests.id('b'), ref, 'takeaway',
    jsonb_build_array(jsonb_build_object('product_id', tests.id('tikka'), 'quantity', 2)), 'Offline', 'Hamza', '0300 1234567',
    method, now() - interval '2 hours', charged) $$;
grant execute on all functions in schema tests to authenticated;

select tests.act_as('00000000-0000-0000-0000-00000000a111');
insert into tests.ids values ('t', public.create_tenant('Karachi Grill', 'karachi-grill', 'Clifton'));
insert into tests.ids select 'b', id from public.branches where tenant_id = tests.id('t');
update public.branches set tax_cash_bps = 1600 where id = tests.id('b');
with c as (insert into public.categories (tenant_id, name) values (tests.id('t'), 'BBQ') returning id) insert into tests.ids select 'cat', id from c;
insert into tests.ids values ('tikka', public.save_product(jsonb_build_object('tenant_id', tests.id('t'), 'category_id', tests.id('cat'), 'name', 'Tikka', 'price_minor', 100000)));
insert into tests.ids values ('inv_w', public.invite_member(tests.id('t'), 'wasim@example.com', (select id from public.roles where template_key = 'waiter'), true));
insert into tests.ids values ('ref1', gen_random_uuid()), ('ref2', gen_random_uuid()), ('ref3', gen_random_uuid());

select throws_ok($$ select tests.sync(tests.id('ref1'), 232000) $$, 'P0001', 'Open a cash shift before taking payments',
  'a sale needs an open shift to sync (the device keeps it queued)');
select is((select count(*)::int from public.bills), 0, 'and nothing half-created is left');

select public.open_shift(tests.id('b'), 0);
-- 2 × 1,000 + 16% cash tax = 2,320
insert into tests.ids select 'bill1', tests.sync(tests.id('ref1'), 232000) ->> 'bill_id';
select is((select row(status, paid_total_minor, offline_note)::text from public.bills where id = tests.id('bill1')),
  row('paid', 232000::bigint, null::text)::text, 'the offline sale is billed and paid in full');
select is((select status::text from public.orders where bill_id = tests.id('bill1')), 'completed', 'the order is already complete');
select is((select k.status::text from public.kitchen_tickets k join public.orders o on o.id = k.order_id where o.bill_id = tests.id('bill1')),
  'served', 'so the kitchen display does not show it as new');
select ok((select created_at < now() - interval '1 hour' from public.orders where bill_id = tests.id('bill1')),
  'it is dated when the sale happened');

select is(tests.sync(tests.id('ref1'), 232000) ->> 'duplicate', 'true', 'replaying the same sale changes nothing');
select is((select count(*)::int from public.bills), 1, 'no second bill');

-- The till's cached menu was older: it charged Rs 2,088 (Rs 900 each + tax).
insert into tests.ids select 'bill2', tests.sync(tests.id('ref2'), 208800) ->> 'bill_id';
select is((select offline_note from public.bills where id = tests.id('bill2')),
  'Charged 2088.0000000000000000 offline; current prices give 2320.0000000000000000', 'a price difference is flagged on the bill');

select tests.act_as('00000000-0000-0000-0000-00000000c333');
select public.accept_invite(tests.v('inv_w'));
select throws_ok($$ select tests.sync(tests.id('ref3'), 232000) $$, '42501', null, 'staff without the POS cannot sync sales');

select tests.act_as('00000000-0000-0000-0000-00000000a111');
select is((select count(*)::int from public.payments where note = 'Taken while offline'), 2, 'payments are labelled as offline');

select * from finish();
rollback;
