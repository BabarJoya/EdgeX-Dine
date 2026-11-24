-- Times the heavy read paths as the Perf Grill owner (RLS and permission
-- checks included). Run after seed-volume.sql:
--   psql "$DB_URL" -q -f scripts/perf/bench.sql
\set owner '''00000000-0000-0000-0000-0000000fe2f0'''
\timing on
begin;
select set_config('request.jwt.claims', json_build_object('sub', :owner, 'role', 'authenticated')::text, true);
set local role authenticated;
select id as t from public.tenants where slug = 'perf-grill' \gset
select id as b from public.branches where tenant_id = :'t' and name = 'Clifton' \gset

\echo '--- sales_report, one branch, 30 days'
select length(public.sales_report(:'t', :'b', current_date - 29, current_date)::text) as bytes;
\echo '--- sales_report, all branches, 30 days'
select length(public.sales_report(:'t', null, current_date - 29, current_date)::text) as bytes;
\echo '--- sales_report, all branches, 365 days'
select length(public.sales_report(:'t', null, current_date - 364, current_date)::text) as bytes;
\echo '--- dashboard_today'
select public.dashboard_today(:'t', null) is not null as ok;
\echo '--- profit_loss, all branches, 30 days'
select public.profit_loss(:'t', null, current_date - 29, current_date) is not null as ok;
\echo '--- customers_list (all)'
select jsonb_array_length(public.customers_list(:'t')) as customers;
\echo '--- customers_list (search)'
select jsonb_array_length(public.customers_list(:'t', null, '0300001')) as customers;
\echo '--- customer_insights, 30 days'
select public.customer_insights(:'t', null, current_date - 29, current_date) is not null as ok;
\echo '--- orders list (open orders, RLS) '
select count(*) from public.orders where branch_id = :'b' and status in ('new','accepted','preparing','ready','served');
\echo '--- orders today (RLS)'
select count(*) from public.orders where branch_id = :'b' and created_at > now() - interval '1 day';
\echo '--- kitchen tickets (active, RLS)'
select count(*) from public.kitchen_tickets where branch_id = :'b' and status in ('new','accepted','preparing');
\echo '--- bills today with payments (POS list, RLS)'
select count(*) from public.bills b left join public.payments p on p.bill_id = b.id
where b.branch_id = :'b' and b.business_date = current_date;
\echo '--- guest menu'
select length(public.get_guest_menu('perf-grill', null, :'b')::text) as bytes;
rollback;
