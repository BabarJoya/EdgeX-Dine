-- =============================================================================
-- Public API and webhooks (pgTAP): keys (hash only, revocable, rate limit),
-- endpoints (HTTPS, no private hosts, secret kept private), events.
-- =============================================================================
begin;
select plan(21);
delete from public.message_outbox;

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-00000000a111', 'ali@karachigrill.pk', '{"full_name":"Ali"}',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c333', 'wasim@example.com',   '{"full_name":"Wasim"}', 'authenticated', 'authenticated');

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
create function tests.v(k text) returns text language sql as $$ select v from tests.ids where ids.k = v.k $$;
create function tests.hash(k text) returns text language sql as $$ select encode(extensions.digest(k, 'sha256'), 'hex') $$;
grant execute on all functions in schema tests to authenticated, service_role;

select tests.act_as('00000000-0000-0000-0000-00000000a111');
insert into tests.ids values ('t', public.create_tenant('Karachi Grill', 'karachi-grill', 'Clifton'));
insert into tests.ids select 'b', id from public.branches where tenant_id = tests.id('t');
with c as (insert into public.categories (tenant_id, name) values (tests.id('t'), 'BBQ') returning id) insert into tests.ids select 'cat', id from c;
insert into tests.ids values ('tikka', public.save_product(jsonb_build_object('tenant_id', tests.id('t'), 'category_id', tests.id('cat'), 'name', 'Tikka', 'price_minor', 100000)));
insert into tests.ids values ('inv_w', public.invite_member(tests.id('t'), 'wasim@example.com', (select id from public.roles where template_key = 'waiter'), true));

select throws_ok($$ select public.create_api_key(tests.id('t'), 'BI') $$, 'P0001', 'The API is part of the Enterprise plan.',
  'the API needs the Enterprise plan');
reset role;
update public.subscriptions set plan_id = (select id from public.subscription_plans where code = 'enterprise') where tenant_id = tests.id('t');
select tests.act_as('00000000-0000-0000-0000-00000000a111');

-- Keys --------------------------------------------------------------------------------
insert into tests.ids select 'key', public.create_api_key(tests.id('t'), 'Accounting') ->> 'key';
select ok(tests.v('key') ~ '^edgx_[A-Za-z0-9_-]{40}$', 'the key is shown once');
select is((select prefix from public.api_keys), left(tests.v('key'), 12), 'only a prefix is kept for display');
select throws_ok($$ select key_hash from public.api_keys $$, '42501', null, 'the hash is not readable by anyone signed in');

select tests.act_as_server();
select is((public.server_api_auth(tests.hash(tests.v('key'))) ->> 'tenant_id')::uuid, tests.id('t'), 'the server resolves a key to its restaurant');
select is((public.server_api_auth(tests.hash('edgx_wrong')) ->> 'status')::int, 401, 'unknown keys are refused');
select is((select max((public.server_api_auth(tests.hash(tests.v('key'))) ->> 'status')::int) from generate_series(1, 125)), 429,
  'more than 120 requests a minute are rate limited');
select is((public.server_api_orders(tests.id('t'), current_date, current_date, null, null, 50, null)), '[]'::jsonb, 'orders endpoint works (none yet)');

select tests.act_as('00000000-0000-0000-0000-00000000a111');
select public.revoke_api_key((select id from public.api_keys limit 1));
select tests.act_as_server();
select is((public.server_api_auth(tests.hash(tests.v('key'))) ->> 'status')::int, 401, 'a revoked key stops working');

-- Webhooks ------------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000a111');
select throws_ok($$ select public.create_webhook(tests.id('t'), 'http://example.com/hook', array['order.created']) $$, '22023', null,
  'webhooks must use HTTPS');
select throws_ok($$ select public.create_webhook(tests.id('t'), 'https://192.168.1.10/hook', array['order.created']) $$, '22023',
  'Use a public address (not localhost or a private network)',
  'and not point into a private network');
select throws_ok($$ select public.create_webhook(tests.id('t'), 'https://localhost/hook', array['order.created']) $$, '22023', null,
  'or at localhost');
insert into tests.ids select 'wh', public.create_webhook(tests.id('t'), 'https://example.com/edgex', array['order.created', 'bill.paid']) ->> 'id';
insert into tests.ids select 'wh_off', public.create_webhook(tests.id('t'), 'https://example.org/edgex', array['order.created']) ->> 'id';
select public.set_webhook_active(tests.id('wh_off'), false);
select throws_ok($$ select * from private.webhook_secrets $$, '42501', null, 'signing secrets are private');

select public.open_shift(tests.id('b'), 0);
insert into tests.ids select 'bill', public.create_counter_order(tests.id('b'), 'takeaway',
  jsonb_build_array(jsonb_build_object('product_id', tests.id('tikka'), 'quantity', 2))) ->> 'bill_id';
select is((select array_agg(params ->> 'event' order by params ->> 'event') from public.message_outbox where channel = 'webhook'),
  array['order.created'], 'a new order emits order.created to active subscribed endpoints only');
select public.take_payment(tests.id('bill'), 'cash', 200000);
select is((select count(*)::int from public.message_outbox where channel = 'webhook' and params ->> 'event' = 'bill.paid'), 1, 'paying emits bill.paid');
select is((select count(*)::int from public.message_outbox where channel = 'webhook' and params ->> 'event' = 'order.status_changed'), 0,
  'events nobody subscribed to are not queued');

select tests.act_as_server();
select is((public.server_webhook_target(tests.id('wh'), (select id from public.orders where bill_id = tests.id('bill'))) -> 'order' -> 'items' -> 0 ->> 'quantity'),
  '2', 'deliveries carry the order with its items');
select ok((public.server_webhook_target(tests.id('wh')) ->> 'secret') like 'whsec_%', 'the sender gets the signing secret');

-- Permissions --------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000c333');
select public.accept_invite(tests.v('inv_w'));
select throws_ok($$ select public.create_api_key(tests.id('t'), 'Mine') $$, '42501', null, 'staff without settings access cannot create keys');
select is((select count(*)::int from public.webhook_endpoints), 0, 'or see webhooks');
select throws_ok($$ select public.server_api_orders(tests.id('t'), current_date, current_date, null, null, 50, null) $$, '42501', null,
  'and nobody signed in can call the server API functions');

select * from finish();
rollback;
