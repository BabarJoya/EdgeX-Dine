-- =============================================================================
-- Phase 11: performance at scale (measured with scripts/perf on ~330k orders,
-- ~825k items; see docs/PERFORMANCE.md).
--
-- 1. RLS: policies called private.has_branch_perm(tenant_id, branch_id, …) /
--    private.has_perm(tenant_id, …) once per ROW. They now compare the row's
--    branch / tenant with the caller's allowed set, computed ONCE per query
--    (an InitPlan), which also lets Postgres use the branch indexes.
--    Same rules: the sets are built from the same permission functions.
-- 2. sales_report: per-day / per-hour / per-branch / per-person figures are
--    aggregated once and joined instead of rescanned for every row.
-- 3. Customers: the normalised phone is stored on bills (generated column)
--    and indexed, instead of being computed for every bill on every query.
-- 4. Partial index for open orders per branch.
-- =============================================================================

create or replace function private.branch_ids_with(p_perm text)
returns uuid[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(b.id), '{}')
  from public.tenant_members m
  join public.branches b on b.tenant_id = m.tenant_id
  where m.user_id = (select auth.uid()) and m.status = 'active'
    and private.has_branch_perm(b.tenant_id, b.id, p_perm);
$$;

create or replace function private.tenant_ids_with(p_perm text)
returns uuid[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.tenant_id), '{}')
  from public.tenant_members m
  where m.user_id = (select auth.uid()) and m.status = 'active'
    and private.has_perm(m.tenant_id, p_perm);
$$;

do $do$
declare
  p record;
  q text;
  c text;
  sql text;
begin
  for p in
    select tablename, policyname, qual, with_check from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~ 'private\.has_(branch_)?perm\(tenant_id, '
           or coalesce(with_check, '') ~ 'private\.has_(branch_)?perm\(tenant_id, ')
  loop
    q := regexp_replace(p.qual,
           'private\.has_branch_perm\(tenant_id, branch_id, (''[a-z_.]+''::text)\)',
           '(branch_id = ANY ((SELECT private.branch_ids_with(\1))::uuid[]))', 'g');
    q := regexp_replace(q,
           'private\.has_perm\(tenant_id, (''[a-z_.]+''::text)\)',
           '(tenant_id = ANY ((SELECT private.tenant_ids_with(\1))::uuid[]))', 'g');
    c := regexp_replace(p.with_check,
           'private\.has_branch_perm\(tenant_id, branch_id, (''[a-z_.]+''::text)\)',
           '(branch_id = ANY ((SELECT private.branch_ids_with(\1))::uuid[]))', 'g');
    c := regexp_replace(c,
           'private\.has_perm\(tenant_id, (''[a-z_.]+''::text)\)',
           '(tenant_id = ANY ((SELECT private.tenant_ids_with(\1))::uuid[]))', 'g');
    sql := format('alter policy %I on public.%I', p.policyname, p.tablename);
    if q is not null then sql := sql || format(' using (%s)', q); end if;
    if c is not null then sql := sql || format(' with check (%s)', c); end if;
    execute sql;
  end loop;
end
$do$;

