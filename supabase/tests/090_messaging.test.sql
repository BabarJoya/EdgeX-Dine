-- =============================================================================
-- WhatsApp outbox (pgTAP): what gets queued, when, and who can send it.
-- =============================================================================
begin;
select plan(16);

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
grant usage on schema tests to authenticated, service_role, anon;
grant all on tests.ids to authenticated, service_role, anon;
create function tests.id(k text) returns uuid language sql as $$ select v::uuid from tests.ids where ids.k = id.k $$;
create function tests.item(p text, qty int default 1) returns jsonb language sql as $$
  select jsonb_build_object('product_id', tests.id(p), 'quantity', qty) $$;
-- A paid takeaway with an optional phone number.
create function tests.sale(p_phone text) returns uuid language plpgsql as $$
declare v jsonb;
begin
  v := public.create_counter_order(tests.id('b'), 'takeaway', jsonb_build_array(tests.item('tikka')), '', 'Guest', p_phone);
  perform public.take_payment((v ->> 'bill_id')::uuid, 'cash', 100000);
  return (v ->> 'order_id')::uuid;
end $$;
grant execute on all functions in schema tests to authenticated, service_role, anon;

select tests.act_as('00000000-0000-0000-0000-00000000a111');
insert into tests.ids values ('t', public.create_tenant('Karachi Grill', 'karachi-grill', 'Clifton'));
insert into tests.ids select 'b', id from public.branches where tenant_id = tests.id('t');
with c as (insert into public.categories (tenant_id, name) values (tests.id('t'), 'BBQ') returning id) insert into tests.ids select 'cat', id from c;
insert into tests.ids values ('tikka', public.save_product(jsonb_build_object('tenant_id', tests.id('t'), 'category_id', tests.id('cat'), 'name', 'Tikka', 'price_minor', 100000)));
select public.open_shift(tests.id('b'), 0);

select is(private.wa_number('0300-1234567'), '923001234567', 'local mobile → international');
select is(private.wa_number('+92 321 7654321'), '923217654321', 'international kept');
select is(private.wa_number('123'), null, 'too short → no message');

-- WhatsApp off: nothing queued.
select tests.sale('03001234567');
select is((select count(*)::int from public.message_outbox), 0, 'nothing is queued while WhatsApp is off');

select throws_ok($$ select public.save_integration(tests.id('t'), 'whatsapp', true, 'live', '{"phone_number_id":"111"}') $$,
  '22023', null, 'WhatsApp needs an access token');
select public.save_integration(tests.id('t'), 'whatsapp', true, 'live', '{"phone_number_id":"111"}', '{"access_token":"tok"}');

insert into tests.ids select 'o1', tests.sale('0300 1234567');
select is((select row(kind, to_phone, params ->> 'restaurant', (params ->> 'total_minor')::bigint)::text from public.message_outbox),
  row('receipt', '923001234567', 'Karachi Grill', 100000::bigint)::text, 'a paid bill with a phone number queues a receipt');
select tests.sale(null);
select is((select count(*)::int from public.message_outbox), 1, 'no phone number, no message');

select public.update_order_status(tests.id('o1'), 'accepted');
select public.update_order_status(tests.id('o1'), 'ready');
select is((select params ->> 'order_number' from public.message_outbox where kind = 'order_ready')::int,
  (select order_number from public.orders where id = tests.id('o1')), 'a takeaway marked ready queues an order-ready message');
reset role;
update public.orders set status = 'preparing' where id = tests.id('o1');
update public.orders set status = 'ready' where id = tests.id('o1');
select tests.act_as('00000000-0000-0000-0000-00000000a111');
select is((select count(*)::int from public.message_outbox where kind = 'order_ready'), 1, 'at most once per order');

select public.save_integration(tests.id('t'), 'whatsapp', true, 'live', '{"phone_number_id":"111","send_receipts":"false"}');
select tests.sale('03007654321');
select is((select count(*)::int from public.message_outbox where kind = 'receipt'), 1, 'receipts can be turned off');

select is((select count(*)::int from public.message_outbox), 2, 'the owner can see the message log');

-- Sending is server-only.
select throws_ok($$ select public.server_claim_messages(10) $$, '42501', null, 'browsers cannot claim messages (or read tokens)');

select tests.act_as_server();
select is((public.server_claim_messages(10) -> 0 -> 'secrets' ->> 'access_token'), 'tok', 'the server gets the token to send');
select is((select count(*)::int from public.message_outbox where status = 'sending'), 2, 'claimed messages are marked as sending');
select public.server_message_result((select id from public.message_outbox where kind = 'receipt'), true, 'wamid.1');
select public.server_message_result((select id from public.message_outbox where kind = 'order_ready'), false, null, 'Template not approved', true);
select is((select array_agg(status order by kind) from public.message_outbox), array['failed', 'sent'], 'results are recorded');
select is(jsonb_array_length(public.server_claim_messages(10)), 0, 'finished messages are not sent again');

select * from finish();
rollback;
