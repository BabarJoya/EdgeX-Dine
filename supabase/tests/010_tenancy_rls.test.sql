-- =============================================================================
-- Tenant isolation & permission tests (pgTAP).
--
-- Cast: Ali owns "Karachi Grill", Sara owns "Lahore Bites". Wasim is invited
-- to Karachi Grill as a Waiter for one branch. Mallory has no restaurant.
-- Every test runs as the real `authenticated` role with a JWT, exactly as
-- the browser would, so Row Level Security is what is being tested.
-- =============================================================================
begin;
select plan(55);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-00000000a111', 'ali@karachigrill.pk',  '{"full_name":"Ali Khan"}',  'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000b222', 'sara@lahorebites.pk',  '{"full_name":"Sara Malik"}','authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c333', 'wasim@example.com',    '{"full_name":"Wasim"}',     'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000d444', 'mallory@example.com',  '{"full_name":"Mallory"}',   'authenticated', 'authenticated');

create schema tests;
create function tests.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function tests.act_as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;

grant usage on schema tests to authenticated, anon;
create table tests.ids (k text primary key, v text);
grant all on tests.ids to authenticated, anon;

select is((select full_name from public.profiles where id = '00000000-0000-0000-0000-00000000a111'),
  'Ali Khan', 'profile is created automatically on sign-up');

-- ---------------------------------------------------------------------------
-- Onboarding
-- ---------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000a111');
insert into tests.ids values ('t_ali', public.create_tenant('Karachi Grill', 'karachi-grill', 'Clifton', 'Karachi'));

select tests.act_as('00000000-0000-0000-0000-00000000b222');
insert into tests.ids values ('t_sara', public.create_tenant('Lahore Bites', 'lahore-bites', 'Gulberg', 'Lahore'));

select tests.act_as('00000000-0000-0000-0000-00000000a111');
select is((select count(*)::int from public.tenants), 1, 'owner sees exactly one tenant: their own');
select is((select name from public.tenants), 'Karachi Grill', 'owner sees their own restaurant');
select is((select count(*)::int from public.branches), 1, 'first branch was created');
select is((select count(*)::int from public.roles), 8, 'standard roles were copied into the tenant');
select is((select status::text from public.subscriptions), 'trialing', 'trial subscription started');
select ok(cardinality(public.my_permissions((select v::uuid from tests.ids where k = 't_ali'))) =
          (select count(*) from public.permissions), 'owner holds every permission');

select throws_ok(
  $$ select public.create_tenant('Copycat', 'karachi-grill', 'Main') $$,
  'P0001', 'That web address is not available', 'slugs are unique');
select throws_ok(
  $$ select public.create_tenant('Sneaky', 'admin', 'Main') $$,
  'P0001', 'That web address is not available', 'reserved slugs are rejected');

-- ---------------------------------------------------------------------------
-- Cross-tenant isolation (Ali vs Sara's data)
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.tenants where id = (select v::uuid from tests.ids where k='t_sara')),
  0, 'cannot read another tenant');
select is((select count(*)::int from public.branches where tenant_id = (select v::uuid from tests.ids where k='t_sara')),
  0, 'cannot read another tenant''s branches');
select is((select count(*)::int from public.roles where tenant_id = (select v::uuid from tests.ids where k='t_sara')),
  0, 'cannot read another tenant''s roles');
select is((select count(*)::int from public.tenant_members where tenant_id = (select v::uuid from tests.ids where k='t_sara')),
  0, 'cannot read another tenant''s members');
select is((select count(*)::int from public.subscriptions where tenant_id = (select v::uuid from tests.ids where k='t_sara')),
  0, 'cannot read another tenant''s subscription');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-00000000b222'),
  0, 'cannot read profiles of people outside your restaurants');

select throws_ok(
  format($$ insert into public.branches (tenant_id, name) values (%L, 'Hijack') $$,
         (select v from tests.ids where k = 't_sara')),
  '42501', null, 'cannot create a branch in another tenant');

update public.branches set name = 'Hacked' where tenant_id = (select v::uuid from tests.ids where k='t_sara');
update public.tenants set name = 'Hacked' where id = (select v::uuid from tests.ids where k='t_sara');
delete from public.branches where tenant_id = (select v::uuid from tests.ids where k='t_sara');

