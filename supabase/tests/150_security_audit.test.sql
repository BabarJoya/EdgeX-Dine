-- =============================================================================
-- Security audit (pgTAP). Schema-wide rules that every future migration must
-- keep, plus a cross-tenant isolation sweep over every table with tenant_id.
-- =============================================================================
begin;
select plan(9);

-- 1. Exactly these functions are callable without signing in (guest links).
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
  array['cancel_my_reservation', 'create_guest_request', 'get_booking_info', 'get_guest_menu', 'get_guest_session',
        'get_invite', 'get_online_info', 'get_receipt', 'get_receipt_payment_options', 'get_reservation', 'get_review',
        'place_guest_order', 'place_online_order', 'request_reservation', 'reservation_slots', 'submit_review',
        'track_online_order'],
  'only the guest functions are callable anonymously');

-- 2. Privileged functions cannot be hijacked through search_path.
select is(
  (select array_agg(n.nspname || '.' || p.proname order by 1) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosecdef
     and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')),
  null, 'every SECURITY DEFINER function pins its search_path');

-- 3. Tables closed to every client (no policies at all) are exactly these.
select is(
  (select array_agg(c.relname::text order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)),
  array['bill_counters', 'order_counters', 'pos_operator_sessions', 'pos_unlock_attempts', 'staff_pins'],
  'internal tables (counters, PINs, POS sessions) have no client access');

-- 4. One permissive policy per table, role and command.
select is(
  (select array_agg(distinct x.tablename || ':' || x.cmd) from (
     select p.tablename, r.role, c.cmd, count(*) as n
     from pg_policies p
     cross join lateral unnest(p.roles) r(role)
     cross join lateral (select unnest(case when p.cmd = 'ALL' then array['SELECT','INSERT','UPDATE','DELETE'] else array[p.cmd] end) as cmd) c
     where p.schemaname = 'public' and p.permissive = 'PERMISSIVE'
     group by 1, 2, 3) x where x.n > 1),
  null, 'no overlapping permissive policies');

-- 5. Every foreign key (except to auth.users) has an index on its first column.
select is(
  (select array_agg(c.conrelid::regclass::text || '.' || a.attname order by 1)
   from pg_constraint c join pg_namespace n on n.oid = c.connamespace
   join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
   where c.contype = 'f' and n.nspname = 'public' and c.confrelid <> 'auth.users'::regclass
     and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])),
  null, 'foreign keys are indexed');

-- 6. Views (if any) run with the caller's rights.
select is(
  (select array_agg(c.relname::text) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and not coalesce(c.reloptions @> array['security_invoker=true'], false)),
  null, 'no SECURITY DEFINER views');

-- 7–9. Cross-tenant isolation ------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-00000000a111', 'ali@karachigrill.pk', '{"full_name":"Ali"}',  'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000b222', 'sara@lahorebites.pk', '{"full_name":"Sara"}', 'authenticated', 'authenticated');

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
-- Rows of tenant p_tenant visible to the caller, per table (RLS applies).
create function tests.visible(p_tenant uuid) returns text[] language plpgsql as $$
declare t text; n int; out text[] := '{}';
begin
  for t in select c.table_name from information_schema.columns c
           join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name
           where c.table_schema = 'public' and c.column_name = 'tenant_id' and x.table_type = 'BASE TABLE'
  loop
    begin
      execute format('select count(*) from public.%I where tenant_id = $1', t) into n using p_tenant;
      if n > 0 then out := out || t; end if;
    exception when insufficient_privilege then null;
    end;
  end loop;
  return out;
end $$;
grant execute on all functions in schema tests to authenticated, anon;

-- Tenant A with data in every module.
select tests.act_as('00000000-0000-0000-0000-00000000a111');
insert into tests.ids values ('a', public.create_tenant('Karachi Grill', 'karachi-grill', 'Clifton'));
insert into tests.ids select 'b', id from public.branches where tenant_id = tests.id('a');
update public.branches set reservations_enabled = true, online_enabled = true where id = tests.id('b');
insert into public.tables (tenant_id, branch_id, label) values (tests.id('a'), tests.id('b'), 'T1');
insert into tests.ids select 'tok', qr_token from public.tables where tenant_id = tests.id('a');
insert into public.floor_areas (tenant_id, branch_id, name) values (tests.id('a'), tests.id('b'), 'Hall');
insert into public.kitchen_stations (tenant_id, name) values (tests.id('a'), 'Grill');
with c as (insert into public.categories (tenant_id, name) values (tests.id('a'), 'BBQ') returning id) insert into tests.ids select 'cat', id from c;
insert into tests.ids values ('grp', public.save_modifier_group(jsonb_build_object('tenant_id', tests.id('a'), 'name', 'Sauce', 'min_select', 0, 'max_select', 1), '[{"name":"Raita","price_minor":0}]'));
insert into tests.ids values ('tikka', public.save_product(jsonb_build_object('tenant_id', tests.id('a'), 'category_id', tests.id('cat'), 'name', 'Tikka', 'price_minor', 100000),
  '[{"name":"Quarter","price_minor":100000,"is_default":true}]', array[tests.id('grp')]));
