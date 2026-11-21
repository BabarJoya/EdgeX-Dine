-- =============================================================================
-- Platform tests (pgTAP): super admin powers, approval, suspension,
-- subscription expiry (read-only mode), plan features, manual billing,
-- plan editing, support tickets.
--
-- Pat = platform admin (EdgeX staff). Ali owns Karachi Grill. Sara owns
-- Lahore Bites. Wasim is a waiter at Karachi Grill.
-- =============================================================================
begin;
select plan(41);

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000000ad', 'pat@edgex.pk',        '{"full_name":"Pat"}',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000a111', 'ali@karachigrill.pk', '{"full_name":"Ali"}',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000b222', 'sara@lahorebites.pk', '{"full_name":"Sara"}',  'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c333', 'wasim@example.com',   '{"full_name":"Wasim"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e555', 'new@cafe.pk',         '{"full_name":"Nina"}',  'authenticated', 'authenticated');
update public.profiles set is_platform_admin = true where email = 'pat@edgex.pk';

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
grant execute on all functions in schema tests to authenticated, anon;

-- Fixtures --------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000a111');
insert into tests.ids values ('t_ali', public.create_tenant('Karachi Grill', 'karachi-grill', 'Clifton'));
insert into tests.ids select 'branch', id from public.branches;
insert into public.tables (tenant_id, branch_id, label) values (tests.id('t_ali'), tests.id('branch'), 'T1');
insert into tests.ids select 'tok', qr_token from public.tables;
with c as (insert into public.categories (tenant_id, name) values (tests.id('t_ali'), 'Main') returning id)
insert into tests.ids select 'cat', id from c;
insert into tests.ids values ('p', public.save_product(jsonb_build_object('tenant_id', tests.id('t_ali'), 'category_id', tests.id('cat'), 'name', 'Tea', 'price_minor', 10000)));
insert into tests.ids values ('inv', public.invite_member(tests.id('t_ali'), 'wasim@example.com', (select id from public.roles where template_key = 'waiter'), true));
select tests.act_as('00000000-0000-0000-0000-00000000c333');
select public.accept_invite(tests.v('inv'));
select tests.act_as('00000000-0000-0000-0000-00000000b222');
insert into tests.ids values ('t_sara', public.create_tenant('Lahore Bites', 'lahore-bites', 'Gulberg'));

-- Only platform admins ---------------------------------------------------------------
select throws_ok($$ select public.admin_overview() $$, '42501', null, 'restaurant owners cannot open the platform overview');
select throws_ok($$ select public.admin_list_tenants() $$, '42501', null, 'or list other restaurants');
select throws_ok(format($$ select public.admin_set_tenant_status(%L, 'suspended', 'x') $$, tests.id('t_ali')), '42501', null, 'or suspend anyone');
select throws_ok($$ select public.admin_record_payment(tests.id('t_sara'), (select id from public.subscription_plans where code = 'enterprise'), 'monthly', 0, 'free') $$,
  '42501', null, 'or give themselves a free plan');
update public.subscription_plans set price_monthly_minor = 1;
select is((select min(price_monthly_minor) from public.subscription_plans), 499900::bigint, 'or change plan prices');
select throws_ok($$ update public.profiles set is_platform_admin = true where id = auth.uid() $$, '42501', null, 'or make themselves admin');

select tests.act_as('00000000-0000-0000-0000-0000000000ad');
select is((public.admin_overview() -> 'tenants' ->> 'active')::int, 2, 'admin sees platform totals');
select is(jsonb_array_length(public.admin_list_tenants()), 2, 'admin lists all restaurants');
select is(jsonb_array_length(public.admin_list_tenants('lahore')), 1, 'and can search them');
select is((public.admin_list_tenants('karachi') -> 0 ->> 'owner_email'), 'ali@karachigrill.pk', 'with the owner''s email');
select is(jsonb_array_length(public.admin_tenant_detail(tests.id('t_ali')) -> 'members'), 2, 'restaurant detail shows its team');
select is((select count(*)::int from public.orders), 0, 'admin cannot read restaurants'' orders directly (support view only)');

-- Suspension -------------------------------------------------------------------------
select throws_ok(format($$ select public.admin_set_tenant_status(%L, 'suspended', '') $$, tests.id('t_ali')), '22023', null, 'suspending needs a reason');
select public.admin_set_tenant_status(tests.id('t_ali'), 'suspended', 'Unpaid for 2 months');
select tests.act_as('00000000-0000-0000-0000-00000000a111');
select is(public.my_permissions(tests.id('t_ali')), '{}'::text[], 'suspended restaurant: no permissions');
select is(public.my_tenant_access(tests.id('t_ali')) ->> 'access', 'blocked', 'and the app knows why');
select tests.act_as_anon();
select throws_ok(format($$ select public.place_guest_order(%L, '[{"product_id":"%s","quantity":1}]') $$, tests.v('tok'), tests.v('p')),
  'P0002', null, 'guests cannot order at a suspended restaurant');
select tests.act_as('00000000-0000-0000-0000-0000000000ad');
select public.admin_set_tenant_status(tests.id('t_ali'), 'active', 'Paid');
select ok((select count(*) from public.audit_logs where action = 'platform_status') = 2, 'status changes are audited with reasons');

-- Expiry → read-only -------------------------------------------------------------------
select public.admin_set_subscription(tests.id('t_ali'), (select id from public.subscription_plans where code = 'professional'),
  'trialing', 'monthly', now() - interval '4 days');
select tests.act_as('00000000-0000-0000-0000-00000000a111');
select is(public.my_tenant_access(tests.id('t_ali')) ->> 'access', 'read_only', 'trial ended more than 3 days ago: read-only');
select ok('menu.view' = any (public.my_permissions(tests.id('t_ali'))), 'can still view the menu');
select ok('billing.manage' = any (public.my_permissions(tests.id('t_ali'))), 'and manage billing to renew');
select ok(not ('menu.manage' = any (public.my_permissions(tests.id('t_ali')))), 'but cannot edit the menu');
select throws_ok(format($$ select public.save_product(jsonb_build_object('tenant_id', %L, 'category_id', %L, 'name', 'Coffee')) $$, tests.id('t_ali'), tests.id('cat')),
  '42501', null, 'database blocks edits in read-only mode');
select tests.act_as('00000000-0000-0000-0000-00000000c333');
select throws_ok(format($$ select public.place_staff_order(%L, '[{"product_id":"%s","quantity":1}]') $$, (select id from public.tables), tests.v('p')),
  'P0002', null, 'waiters cannot take orders');
select tests.act_as_anon();
select throws_ok(format($$ select public.place_guest_order(%L, '[{"product_id":"%s","quantity":1}]') $$, tests.v('tok'), tests.v('p')),
  'P0001', 'Ordering is unavailable right now. Please ask your waiter.', 'guests cannot order');

select tests.act_as('00000000-0000-0000-0000-0000000000ad');
select public.admin_set_subscription(tests.id('t_ali'), (select id from public.subscription_plans where code = 'professional'),
  'trialing', 'monthly', now() - interval '1 day');
select tests.act_as('00000000-0000-0000-0000-00000000a111');
select is(public.my_tenant_access(tests.id('t_ali')) ->> 'access', 'active', 'within the grace period it keeps working');

-- Manual payment ---------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-0000000000ad');
select public.admin_record_payment(tests.id('t_ali'), (select id from public.subscription_plans where code = 'starter'),
  'monthly', 499900, 'Bank transfer', 'HBL-889');
select is((select status::text from public.subscriptions where tenant_id = tests.id('t_ali')), 'active', 'payment activates the plan');
select ok((select current_period_end between now() + interval '27 days' and now() + interval '32 days' from public.subscriptions where tenant_id = tests.id('t_ali')),
  'for one month');
select public.admin_record_payment(tests.id('t_ali'), (select id from public.subscription_plans where code = 'starter'), 'monthly', 499900, 'Raast');
select ok((select current_period_end > now() + interval '55 days' from public.subscriptions where tenant_id = tests.id('t_ali')),
  'paying again extends from the end of the paid period');
select ok((public.admin_overview() ->> 'mrr_minor')::bigint >= 499900, 'monthly recurring revenue counts it');

-- Plan features: Starter has no kitchen display ---------------------------------------------
select tests.act_as_anon();
select public.place_guest_order(tests.v('tok'), jsonb_build_array(jsonb_build_object('product_id', tests.v('p'), 'quantity', 1)));
select tests.act_as('00000000-0000-0000-0000-00000000a111');
select throws_ok($$ select public.update_ticket_status((select id from public.kitchen_tickets limit 1), 'accepted') $$,
  'P0001', 'The kitchen display is not included in your plan. Upgrade to use it.', 'plan features are enforced');
select tests.act_as('00000000-0000-0000-0000-00000000a111');
select is((select count(*)::int from public.subscription_invoices), 2, 'owner sees their payment history');
select tests.act_as('00000000-0000-0000-0000-00000000c333');
select is((select count(*)::int from public.subscription_invoices), 0, 'staff without billing access do not');

-- Plans --------------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-0000000000ad');
update public.subscription_plans set price_monthly_minor = 549900 where code = 'starter';
select is((select price_monthly_minor from public.subscription_plans where code = 'starter'), 549900::bigint, 'admin edits plan prices');

-- Approval ------------------------------------------------------------------------------
select public.admin_update_settings(true, 3, 'help@edgex.pk');
select tests.act_as('00000000-0000-0000-0000-00000000e555');
insert into tests.ids values ('t_new', public.create_tenant('New Cafe', 'new-cafe', 'Main'));
select is((select status::text from public.tenants where id = tests.id('t_new')), 'pending', 'new restaurants wait for approval when required');
select is(public.my_permissions(tests.id('t_new')), '{}'::text[], 'and cannot operate yet');
select tests.act_as('00000000-0000-0000-0000-0000000000ad');
select public.admin_set_tenant_status(tests.id('t_new'), 'active', 'Verified');
select tests.act_as('00000000-0000-0000-0000-00000000e555');
select ok('menu.manage' = any (public.my_permissions(tests.id('t_new'))), 'approved restaurant can start');

-- Support ------------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000a111');
insert into tests.ids values ('ticket', public.create_support_ticket(tests.id('t_ali'), 'Printer not working', 'bug', 'Receipts print blank.'));
insert into tests.ids values ('upgrade', public.request_plan_change(tests.id('t_ali'), (select id from public.subscription_plans where code = 'professional'), 'yearly'));
select tests.act_as('00000000-0000-0000-0000-00000000b222');
select is((select count(*)::int from public.support_tickets), 0, 'restaurants cannot see each other''s tickets');
select throws_ok($$ select public.reply_support_ticket(tests.id('ticket'), 'snooping') $$, 'P0002', null, 'or reply to them');
select tests.act_as('00000000-0000-0000-0000-0000000000ad');
select public.reply_support_ticket(tests.id('ticket'), 'Please check the paper is thermal side up.');
select is((select state::text from public.support_tickets where id = tests.id('ticket')), 'waiting', 'admin reply marks the ticket waiting for the restaurant');
select ok(exists (select 1 from public.support_messages where ticket_id = tests.id('ticket') and from_platform and body like 'Please check%'), 'reply is marked as from EdgeX');
select is((select category from public.support_tickets where id = tests.id('upgrade')), 'upgrade', 'plan change requests arrive as tickets');

select * from finish();
rollback;
