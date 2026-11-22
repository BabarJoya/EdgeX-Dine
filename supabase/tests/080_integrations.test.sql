-- =============================================================================
-- Integrations (pgTAP): settings and secrets, gateway payments completed only
-- by the server, idempotent callbacks, amount checks, refunds flagged.
--
-- Karachi Grill, wallet tax 5%. Bill: 2 x Tikka (1,000) = 2,000 → 2,100 online.
-- =============================================================================
begin;
select plan(27);

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
create function tests.act_as_server() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
end $$;
create table tests.ids (k text primary key, v text);
grant usage on schema tests to authenticated, anon, service_role;
grant all on tests.ids to authenticated, anon, service_role;
create function tests.id(k text) returns uuid language sql as $$ select v::uuid from tests.ids where ids.k = id.k $$;
create function tests.v(k text) returns text language sql as $$ select v from tests.ids where ids.k = v.k $$;
grant execute on all functions in schema tests to authenticated, anon, service_role;

-- Fixtures --------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000a111');
insert into tests.ids values ('t', public.create_tenant('Karachi Grill', 'karachi-grill', 'Clifton'));
update public.branches set tax_cash_bps = 1600, tax_card_bps = 500, tax_wallet_bps = 500 where tenant_id = tests.id('t');
insert into tests.ids select 'b', id from public.branches where tenant_id = tests.id('t');
insert into public.tables (tenant_id, branch_id, label) values (tests.id('t'), tests.id('b'), 'T1');
insert into tests.ids select 'tok', qr_token from public.tables where label = 'T1';
with c as (insert into public.categories (tenant_id, name) values (tests.id('t'), 'BBQ') returning id) insert into tests.ids select 'cat', id from c;
insert into tests.ids values ('tikka', public.save_product(jsonb_build_object('tenant_id', tests.id('t'), 'category_id', tests.id('cat'), 'name', 'Tikka', 'price_minor', 100000)));
insert into tests.ids values ('inv_w', public.invite_member(tests.id('t'), 'wasim@example.com', (select id from public.roles where template_key = 'waiter'), true));
select tests.act_as('00000000-0000-0000-0000-00000000c333');
select public.accept_invite(tests.v('inv_w'));

select tests.act_as_anon();
select public.place_guest_order(tests.v('tok'), jsonb_build_array(jsonb_build_object('product_id', tests.id('tikka'), 'quantity', 2)));
select tests.act_as('00000000-0000-0000-0000-00000000a111');
insert into tests.ids select 'bill', public.open_table_bill((select id from public.table_sessions limit 1));
insert into tests.ids select 'rt', receipt_token from public.bills where id = tests.id('bill');

-- Settings & secrets ------------------------------------------------------------
select throws_ok($$ select public.save_integration(tests.id('t'), 'jazzcash', true, 'sandbox', '{"merchant_id":"MC1"}') $$,
  '22023', 'Add the credentials before turning this on', 'a gateway cannot be enabled without credentials');
select lives_ok($$ select public.save_integration(tests.id('t'), 'jazzcash', true, 'sandbox', '{"merchant_id":"MC1"}',
  '{"password":"pw","integrity_salt":"salt"}') $$, 'owner saves gateway credentials');
select is((select secret_keys from public.tenant_integrations where provider = 'jazzcash'), array['integrity_salt', 'password'],
  'the UI only learns which secrets are saved');
select is((select settings ->> 'merchant_id' from public.tenant_integrations where provider = 'jazzcash'), 'MC1', 'settings are readable by the owner');
select throws_ok($$ select * from private.integration_secrets $$, '42501', null, 'secrets are not readable by signed-in users');
select lives_ok($$ select public.save_integration(tests.id('t'), 'jazzcash', true, 'sandbox', '{"merchant_id":"MC1"}', '{"password":""}') $$,
  'a blank secret removes just that one');