select throws_ok(
  format($$ select public.invite_member(%L, 'x@y.com', (select id from public.roles limit 1)) $$,
         (select v from tests.ids where k = 't_sara')),
  '42501', null, 'cannot invite staff into another tenant');
select is(public.my_permissions((select v::uuid from tests.ids where k='t_sara')), '{}'::text[],
  'has no permissions in another tenant');

-- Verify as Sara that nothing of hers changed.
select tests.act_as('00000000-0000-0000-0000-00000000b222');
select is((select name from public.tenants), 'Lahore Bites', 'other tenant name unchanged by cross-tenant update');
select is((select name from public.branches), 'Gulberg', 'other tenant branch unchanged / not deleted');

-- ---------------------------------------------------------------------------
-- Column-level protection
-- ---------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000a111');
select throws_ok($$ update public.profiles set is_platform_admin = true where id = auth.uid() $$,
  '42501', null, 'cannot make yourself platform admin');
select throws_ok($$ update public.tenants set status = 'active' $$,
  '42501', null, 'cannot change tenant status');
select throws_ok(format($$ update public.branches set tenant_id = %L $$, (select v from tests.ids where k='t_sara')),
  '42501', null, 'cannot move a branch to another tenant');
select throws_ok($$ update public.subscriptions set status = 'active' $$,
  '42501', null, 'cannot change own subscription');
select throws_ok($$ insert into public.tenant_members (tenant_id, user_id, role_id)
                    select tenant_id, '00000000-0000-0000-0000-00000000d444', id from public.roles limit 1 $$,
  '42501', null, 'cannot insert memberships directly');
select throws_ok($$ insert into public.roles (tenant_id, name, is_owner)
                    select id, 'Fake owner', true from public.tenants limit 1 $$,
  '42501', null, 'cannot create an owner role');

update public.profiles set full_name = 'Ali K.' where id = auth.uid();
select is((select full_name from public.profiles where id = auth.uid()), 'Ali K.', 'can edit own profile name');

-- ---------------------------------------------------------------------------
-- Branch management & plan limits (trial plan = Professional: 2 branches)
-- ---------------------------------------------------------------------------
insert into public.branches (tenant_id, name, city)
values ((select v::uuid from tests.ids where k='t_ali'), 'DHA', 'Karachi');
select is((select count(*)::int from public.branches), 2, 'owner can add a branch');
select throws_ok(
  format($$ insert into public.branches (tenant_id, name) values (%L, 'Third') $$, (select v from tests.ids where k='t_ali')),
  'P0001', null, 'plan branch limit is enforced in the database');

insert into tests.ids select 'b_clifton', id::text from public.branches where name = 'Clifton';
insert into tests.ids select 'b_dha', id::text from public.branches where name = 'DHA';
insert into tests.ids select 'r_waiter', id::text from public.roles where template_key = 'waiter';
insert into tests.ids select 'r_owner', id::text from public.roles where is_owner;
insert into tests.ids select 'r_branch_mgr', id::text from public.roles where template_key = 'branch_manager';

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------
select throws_ok(
  format($$ select public.invite_member(%L, 'boss@example.com', %L, true) $$,
         (select v from tests.ids where k='t_ali'), (select v from tests.ids where k='r_owner')),
  '42501', null, 'cannot invite someone as Owner');
select throws_ok(
  format($$ select public.invite_member(%L, 'w@example.com', %L, false, '{}') $$,
         (select v from tests.ids where k='t_ali'), (select v from tests.ids where k='r_waiter')),
  '22023', null, 'branch-limited invite needs at least one branch');

insert into tests.ids values ('invite', public.invite_member(
  (select v::uuid from tests.ids where k='t_ali'), 'Wasim@Example.com',
  (select v::uuid from tests.ids where k='r_waiter'), false,
  array[(select v::uuid from tests.ids where k='b_clifton')]));
select is((select count(*)::int from public.tenant_invites), 1, 'owner sees the pending invite');

select tests.act_as_anon();
select is((select tenant_name from public.get_invite((select v from tests.ids where k='invite'))), 'Karachi Grill',
  'anyone with the link can see which restaurant invited them');
