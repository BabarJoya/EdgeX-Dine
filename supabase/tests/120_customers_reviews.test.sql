-- =============================================================================
-- Reviews and customers (pgTAP).
-- =============================================================================
begin;
select plan(15);

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
create function tests.sale(p_name text, p_phone text, p_pay boolean default true) returns text language plpgsql as $$
declare v jsonb;
begin
  v := public.create_counter_order(tests.id('b'), 'takeaway',
         jsonb_build_array(jsonb_build_object('product_id', tests.id('tikka'), 'quantity', 1)), '', p_name, p_phone);
  if p_pay then perform public.take_payment((v ->> 'bill_id')::uuid, 'cash', 100000); end if;
  return (select receipt_token from public.bills where id = (v ->> 'bill_id')::uuid);
end $$;
grant execute on all functions in schema tests to authenticated, anon;

select tests.act_as('00000000-0000-0000-0000-00000000a111');
insert into tests.ids values ('t', public.create_tenant('Karachi Grill', 'karachi-grill', 'Clifton'));
insert into tests.ids select 'b', id from public.branches where tenant_id = tests.id('t');
update public.branches set google_review_url = 'https://g.page/r/karachigrill/review' where id = tests.id('b');
with c as (insert into public.categories (tenant_id, name) values (tests.id('t'), 'BBQ') returning id) insert into tests.ids select 'cat', id from c;
insert into tests.ids values ('tikka', public.save_product(jsonb_build_object('tenant_id', tests.id('t'), 'category_id', tests.id('cat'), 'name', 'Tikka', 'price_minor', 100000)));
insert into tests.ids values ('inv_w', public.invite_member(tests.id('t'), 'wasim@example.com', (select id from public.roles where template_key = 'waiter'), true));
select public.open_shift(tests.id('b'), 0);

insert into tests.ids values ('r1', tests.sale('Hamza', '0300-1234567'));
insert into tests.ids values ('r2', tests.sale('Hamza Khan', '+92 300 1234567'));
insert into tests.ids values ('r3', tests.sale('Sana', '03211112223'));
insert into tests.ids values ('r_open', tests.sale('Sana', '03211112223', false));

select tests.act_as('00000000-0000-0000-0000-00000000c333');
select public.accept_invite(tests.v('inv_w'));

-- Reviews from the receipt link ------------------------------------------------------
select tests.act_as_anon();
select is((public.get_review(tests.v('r1')) ->> 'can_review')::boolean, true, 'a paid bill can be reviewed');
select throws_ok($$ select public.submit_review(tests.v('r_open'), 5) $$, 'P0001', 'This bill can no longer be reviewed', 'an unpaid bill cannot');
select throws_ok($$ select public.submit_review(tests.v('r1'), 6) $$, '22023', null, 'ratings are 1 to 5');
select is(public.submit_review(tests.v('r1'), 5, 'Best tikka in Clifton') ->> 'google_review_url', 'https://g.page/r/karachigrill/review',
  'a happy guest is offered the Google review link');
select is(public.submit_review(tests.v('r3'), 2, 'Cold naan') ->> 'google_review_url', null, 'an unhappy one is not');
select is((public.submit_review(tests.v('r3'), 3, 'Cold naan, nice staff') ->> 'rating')::int, 3, 'a review can be changed');
select throws_ok($$ select count(*) from public.reviews $$, '42501', null, 'guests cannot read reviews directly');

-- Customers --------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000a111');
select is((select count(*)::int from public.reviews), 2, 'one review per bill');
select is(jsonb_array_length(public.customers_list(tests.id('t'))), 2, 'two customers (same number written two ways)');
select is((select row(c ->> 'name', (c ->> 'visits')::int, (c ->> 'spent_minor')::bigint, (c ->> 'avg_rating')::numeric)::text
           from jsonb_array_elements(public.customers_list(tests.id('t'))) c where c ->> 'phone' = '923001234567'),
  row('Hamza Khan', 2, 200000::bigint, 5.0)::text, 'visits, spend, latest name and rating per customer');
select is(jsonb_array_length(public.customers_list(tests.id('t'), null, 'sana')), 1, 'search by name');
select is(jsonb_array_length(public.customers_list(tests.id('t'), null, '0321')), 1, 'search by a local number');
select is(jsonb_array_length(public.customer_detail(tests.id('t'), '0300 1234567') -> 'visits'), 2, 'visit history by phone');
select is(public.customer_insights(tests.id('t'), null, current_date - 1, current_date + 1) - 'recent' - 'distribution',
  jsonb_build_object('customers', 2, 'new_customers', 2, 'returning_customers', 0, 'repeat_in_period', 1, 'reviews', 2, 'avg_rating', 4.00),
  'retention and rating summary for a period');

select tests.act_as('00000000-0000-0000-0000-00000000c333');
select throws_ok($$ select public.customers_list(tests.id('t')) $$, '42501', null, 'waiters cannot see customers');

select * from finish();
rollback;
