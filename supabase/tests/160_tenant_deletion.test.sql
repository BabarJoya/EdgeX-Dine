-- =============================================================================
-- Deleting a restaurant (account closure): platform admins only, suspended
-- first, confirmed by slug; every row goes, the audit record stays.
-- =============================================================================
begin;
select plan(7);

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-00000000a111', 'ali@karachigrill.pk', '{"full_name":"Ali"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000d444', 'ops@edgex.pk',        '{"full_name":"Ops"}', 'authenticated', 'authenticated');
update public.profiles set is_platform_admin = true where id = '00000000-0000-0000-0000-00000000d444';

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
-- Rows left for a tenant across every table with tenant_id (as postgres).
create function tests.rows_left(p_tenant uuid) returns int language plpgsql as $$
declare t text; n int; total int := 0;
begin
  for t in select c.table_name from information_schema.columns c
           join information_schema.tables x using (table_schema, table_name)
           where c.table_schema = 'public' and c.column_name = 'tenant_id' and x.table_type = 'BASE TABLE'
             and c.table_name <> 'audit_logs'
  loop
    execute format('select count(*) from public.%I where tenant_id = $1', t) into n using p_tenant;
    total := total + n;
  end loop;
  return total;
end $$;
grant execute on all functions in schema tests to authenticated;

select tests.act_as('00000000-0000-0000-0000-00000000a111');
insert into tests.ids values ('t', public.create_tenant('Karachi Grill', 'karachi-grill', 'Clifton'));
insert into tests.ids select 'b', id from public.branches where tenant_id = tests.id('t');
with c as (insert into public.categories (tenant_id, name) values (tests.id('t'), 'BBQ') returning id) insert into tests.ids select 'cat', id from c;
insert into public.categories (tenant_id, name, parent_id) values (tests.id('t'), 'Tikka', tests.id('cat'));
insert into tests.ids values ('p', public.save_product(jsonb_build_object('tenant_id', tests.id('t'), 'category_id', tests.id('cat'), 'name', 'Tikka', 'price_minor', 100000)));
insert into tests.ids values ('item', public.save_inventory_item(jsonb_build_object('tenant_id', tests.id('t'), 'name', 'Chicken', 'unit', 'kg')));
select public.receive_purchase(public.save_purchase(jsonb_build_object('tenant_id', tests.id('t'), 'branch_id', tests.id('b'),
  'items', jsonb_build_array(jsonb_build_object('item_id', tests.id('item'), 'quantity', 5, 'total_minor', 400000)))));
select public.open_shift(tests.id('b'), 0);
select public.take_payment((public.create_counter_order(tests.id('b'), 'takeaway',
  jsonb_build_array(jsonb_build_object('product_id', tests.id('p'), 'quantity', 1))) ->> 'bill_id')::uuid, 'cash', 100000);

select throws_ok($$ select public.admin_delete_tenant(tests.id('t'), 'karachi-grill') $$, '42501', null, 'owners cannot use it');

select tests.act_as('00000000-0000-0000-0000-00000000d444');
select throws_ok($$ select public.admin_delete_tenant(tests.id('t'), 'karachi-grill') $$, 'P0001', 'Suspend the restaurant before deleting it',
  'an active restaurant cannot be deleted');
select public.admin_set_tenant_status(tests.id('t'), 'suspended', 'Closing the account');
select throws_ok($$ select public.admin_delete_tenant(tests.id('t'), 'karachi') $$, '22023', null, 'the slug must be typed exactly');

reset role;
select cmp_ok(tests.rows_left(tests.id('t')), '>', 20, 'the restaurant has data (payments, shifts, purchases, sub-categories…)');
select tests.act_as('00000000-0000-0000-0000-00000000d444');
select lives_ok($$ select public.admin_delete_tenant(tests.id('t'), 'karachi-grill') $$, 'a platform admin deletes a suspended restaurant');
reset role;
select is(tests.rows_left(tests.id('t')), 0, 'no rows are left in any table');
select ok(exists (select 1 from public.audit_logs where action = 'platform_delete' and entity_id = tests.id('t')::text),
  'the deletion is kept in the audit log');

select * from finish();
rollback;
