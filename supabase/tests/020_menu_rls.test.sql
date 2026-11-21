-- =============================================================================
-- Menu tests (pgTAP): CRUD through RLS, tenant isolation, role limits,
-- branch-scoped overrides, image storage folders.
--
-- Ali owns Karachi Grill (branches Clifton + DHA). Sara owns Lahore Bites.
-- Wasim is a Waiter at Karachi Grill (menu.view only).
-- Kamran is a Branch Manager at Karachi Grill limited to Clifton.
-- =============================================================================
begin;
select plan(35);

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-00000000a111', 'ali@karachigrill.pk',  '{"full_name":"Ali"}',    'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000b222', 'sara@lahorebites.pk',  '{"full_name":"Sara"}',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c333', 'wasim@example.com',    '{"full_name":"Wasim"}',  'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e555', 'kamran@example.com',   '{"full_name":"Kamran"}', 'authenticated', 'authenticated');

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
grant execute on function tests.id(text) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Setup: tenants, branches, staff
-- ---------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000b222');
insert into tests.ids values ('t_sara', public.create_tenant('Lahore Bites', 'lahore-bites', 'Gulberg'));
with x as (insert into public.categories (tenant_id, name) values (tests.id('t_sara'), 'Karahi') returning id)
insert into tests.ids select 'cat_sara', id from x;

select tests.act_as('00000000-0000-0000-0000-00000000a111');
insert into tests.ids values ('t_ali', public.create_tenant('Karachi Grill', 'karachi-grill', 'Clifton'));
insert into public.branches (tenant_id, name) values (tests.id('t_ali'), 'DHA');
insert into tests.ids select 'b_clifton', id from public.branches where name = 'Clifton';
insert into tests.ids select 'b_dha', id from public.branches where name = 'DHA';
insert into tests.ids values ('inv_wasim', public.invite_member(tests.id('t_ali'), 'wasim@example.com',
  (select id from public.roles where template_key = 'waiter'), true));
insert into tests.ids values ('inv_kamran', public.invite_member(tests.id('t_ali'), 'kamran@example.com',
  (select id from public.roles where template_key = 'branch_manager'), false, array[tests.id('b_clifton')]));

select tests.act_as('00000000-0000-0000-0000-00000000c333');
select public.accept_invite((select v from tests.ids where k = 'inv_wasim'));
select tests.act_as('00000000-0000-0000-0000-00000000e555');
select public.accept_invite((select v from tests.ids where k = 'inv_kamran'));

-- ---------------------------------------------------------------------------
-- Owner builds a menu
-- ---------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000a111');

with x as (insert into public.kitchen_stations (tenant_id, name) values (tests.id('t_ali'), 'BBQ') returning id)
insert into tests.ids select 'st_bbq', id from x;
with x as (insert into public.categories (tenant_id, name, translations)
  values (tests.id('t_ali'), 'BBQ', '{"ur": {"name": "باربی کیو"}}') returning id)
insert into tests.ids select 'cat_bbq', id from x;
with x as (insert into public.categories (tenant_id, parent_id, name) values (tests.id('t_ali'), tests.id('cat_bbq'), 'Tikka') returning id)
insert into tests.ids select 'cat_tikka', id from x;
select is((select count(*)::int from public.categories), 2, 'owner creates a category and a subcategory');

select throws_ok(
  format($$ insert into public.categories (tenant_id, parent_id, name) values (%L, %L, 'Too deep') $$,
         tests.id('t_ali'), tests.id('cat_tikka')),
  '22023', null, 'subcategories cannot be nested further');

select throws_ok(
  $$ insert into public.categories (tenant_id, name, translations) values (tests.id('t_ali'), 'Bad', '{"urdu": {"name": "x"}}') $$,
  '23514', null, 'translations must use two-letter language codes');

insert into tests.ids select 'grp_sauce', public.save_modifier_group(
  jsonb_build_object('tenant_id', tests.id('t_ali'), 'name', 'Sauce', 'min_select', 1, 'max_select', 2),
  '[{"name": "Raita", "price_minor": 0}, {"name": "Chutney", "price_minor": 5000}, {"name": "Garlic mayo", "price_minor": 7000}]');