select is((select secret_keys from public.tenant_integrations where provider = 'jazzcash'), array['integrity_salt'], 'password removed, salt kept');
select lives_ok($$ select public.save_integration(tests.id('t'), 'raast', true, 'live',
  '{"raast_id":"03001234567","iban":"PK36SCBL0000001123456702","account_title":"Karachi Grill","bank":"Meezan"}') $$,
  'Raast details need no secrets');
select throws_ok($$ select public.save_integration(tests.id('t'), 'test_gateway', true, 'sandbox', '{}') $$, '22023', null,
  'restaurants cannot turn on the test gateway');
select ok(exists (select 1 from public.audit_logs where action = 'integration.saved' and data ->> 'provider' = 'jazzcash'), 'changes are audited');

select tests.act_as('00000000-0000-0000-0000-00000000c333');
select is((select count(*)::int from public.tenant_integrations), 0, 'waiters cannot see integration settings');
select throws_ok($$ select public.save_integration(tests.id('t'), 'raast', false, 'live', '{}') $$, '42501', null, 'or change them');

-- Guests and browsers cannot complete payments ----------------------------------------
select tests.act_as_anon();
select is((public.get_receipt_payment_options(tests.v('rt')) ->> 'remaining_total_minor')::bigint, 210000::bigint,
  'receipt shows what is left to pay online, incl. wallet tax');
select is(public.get_receipt_payment_options(tests.v('rt')) -> 'providers', '["jazzcash"]'::jsonb, 'and the enabled gateways');
select is(public.get_receipt_payment_options(tests.v('rt')) -> 'raast' ->> 'raast_id', '03001234567', 'and Raast details');
select throws_ok($$ select public.server_start_online_payment(tests.v('rt'), 'jazzcash') $$, '42501', null, 'guests cannot start a payment directly');
select throws_ok($$ select public.server_finish_online_payment('x', true, 1) $$, '42501', null, 'or mark one paid');
select tests.act_as('00000000-0000-0000-0000-00000000a111');
select throws_ok($$ select public.server_finish_online_payment('x', true, 1) $$, '42501', null, 'not even the owner');

-- Server flow -------------------------------------------------------------------
select tests.act_as_server();
select throws_ok($$ select public.server_start_online_payment(tests.v('rt'), 'easypaisa') $$, 'P0001', 'This payment method is not available',
  'only enabled gateways');
insert into tests.ids select 'op1', public.server_start_online_payment(tests.v('rt'), 'jazzcash') ->> 'txn_ref';
select is((public.server_online_payment(tests.v('op1')) -> 'secrets' ->> 'integrity_salt'), 'salt', 'the server gets the secrets to verify callbacks');
insert into tests.ids select 'op2', public.server_start_online_payment(tests.v('rt'), 'jazzcash') ->> 'txn_ref';
select is((select status from public.online_payments where txn_ref = tests.v('op1')), 'expired', 'a new attempt expires the previous one');

select is(public.server_finish_online_payment(tests.v('op2'), true, 200000) ->> 'status', 'failed', 'a wrong amount is not recorded');
select ok((select needs_review from public.online_payments where txn_ref = tests.v('op2')), 'and is flagged for review');

insert into tests.ids select 'op3', public.server_start_online_payment(tests.v('rt'), 'jazzcash') ->> 'txn_ref';
select is(public.server_finish_online_payment(tests.v('op3'), true, 210000, 'T2026112200001', '000', 'Success') ->> 'bill_status', 'paid',
  'a verified payment settles the bill');
select is((select row(method::text, provider, amount_minor, tax_minor, received_by is null)::text from public.payments where bill_id = tests.id('bill')),
  row('wallet', 'jazzcash', 210000::bigint, 10000::bigint, true)::text, 'recorded as a wallet payment from the gateway, with wallet tax');
select is(public.server_finish_online_payment(tests.v('op3'), true, 210000) ->> 'repeat', 'true', 'a repeated callback changes nothing');

-- A late success on the superseded attempt: money was taken, so record + flag.
select is(public.server_finish_online_payment(tests.v('op1'), true, 210000) ->> 'needs_review', 'true',
  'a payment after the bill was settled is flagged for a refund');

select * from finish();
rollback;