insert into tests.ids select 'quarter', id from public.product_variants where name = 'Quarter';
insert into tests.ids values ('item', public.save_inventory_item(jsonb_build_object('tenant_id', tests.id('a'), 'name', 'Chicken', 'unit', 'kg')));
select public.save_recipe(tests.id('a'), jsonb_build_object('product_id', tests.id('tikka')), jsonb_build_array(jsonb_build_object('item_id', tests.id('item'), 'quantity', 0.25)));
select public.receive_purchase(public.save_purchase(jsonb_build_object('tenant_id', tests.id('a'), 'branch_id', tests.id('b'),
  'supplier_id', public.save_supplier(jsonb_build_object('tenant_id', tests.id('a'), 'name', 'Mandi')),
  'items', jsonb_build_array(jsonb_build_object('item_id', tests.id('item'), 'quantity', 10, 'total_minor', 800000)))));
select public.save_expense(jsonb_build_object('tenant_id', tests.id('a'), 'branch_id', tests.id('b'), 'category', 'gas', 'amount_minor', 100000));
select public.save_integration(tests.id('a'), 'whatsapp', true, 'live', '{"phone_number_id":"1"}', '{"access_token":"secret-token"}');
select public.save_delivery_zones(tests.id('b'), '[{"name":"DHA","fee_minor":10000}]');
select public.set_my_pin(tests.id('a'), '482913');
select public.invite_member(tests.id('a'), 'new@karachigrill.pk', (select id from public.roles where tenant_id = tests.id('a') and template_key = 'waiter'), true);
select public.create_support_ticket(tests.id('a'), 'Help', 'general', 'Printer is not printing');
select public.save_reservation(jsonb_build_object('branch_id', tests.id('b'), 'date', current_date + 1, 'time', '20:00', 'name', 'Hamza', 'phone', '03001234567', 'party_size', 2));
select tests.act_as_anon();
select public.place_guest_order(tests.v('tok'), jsonb_build_array(jsonb_build_object('product_id', tests.id('tikka'),
  'variant_id', tests.id('quarter'), 'quantity', 1)));
select public.create_guest_request(tests.v('tok'), 'water');
select tests.act_as('00000000-0000-0000-0000-00000000a111');
select public.open_shift(tests.id('b'), 0);
insert into tests.ids select 'bill', public.open_table_bill((select id from public.table_sessions where tenant_id = tests.id('a')));
insert into tests.ids select 'rt', receipt_token from public.bills where id = tests.id('bill');
select public.take_payment(tests.id('bill'), 'cash', 100000);
select tests.act_as_anon();
select public.submit_review(tests.v('rt'), 5, 'Great');

-- Tenant B, a signed-in owner of another restaurant.
select tests.act_as('00000000-0000-0000-0000-00000000b222');
select public.create_tenant('Lahore Bites', 'lahore-bites', 'Gulberg');

reset role;
select diag('tenant tables with data: ' || cardinality(tests.visible(tests.id('a'))) || ' of '
  || (select count(*) from information_schema.columns c join information_schema.tables x using (table_schema, table_name)
      where c.table_schema = 'public' and c.column_name = 'tenant_id' and x.table_type = 'BASE TABLE'));
select cmp_ok(cardinality(tests.visible(tests.id('a'))), '>=', 35, 'tenant A has data in at least 35 tables (the sweep covers them)');

select tests.act_as('00000000-0000-0000-0000-00000000b222');
select is(tests.visible(tests.id('a')), '{}'::text[], 'another restaurant''s owner sees none of it, in any table');

select tests.act_as_anon();
select is(tests.visible(tests.id('a')), '{}'::text[], 'neither does an anonymous visitor');

select * from finish();
rollback;