select is((select count(*)::int from public.modifiers where group_id = tests.id('grp_sauce')), 3,
  'add-on group saved with its options');

insert into tests.ids select 'p_tikka', public.save_product(
  jsonb_build_object('tenant_id', tests.id('t_ali'), 'category_id', tests.id('cat_tikka'),
    'name', 'Chicken Tikka', 'price_minor', 0, 'kitchen_station_id', tests.id('st_bbq'),
    'tags', '["spicy", "popular"]'::jsonb, 'translations', '{"ur": {"name": "چکن تکہ"}}'::jsonb),
  '[{"name": "Quarter", "price_minor": 45000, "is_default": true}, {"name": "Half", "price_minor": 85000}]',
  array[tests.id('grp_sauce')]);
select is((select count(*)::int from public.product_variants where product_id = tests.id('p_tikka')), 2,
  'product saved with two variants');
select is((select count(*)::int from public.product_modifier_groups where product_id = tests.id('p_tikka')), 1,
  'product linked to the add-on group');
select is((select translations -> 'ur' ->> 'name' from public.products where id = tests.id('p_tikka')), 'چکن تکہ',
  'Urdu name stored');

-- Update: drop "Half", add "Full", rename default.
select public.save_product(
  jsonb_build_object('id', tests.id('p_tikka'), 'tenant_id', tests.id('t_ali'), 'category_id', tests.id('cat_tikka'),
    'name', 'Chicken Tikka', 'price_minor', 0),
  jsonb_build_array(
    jsonb_build_object('id', (select id from public.product_variants where name = 'Quarter'), 'name', 'Quarter (4 pc)', 'price_minor', 48000),
    jsonb_build_object('name', 'Full', 'price_minor', 160000, 'is_default', true)),
  '{}');
select is((select string_agg(name, ',' order by sort_order) from public.product_variants where product_id = tests.id('p_tikka')),
  'Quarter (4 pc),Full', 'variants updated, removed and added in one save');
select is((select name from public.product_variants where product_id = tests.id('p_tikka') and is_default), 'Full',
  'default variant moved');
select is((select count(*)::int from public.product_modifier_groups where product_id = tests.id('p_tikka')), 0,
  'add-on groups replaced');

select throws_ok(
  format($$ select public.save_product(jsonb_build_object('tenant_id', %L, 'category_id', %L, 'name', 'X'),
            '[{"name":"A","price_minor":1,"is_default":true},{"name":"B","price_minor":2,"is_default":true}]') $$,
         tests.id('t_ali'), tests.id('cat_bbq')),
  '22023', null, 'only one default variant');
select throws_ok(
  format($$ select public.save_product(jsonb_build_object('tenant_id', %L, 'category_id', %L, 'name', 'X', 'price_minor', -5)) $$,
         tests.id('t_ali'), tests.id('cat_bbq')),
  '23514', null, 'negative prices are rejected');
select throws_ok(
  format($$ select public.save_modifier_group(jsonb_build_object('tenant_id', %L, 'name', 'G', 'min_select', 3, 'max_select', 3),
            '[{"name":"A"},{"name":"B"}]') $$, tests.id('t_ali')),
  '22023', null, 'add-on group cannot require more choices than it has');

select ok((select count(*) from public.audit_logs where entity = 'products') >= 2, 'product changes are audited');

-- Storage: own folder ok, foreign / malformed folders rejected.
insert into storage.objects (bucket_id, name) values ('menu-images', tests.id('t_ali') || '/products/tikka.webp');
select is((select count(*)::int from storage.objects where bucket_id = 'menu-images'), 1, 'owner uploads into own folder');
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('menu-images', %L) $$, tests.id('t_sara') || '/evil.webp'),
  '42501', null, 'cannot upload into another restaurant''s folder');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('menu-images', 'not-a-tenant/x.webp') $$,
  '42501', null, 'malformed folder names are rejected');