create or replace function public.sales_report(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_branches uuid[] := private.report_branches(p_tenant_id, p_branch_id);
  v_days int := p_to - p_from + 1;
  v_prev_from date := p_from - (p_to - p_from + 1);
  v_prev_to date := p_from - 1;
  v_tz text := (select timezone from public.tenants where id = p_tenant_id);
begin
  if cardinality(v_branches) = 0 then
    raise exception 'You do not have access to reports here' using errcode = '42501';
  end if;
  if not private.has_feature(p_tenant_id, 'reports') then
    raise exception 'Reports are not included in your plan. Upgrade to use them.' using errcode = 'P0001', hint = 'feature:reports';
  end if;
  if p_from > p_to or v_days > 366 then
    raise exception 'Choose a date range of up to one year' using errcode = '22023';
  end if;

  return (
    with
    pay as (
      select p.*, b.business_date, b.branch_id as bill_branch
      from public.payments p join public.bills b on b.id = p.bill_id
      where b.tenant_id = p_tenant_id and b.branch_id = any (v_branches)
        and b.business_date between v_prev_from and p_to
    ),
    cur_pay as (select * from pay where business_date between p_from and p_to and status = 'completed'),
    prev_pay as (select * from pay where business_date between v_prev_from and v_prev_to and status = 'completed'),
    ord as (
      select o.* from public.orders o
      where o.tenant_id = p_tenant_id and o.branch_id = any (v_branches)
        and o.business_date between v_prev_from and p_to
    ),
    cur_ord as (select * from ord where business_date between p_from and p_to),
    prev_ord as (select * from ord where business_date between v_prev_from and v_prev_to),
    -- Aggregate once, then join (no per-day / per-hour rescans).
    pay_by_day as (select business_date, sum(base_minor) as net from cur_pay group by business_date),
    ord_by_day as (select business_date, count(*) as n from cur_ord where status <> 'cancelled' group by business_date),
    ord_by_hour as (
      select extract(hour from created_at at time zone v_tz)::int as h, count(*) as n
      from cur_ord where status <> 'cancelled' group by 1
    ),
    pay_by_branch as (select bill_branch, sum(base_minor) as net from cur_pay group by bill_branch),
    ord_by_branch as (select branch_id, count(*) as n from cur_ord where status <> 'cancelled' group by branch_id),
    pay_by_user as (select received_by, sum(base_minor) as net, count(*) as n from cur_pay group by received_by),
    ord_by_user as (select created_by, count(*) as n from cur_ord where status <> 'cancelled' group by created_by),
    items as (
      select i.*, o.branch_id from public.order_items i join cur_ord o on o.id = i.order_id
      where o.status <> 'cancelled' and i.status <> 'cancelled'
    ),
    totals as (
      select
        (select coalesce(sum(base_minor), 0) from cur_pay) as net_sales,
        (select coalesce(sum(tax_minor), 0) from cur_pay) as tax,
        (select coalesce(sum(amount_minor), 0) from cur_pay) as collected,
        (select count(distinct bill_id) from cur_pay) as bills,
        (select count(*) from cur_ord where status <> 'cancelled') as orders,
        (select count(*) from cur_ord where status = 'cancelled') as cancelled,
        (select coalesce(sum(b.discount_minor), 0) from public.bills b
          where b.tenant_id = p_tenant_id and b.branch_id = any (v_branches)
            and b.business_date between p_from and p_to and b.status in ('paid', 'refunded')) as discounts,
        (select coalesce(sum(r.amount_minor), 0) from public.refunds r join pay p on p.id = r.payment_id
          where p.business_date between p_from and p_to) as refunds,
        (select coalesce(sum(base_minor), 0) from prev_pay) as prev_net_sales,
        (select count(distinct bill_id) from prev_pay) as prev_bills,
        (select count(*) from prev_ord where status <> 'cancelled') as prev_orders
    )
    select jsonb_build_object(
      'range', jsonb_build_object('from', p_from, 'to', p_to, 'days', v_days, 'prev_from', v_prev_from, 'prev_to', v_prev_to),
      'currency', (select currency from public.tenants where id = p_tenant_id),
      'totals', (select jsonb_build_object(
          'net_sales_minor', net_sales, 'tax_minor', tax, 'collected_minor', collected,
          'bills', bills, 'orders', orders, 'cancelled_orders', cancelled,
          'avg_bill_minor', case when bills > 0 then round(net_sales::numeric / bills) else 0 end,
          'discounts_minor', discounts, 'refunds_minor', refunds,
          'prev_net_sales_minor', prev_net_sales, 'prev_bills', prev_bills, 'prev_orders', prev_orders,
          'prev_avg_bill_minor', case when prev_bills > 0 then round(prev_net_sales::numeric / prev_bills) else 0 end)
        from totals),
      -- Every day in the range, including days with no sales.
      'daily', (select jsonb_agg(jsonb_build_object(
          'date', d::date, 'net_sales_minor', coalesce(pd.net, 0), 'orders', coalesce(od.n, 0)) order by d)
        from generate_series(p_from, p_to, interval '1 day') d
        left join pay_by_day pd on pd.business_date = d::date
        left join ord_by_day od on od.business_date = d::date),
      'hourly', (select jsonb_agg(jsonb_build_object('hour', g.h, 'orders', coalesce(oh.n, 0)) order by g.h)
        from generate_series(0, 23) as g(h) left join ord_by_hour oh on oh.h = g.h),
      'top_items', coalesce((select jsonb_agg(x order by x.revenue_minor desc) from (
          select i.name, sum(i.quantity) as quantity, sum(i.line_total_minor) as revenue_minor
          from items i group by i.name order by sum(i.line_total_minor) desc limit 15) x), '[]'),
      'categories', coalesce((select jsonb_agg(x order by x.revenue_minor desc) from (
          select coalesce(c.name, 'Removed items') as name, sum(i.quantity) as quantity, sum(i.line_total_minor) as revenue_minor
          from items i left join public.products p on p.id = i.product_id left join public.categories c on c.id = p.category_id
          group by coalesce(c.name, 'Removed items')) x), '[]'),
      'payment_methods', coalesce((select jsonb_agg(x order by x.amount_minor desc) from (
          select method, count(*) as payments, sum(amount_minor) as amount_minor, sum(tax_minor) as tax_minor
          from cur_pay group by method) x), '[]'),
      'sources', coalesce((select jsonb_agg(x order by x.orders desc) from (
          select source, type, count(*) as orders, sum(total_minor) as value_minor
          from cur_ord where status <> 'cancelled' group by source, type) x), '[]'),
      'branches', coalesce((select jsonb_agg(x order by x.net_sales_minor desc) from (
          select br.name, coalesce(pb.net, 0) as net_sales_minor, coalesce(ob.n, 0) as orders
          from public.branches br
          left join pay_by_branch pb on pb.bill_branch = br.id
          left join ord_by_branch ob on ob.branch_id = br.id
          where br.id = any (v_branches)) x), '[]'),
      'staff', coalesce((select jsonb_agg(x order by x.net_sales_minor desc) from (
          select pr.full_name as name, pr.email,
                 coalesce((select pu.net from pay_by_user pu where pu.received_by = m.user_id), 0) as net_sales_minor,
                 coalesce((select pu.n from pay_by_user pu where pu.received_by = m.user_id), 0) as payments,
                 coalesce((select ou.n from ord_by_user ou where ou.created_by = m.user_id), 0) as orders_taken,
                 (select count(*) from public.guest_requests g where g.handled_by = m.user_id and g.branch_id = any (v_branches)
                    and (g.created_at at time zone v_tz)::date between p_from and p_to) as requests_handled,
                 (select round(avg(extract(epoch from g.acknowledged_at - g.created_at)))::int from public.guest_requests g
                    where g.handled_by = m.user_id and g.branch_id = any (v_branches) and g.acknowledged_at is not null
                    and (g.created_at at time zone v_tz)::date between p_from and p_to) as avg_response_seconds
          from public.tenant_members m join public.profiles pr on pr.id = m.user_id
          where m.tenant_id = p_tenant_id) x
          where x.net_sales_minor > 0 or x.orders_taken > 0 or x.requests_handled > 0), '[]'),
      'kitchen', coalesce((select jsonb_agg(x order by x.tickets desc) from (
          select coalesce(s.name, 'Unassigned') as station, count(*) as tickets,
                 round(avg(extract(epoch from t.ready_at - coalesce(t.started_at, t.accepted_at))) / 60.0, 1) as avg_cook_minutes,
                 round(avg(extract(epoch from t.ready_at - t.created_at)) / 60.0, 1) as avg_total_minutes,
                 count(*) filter (where t.ready_at - t.created_at > interval '20 minutes') as over_20_minutes
          from public.kitchen_tickets t
          join cur_ord o on o.id = t.order_id
          left join public.kitchen_stations s on s.id = t.station_id
          where t.ready_at is not null
          group by coalesce(s.name, 'Unassigned')) x), '[]'),
      'requests', (select jsonb_build_object(
          'count', count(*),
          'avg_response_seconds', round(avg(extract(epoch from acknowledged_at - created_at)))::int)
        from public.guest_requests
        where tenant_id = p_tenant_id and branch_id = any (v_branches)
          and (created_at at time zone v_tz)::date between p_from and p_to)
    )
  );
end;
$$;

alter table public.bills
  add column customer_phone_norm text generated always as (private.wa_number(customer_phone)) stored;
drop index if exists public.bills_customer_phone_idx;
create index bills_customer_phone_norm_idx on public.bills (tenant_id, customer_phone_norm) where customer_phone_norm is not null;

create or replace function public.customers_list(p_tenant_id uuid, p_branch_id uuid default null, p_search text default null)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_branches uuid[] := private.customer_branches(p_tenant_id, p_branch_id);
  v_q text := nullif(trim(coalesce(p_search, '')), '');
begin
  if cardinality(v_branches) = 0 then
    raise exception 'You do not have permission to view customers' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(c) order by c.last_visit desc)
    from (
      select b.customer_phone_norm as phone,
             (array_agg(b.customer_name order by b.paid_at desc, b.bill_number desc) filter (where b.customer_name is not null))[1] as name,
             count(*) as visits,
             sum(b.paid_total_minor) as spent_minor,
             min(b.paid_at) as first_visit,
             max(b.paid_at) as last_visit,
             round(avg(r.rating), 1) as avg_rating
      from public.bills b
      left join public.reviews r on r.bill_id = b.id
      where b.tenant_id = p_tenant_id and b.branch_id = any (v_branches) and b.status = 'paid'
        and b.customer_phone_norm is not null
      group by b.customer_phone_norm
      having v_q is null
          -- Digits typed as "0321…" match the stored "92321…".
          or b.customer_phone_norm like '%' || regexp_replace(regexp_replace(v_q, '\D', '', 'g'), '^0', '') || '%'
             and regexp_replace(regexp_replace(v_q, '\D', '', 'g'), '^0', '') <> ''
          or bool_or(b.customer_name ilike '%' || v_q || '%')
      order by max(b.paid_at) desc
      limit 200
    ) c), '[]');
