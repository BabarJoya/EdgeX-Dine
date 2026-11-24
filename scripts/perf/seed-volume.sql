-- =============================================================================
-- Performance seed: one restaurant ("Perf Grill"), 3 branches, 40 dishes and
-- a year of history (~300 orders per branch per day ≈ 330k orders, ~800k
-- items, bills, payments and kitchen tickets). LOCAL DATABASES ONLY.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/perf/seed-volume.sql
-- =============================================================================
\set owner '''00000000-0000-0000-0000-0000000fe2f0'''

begin;
select private.purge_tenant(id) from public.tenants where slug = 'perf-grill';
delete from auth.users where id = :owner;
insert into auth.users (id, email, raw_user_meta_data, aud, role)
values (:owner, 'perf@edgex.test', '{"full_name":"Perf Owner"}', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', json_build_object('sub', :owner, 'role', 'authenticated')::text, true);
set local role authenticated;
select public.create_tenant('Perf Grill', 'perf-grill', 'Clifton');
reset role;
create temp table perf as select id as tenant_id from public.tenants where slug = 'perf-grill';
update public.subscriptions set plan_id = (select id from public.subscription_plans where code = 'enterprise')
where tenant_id = (select tenant_id from perf);
insert into public.branches (tenant_id, name) select tenant_id, b from perf, unnest(array['DHA', 'Gulshan']) b;
insert into public.categories (tenant_id, name, sort_order)
select tenant_id, c, n from perf, unnest(array['BBQ', 'Karahi', 'Rice', 'Bread', 'Drinks']) with ordinality x(c, n);
insert into public.products (tenant_id, category_id, name, price_minor, sort_order)
select p.tenant_id, c.id, c.name || ' item ' || g, (30 + (g * 37) % 200) * 1000, g
from perf p join public.categories c on c.tenant_id = p.tenant_id, generate_series(1, 8) g;
commit;

-- Bulk history (triggers off for speed; rows are written consistently).
begin;
set local session_replication_role = replica;
set local synchronous_commit = off;

create temp table days as
select b.id as branch_id, b.tenant_id, d::date as business_date,
       240 + (abs(hashtext(b.id::text || d::text)) % 120) as n
from public.branches b, generate_series(current_date - 364, current_date, interval '1 day') d
where b.tenant_id = (select tenant_id from perf);

create temp table o as
select gen_random_uuid() as id, gen_random_uuid() as bill_id, d.tenant_id, d.branch_id, d.business_date, g as num,
       ((d.business_date + time '12:00' + (random() * interval '11 hours')) at time zone 'Asia/Karachi') as created_at,
       (array['takeaway', 'dine_in', 'dine_in', 'delivery'])[1 + floor(random() * 4)::int]::public.order_type as type,
       (array['pos', 'qr', 'waiter', 'online'])[1 + floor(random() * 4)::int]::public.order_source as source,
       case when random() < 0.02 then 'cancelled' else 'completed' end::public.order_status as status
from days d, generate_series(1, d.n) g;

create temp table prods as
select row_number() over (order by id) as k, id, name, price_minor from public.products where tenant_id = (select tenant_id from perf);

create temp table i as
select gen_random_uuid() as id, o.id as order_id, o.tenant_id, p.id as product_id, p.name, p.price_minor,
       1 + floor(random() * 3)::int as qty, o.created_at, o.status
from o, generate_series(1, 1 + abs(hashtext(o.id::text)) % 4) n
join prods p on p.k = 1 + floor(random() * 40)::int;

insert into public.orders (id, tenant_id, branch_id, order_number, business_date, type, source, status, currency,
                           subtotal_minor, total_minor, bill_id, created_at, updated_at)
select o.id, o.tenant_id, o.branch_id, o.num, o.business_date, o.type, o.source, o.status, 'PKR',
       t.total, t.total, case when o.status <> 'cancelled' then o.bill_id end, o.created_at, o.created_at + interval '40 minutes'
from o join (select order_id, sum(price_minor * qty) as total from i group by order_id) t on t.order_id = o.id;

insert into public.order_items (id, tenant_id, order_id, product_id, name, quantity, unit_price_minor, line_total_minor, status, created_at)
select id, tenant_id, order_id, product_id, name, qty, price_minor, price_minor * qty, status, created_at from i;

insert into public.kitchen_tickets (tenant_id, branch_id, order_id, status, created_at, accepted_at, ready_at, updated_at)
select o.tenant_id, o.branch_id, o.id, case when o.status = 'cancelled' then 'cancelled' else 'served' end::public.ticket_status,
       o.created_at, o.created_at + interval '1 minute', o.created_at + (8 + random() * 20) * interval '1 minute', o.created_at
from o;

insert into public.cash_shifts (tenant_id, branch_id, user_id, status, opened_at)
select tenant_id, b.id, :owner, 'closed', current_date - 365 from public.branches b where b.tenant_id = (select tenant_id from perf);

insert into public.bills (id, tenant_id, branch_id, bill_number, business_date, type, status, currency, subtotal_minor,
                          base_minor, paid_base_minor, tax_minor, paid_total_minor, paid_at, created_at, updated_at,
                          customer_phone, customer_name)
select o.bill_id, o.tenant_id, o.branch_id, o.num, o.business_date, o.type, 'paid', 'PKR', x.total_minor,
       x.total_minor, x.total_minor, round(x.total_minor * 0.16), x.total_minor + round(x.total_minor * 0.16),
       o.created_at + interval '45 minutes', o.created_at, o.created_at,
       case when random() < 0.3 then '0300' || lpad((floor(random() * 50000))::text, 7, '0') end,
       case when random() < 0.3 then 'Guest' end
from o join public.orders x on x.id = o.id
where o.status <> 'cancelled';

insert into public.payments (tenant_id, branch_id, bill_id, shift_id, method, base_minor, tax_bps, tax_minor, amount_minor,
                             received_by, created_at)
select b.tenant_id, b.branch_id, b.id, s.id, case when random() < 0.7 then 'cash' else 'card' end::public.payment_method,
       b.base_minor, 1600, b.tax_minor, b.paid_total_minor, :owner, b.paid_at
from public.bills b join public.cash_shifts s on s.branch_id = b.branch_id
where b.tenant_id = (select tenant_id from perf);

-- Keep the per-day numbering counters in step with the history.
insert into public.order_counters (branch_id, business_date, last_number)
select branch_id, business_date, max(num) from o group by 1, 2
on conflict (branch_id, business_date) do update set last_number = excluded.last_number;
insert into public.bill_counters (branch_id, business_date, last_number)
select branch_id, business_date, max(num) from o group by 1, 2
on conflict (branch_id, business_date) do update set last_number = excluded.last_number;
commit;

analyze;
select (select count(*) from public.orders o join perf p using (tenant_id)) as orders,
       (select count(*) from public.order_items i join perf p using (tenant_id)) as items,
       (select count(*) from public.bills b join perf p using (tenant_id)) as bills,
       (select count(*) from public.payments x join perf p using (tenant_id)) as payments;
