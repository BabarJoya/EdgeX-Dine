-- =============================================================================
-- Tax-authority invoices (pgTAP): queued when a bill is paid, stamped with the
-- fiscal number, failures visible and retryable.
-- =============================================================================
begin;
select plan(11);
delete from public.message_outbox;

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-00000000a111', 'ali@karachigrill.pk', '{"full_name":"Ali"}', 'authenticated', 'authenticated');

create schema tests;
create function tests.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function tests.act_as_server() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
end $$;
create table tests.ids (k text primary key, v text);
grant usage on schema tests to authenticated, service_role;
grant all on tests.ids to authenticated, service_role;
create function tests.id(k text) returns uuid language sql as $$ select v::uuid from tests.ids where ids.k = id.k $$;
create function tests.sale() returns uuid language plpgsql as $$
declare v jsonb;
begin
  v := public.create_counter_order(tests.id('b'), 'takeaway',
         jsonb_build_array(jsonb_build_object('product_id', tests.id('tikka'), 'quantity', 2)));
  perform public.take_payment((v ->> 'bill_id')::uuid, 'cash', 200000);
  return (v ->> 'bill_id')::uuid;
end $$;
grant execute on all functions in schema tests to authenticated, service_role;

select tests.act_as('00000000-0000-0000-0000-00000000a111');
insert into tests.ids values ('t', public.create_tenant('Karachi Grill', 'karachi-grill', 'Clifton'));
insert into tests.ids select 'b', id from public.branches where tenant_id = tests.id('t');
update public.branches set tax_cash_bps = 1600 where id = tests.id('b');
with c as (insert into public.categories (tenant_id, name) values (tests.id('t'), 'BBQ') returning id) insert into tests.ids select 'cat', id from c;
insert into tests.ids values ('tikka', public.save_product(jsonb_build_object('tenant_id', tests.id('t'), 'category_id', tests.id('cat'), 'name', 'Tikka', 'price_minor', 100000)));
select public.open_shift(tests.id('b'), 0);

insert into tests.ids select 'bill0', tests.sale();
select is((select fiscal_status from public.bills where id = tests.id('bill0')), null, 'no fiscal invoice while the integration is off');

select throws_ok($$ select public.save_integration(tests.id('t'), 'fbr', true, 'sandbox', '{"authority":"pra","pos_id":"123456"}') $$,
  '22023', null, 'the tax integration needs a token');
select public.save_integration(tests.id('t'), 'fbr', true, 'sandbox', '{"authority":"pra","pos_id":"123456"}', '{"token":"t0k"}');

insert into tests.ids select 'bill1', tests.sale();
select is((select row(fiscal_status, fiscal_authority)::text from public.bills where id = tests.id('bill1')), row('pending', 'pra')::text,
  'a paid bill is queued for the tax authority');
select is((select count(*)::int from public.message_outbox where kind = 'fiscal'), 1, 'once');

select throws_ok($$ select public.retry_fiscal_invoice(tests.id('bill1')) $$, 'P0001', null, 'pending invoices cannot be re-sent');

select tests.act_as_server();
select is((select m -> 'params' -> 'items' -> 0 ->> 'quantity' from jsonb_array_elements(public.server_claim_messages(10)) m), '2',
  'the server gets the invoice lines');
select public.server_message_result((select id from public.message_outbox where kind = 'fiscal'), false, null, 'Invalid POSID', true);
select is((select row(fiscal_status, fiscal_error)::text from public.bills where id = tests.id('bill1')), row('failed', 'Invalid POSID')::text,
  'a rejected invoice is visible on the bill');

select tests.act_as('00000000-0000-0000-0000-00000000a111');
select lives_ok($$ select public.retry_fiscal_invoice(tests.id('bill1')) $$, 'the owner can send it again');
select is((select status from public.message_outbox where kind = 'fiscal'), 'pending', 'it is queued again');

select tests.act_as_server();
select public.server_claim_messages(10);
select public.server_message_result((select id from public.message_outbox where kind = 'fiscal'), true, '123456ABCD7890');
select is((select row(fiscal_status, fiscal_invoice_number)::text from public.bills where id = tests.id('bill1')),
  row('done', '123456ABCD7890')::text, 'the fiscal invoice number is stamped on the bill');

select tests.act_as('00000000-0000-0000-0000-00000000a111');
select is((public.get_receipt((select receipt_token from public.bills where id = tests.id('bill1'))) ->> 'fiscal_invoice_number'),
  '123456ABCD7890', 'and printed on the receipt');

select * from finish();
rollback;