end;
$$;

create or replace function public.customer_detail(p_tenant_id uuid, p_phone text)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_branches uuid[] := private.customer_branches(p_tenant_id, null);
  v_phone text := private.wa_number(p_phone);
begin
  if cardinality(v_branches) = 0 then
    raise exception 'You do not have permission to view customers' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'phone', v_phone,
    'visits', coalesce((
      select jsonb_agg(jsonb_build_object('bill_number', b.bill_number, 'paid_at', b.paid_at, 'type', b.type,
               'branch', br.name, 'total_minor', b.paid_total_minor, 'receipt_token', b.receipt_token,
               'rating', r.rating, 'comment', r.comment,
               'items', (select string_agg(i.quantity || '× ' || i.name, ', ' order by i.created_at)
                         from public.orders o join public.order_items i on i.order_id = o.id
                         where o.bill_id = b.id and i.status <> 'cancelled'))
             order by b.paid_at desc)
      from public.bills b
      join public.branches br on br.id = b.branch_id
      left join public.reviews r on r.bill_id = b.id
      where b.tenant_id = p_tenant_id and b.branch_id = any (v_branches) and b.status = 'paid'
        and b.customer_phone_norm = v_phone), '[]'));
end;
$$;

create or replace function public.customer_insights(p_tenant_id uuid, p_branch_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_branches uuid[] := private.customer_branches(p_tenant_id, p_branch_id);
begin
  if cardinality(v_branches) = 0 then
    raise exception 'You do not have permission to view customers' using errcode = '42501';
  end if;
  if p_from > p_to or p_to - p_from > 366 then
    raise exception 'Choose a range of up to one year' using errcode = '22023';
  end if;
  return (
    with visits as (
      select customer_phone_norm as phone, business_date
      from public.bills
      where tenant_id = p_tenant_id and branch_id = any (v_branches) and status = 'paid'
        and customer_phone_norm is not null
    ), in_range as (
      select phone, count(*) as n from visits where business_date between p_from and p_to group by phone
    ), firsts as (
      select phone, min(business_date) as first_date from visits group by phone
    ), rv as (
      select r.* from public.reviews r
      join public.bills b on b.id = r.bill_id
      where r.tenant_id = p_tenant_id and r.branch_id = any (v_branches) and b.business_date between p_from and p_to
    )
    select jsonb_build_object(
      'customers', (select count(*) from in_range),
      'new_customers', (select count(*) from in_range i join firsts f using (phone) where f.first_date between p_from and p_to),
      'returning_customers', (select count(*) from in_range i join firsts f using (phone) where f.first_date < p_from),
      'repeat_in_period', (select count(*) from in_range where n > 1),
      'reviews', (select count(*) from rv),
      'avg_rating', (select round(avg(rating), 2) from rv),
      'distribution', (select jsonb_agg(jsonb_build_object('stars', s, 'count', (select count(*) from rv where rating = s)) order by s desc)
                       from generate_series(1, 5) s),
      'recent', coalesce((select jsonb_agg(x order by x.created_at desc) from (
                   select rv.rating, rv.comment, rv.customer_name, rv.created_at, b.bill_number, br.name as branch
                   from rv join public.bills b on b.id = rv.bill_id join public.branches br on br.id = rv.branch_id
                   order by rv.created_at desc limit 50) x), '[]'))
  );
end;
$$;

create index orders_branch_open_idx on public.orders (branch_id, created_at)
  where status in ('new', 'accepted', 'preparing', 'ready', 'served');