select throws_ok($$ select count(*) from public.tenants $$, '42501', null, 'anonymous users have no access to tenants at all');
select is((select count(*)::int from public.subscription_plans), 3, 'anonymous users can read active plans');

select tests.act_as('00000000-0000-0000-0000-00000000d444');
select throws_ok(format($$ select public.accept_invite(%L) $$, (select v from tests.ids where k='invite')),
  '42501', null, 'a forwarded invite cannot be used by a different email');
select is((select count(*)::int from public.tenants), 0, 'outsider still sees no tenants');

select tests.act_as('00000000-0000-0000-0000-00000000c333');
select is(public.accept_invite((select v from tests.ids where k='invite')), (select v::uuid from tests.ids where k='t_ali'),
  'invitee accepts with the matching email');
select throws_ok(format($$ select public.accept_invite(%L) $$, (select v from tests.ids where k='invite')),
  'P0002', null, 'an invite can only be used once');

-- ---------------------------------------------------------------------------
-- Waiter's view: limited permissions and branch scope
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.tenants), 1, 'waiter sees their restaurant');
select is((select array_agg(name)::text from public.branches), '{Clifton}', 'waiter only sees their assigned branch');
select ok('orders.create' = any (public.my_permissions((select v::uuid from tests.ids where k='t_ali'))),
  'waiter can create orders');
select ok(not ('staff.manage' = any (public.my_permissions((select v::uuid from tests.ids where k='t_ali')))),
  'waiter cannot manage staff');
select throws_ok(
  format($$ insert into public.branches (tenant_id, name) values (%L, 'Rogue') $$, (select v from tests.ids where k='t_ali')),
  '42501', null, 'waiter cannot create branches');
update public.tenants set name = 'Wasim''s Place';
select throws_ok(
  format($$ select public.set_role_permissions(%L, array['staff.manage']) $$, (select v from tests.ids where k='r_waiter')),
  'P0002', null, 'waiter cannot grant their own role more permissions');
select is((select count(*)::int from public.tenant_invites), 0, 'waiter cannot see invite tokens');
select is((select count(*)::int from public.audit_logs), 0, 'waiter cannot read the audit log');

-- ---------------------------------------------------------------------------
-- Owner manages the team
-- ---------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000a111');
select is((select name from public.tenants), 'Karachi Grill', 'waiter''s attempt to rename the restaurant had no effect');

select public.set_role_permissions((select v::uuid from tests.ids where k='r_waiter'),
  array['orders.view','orders.create','tables.view','menu.view']);
select is((select count(*)::int from public.role_permissions where role_id = (select v::uuid from tests.ids where k='r_waiter')),
  4, 'owner can change a role''s permissions');
select throws_ok(
  format($$ select public.set_role_permissions(%L, array['orders.view']) $$, (select v from tests.ids where k='r_owner')),
  '42501', null, 'the Owner role cannot be edited');

select public.update_member(
  (select id from public.tenant_members where user_id = '00000000-0000-0000-0000-00000000c333'),
  (select v::uuid from tests.ids where k='r_waiter'), false,
  array[(select v::uuid from tests.ids where k='b_clifton'), (select v::uuid from tests.ids where k='b_dha')]);
select is((select count(*)::int from public.member_branches), 2, 'owner can give a member more branches');

select throws_ok(
  format($$ select public.remove_member(%L) $$,
         (select id from public.tenant_members where user_id = auth.uid())),
  '42501', null, 'owner cannot remove themselves');

select ok((select count(*) from public.audit_logs where entity = 'tenant_members') >= 2,
  'membership changes are written to the audit log');
select ok(not exists (select 1 from public.audit_logs where data::text like '%' || (select v from tests.ids where k='invite') || '%'),
  'invite tokens are never stored in the audit log');

-- ---------------------------------------------------------------------------
-- Suspended tenants lose all permissions
-- ---------------------------------------------------------------------------
reset role;
update public.tenants set status = 'suspended' where slug = 'karachi-grill';
select tests.act_as('00000000-0000-0000-0000-00000000a111');
select is(public.my_permissions((select v::uuid from tests.ids where k='t_ali')), '{}'::text[],
  'a suspended restaurant has no permissions, even for the owner');

select * from finish();
rollback;