-- ---------------------------------------------------------------------------
-- Cross-tenant isolation (Sara)
-- ---------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000b222');
select is((select count(*)::int from public.products), 0, 'other restaurant cannot see products');
select is((select count(*)::int from public.categories), 1, 'other restaurant sees only its own categories');
select is((select count(*)::int from public.modifier_groups), 0, 'other restaurant cannot see add-on groups');
select throws_ok(
  format($$ select public.save_product(jsonb_build_object('tenant_id', %L, 'category_id', %L, 'name', 'Hijack')) $$,
         tests.id('t_ali'), tests.id('cat_tikka')),
  '42501', null, 'cannot create products in another restaurant');
select throws_ok(
  format($$ select public.save_product(jsonb_build_object('tenant_id', %L, 'category_id', %L, 'name', 'Smuggle')) $$,
         tests.id('t_sara'), tests.id('cat_tikka')),
  '23503', null, 'cannot attach own product to another restaurant''s category');
select throws_ok(
  format($$ select public.save_product(jsonb_build_object('id', %L, 'tenant_id', %L, 'category_id', %L, 'name', 'Renamed')) $$,
         tests.id('p_tikka'), tests.id('t_sara'), tests.id('cat_sara')),
  'P0002', null, 'cannot edit another restaurant''s product');
update public.products set price_minor = 1 where id = tests.id('p_tikka');
delete from public.products where id = tests.id('p_tikka');

-- ---------------------------------------------------------------------------
-- Waiter: read-only
-- ---------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000c333');
select is((select count(*)::int from public.products), 1, 'waiter can read the menu');
select is((select name from public.products), 'Chicken Tikka', 'cross-tenant update/delete had no effect');
update public.products set is_available = false;
select ok((select is_available from public.products), 'waiter cannot mark items sold out');
select throws_ok(
  format($$ select public.save_product(jsonb_build_object('tenant_id', %L, 'category_id', %L, 'name', 'Free food')) $$,
         tests.id('t_ali'), tests.id('cat_bbq')),
  '42501', null, 'waiter cannot add products');
select throws_ok(format($$ update public.products set tenant_id = %L $$, tests.id('t_sara')),
  '42501', null, 'nobody can move a product to another tenant');

-- ---------------------------------------------------------------------------
-- Branch manager limited to Clifton: overrides only there
-- ---------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000e555');
insert into public.product_branch_overrides (product_id, branch_id, tenant_id, price_minor)
values (tests.id('p_tikka'), tests.id('b_clifton'), tests.id('t_ali'), 50000);
select is((select price_minor from public.product_branch_overrides where branch_id = tests.id('b_clifton')), 50000::bigint,
  'branch manager sets a price for their branch');
select throws_ok(
  format($$ insert into public.product_branch_overrides (product_id, branch_id, tenant_id, is_available) values (%L, %L, %L, false) $$,
         tests.id('p_tikka'), tests.id('b_dha'), tests.id('t_ali')),
  '42501', null, 'branch manager cannot override a branch they do not manage');
update public.products set is_available = false where id = tests.id('p_tikka');
select ok(not (select is_available from public.products where id = tests.id('p_tikka')),
  'branch manager (menu.manage) can mark an item sold out');

-- ---------------------------------------------------------------------------
-- Reorder & delete rules
-- ---------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000a111');
with x as (insert into public.categories (tenant_id, name) values (tests.id('t_ali'), 'Drinks') returning id)
insert into tests.ids select 'cat_drinks', id from x;
select public.reorder_menu('categories', array[tests.id('cat_drinks'), tests.id('cat_bbq')]);
select is((select name from public.categories where parent_id is null order by sort_order limit 1), 'Drinks',
  'categories can be reordered');
select throws_ok(format($$ delete from public.categories where id = %L $$, tests.id('cat_tikka')),
  '23503', null, 'a category with items cannot be deleted');
delete from public.kitchen_stations where id = tests.id('st_bbq');
select is((select kitchen_station_id from public.products where id = tests.id('p_tikka')), null,
  'deleting a station un-routes its items instead of deleting them');

select tests.act_as_anon();
select throws_ok($$ select count(*) from public.products $$, '42501', null, 'anonymous users cannot read menu tables directly');

select * from finish();
rollback;
