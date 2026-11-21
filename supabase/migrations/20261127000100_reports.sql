-- =============================================================================
-- Phase 7 · Reports & analytics.
--
-- One SECURITY DEFINER function computes a whole report for a date range so
-- the numbers on screen, in Excel and in PDF always agree. It only includes
-- branches the caller may see, requires reports.view, and the plan's
-- 'reports' feature. Dates are business dates (local to the branch).
--
-- Definitions
--   net sales  = pre-tax amount of completed payments (after discount,
--                incl. service charge), refunds excluded
--   tax        = tax on completed payments
--   collected  = everything taken incl. tax (completed payments)
--   orders     = orders not cancelled
--   avg bill   = net sales / paid bills
-- =============================================================================

create or replace function private.report_branches(p_tenant_id uuid, p_branch_id uuid)
returns uuid[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(b.id), '{}')
  from public.branches b
  where b.tenant_id = p_tenant_id
    and (p_branch_id is null or b.id = p_branch_id)
    and private.has_branch_perm(p_tenant_id, b.id, 'reports.view');
$$;

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
          'date', d::date,
          'net_sales_minor', coalesce((select sum(base_minor) from cur_pay where business_date = d::date), 0),
          'orders', (select count(*) from cur_ord where business_date = d::date and status <> 'cancelled')) order by d)
        from generate_series(p_from, p_to, interval '1 day') d),
      'hourly', (select jsonb_agg(jsonb_build_object('hour', h,
          'orders', (select count(*) from cur_ord o where o.status <> 'cancelled'
                     and extract(hour from o.created_at at time zone v_tz) = h)) order by h)
        from generate_series(0, 23) h),
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
          select br.name,
                 coalesce((select sum(base_minor) from cur_pay p where p.bill_branch = br.id), 0) as net_sales_minor,
                 (select count(*) from cur_ord o where o.branch_id = br.id and o.status <> 'cancelled') as orders
          from public.branches br where br.id = any (v_branches)) x), '[]'),
      'staff', coalesce((select jsonb_agg(x order by x.net_sales_minor desc) from (
          select pr.full_name as name, pr.email,
                 coalesce((select sum(base_minor) from cur_pay p where p.received_by = m.user_id), 0) as net_sales_minor,
                 (select count(*) from cur_pay p where p.received_by = m.user_id) as payments,
                 (select count(*) from cur_ord o where o.created_by = m.user_id and o.status <> 'cancelled') as orders_taken,
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

-- Today's numbers for the dashboard (no plan feature needed).
create or replace function public.dashboard_today(p_tenant_id uuid, p_branch_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_branches uuid[];
  v_today date := (now() at time zone (select timezone from public.tenants where id = p_tenant_id))::date;
begin
  select coalesce(array_agg(b.id), '{}') into v_branches from public.branches b
  where b.tenant_id = p_tenant_id and (p_branch_id is null or b.id = p_branch_id)
    and private.has_branch_perm(p_tenant_id, b.id, 'dashboard.view');
  if cardinality(v_branches) = 0 then
    return null;
  end if;
  return jsonb_build_object(
    'net_sales_minor', (select coalesce(sum(p.base_minor), 0) from public.payments p join public.bills b on b.id = p.bill_id
                        where b.branch_id = any (v_branches) and b.business_date = v_today and p.status = 'completed'),
    'orders', (select count(*) from public.orders where branch_id = any (v_branches) and business_date = v_today and status <> 'cancelled'),
    'open_tables', (select count(*) from public.table_sessions where branch_id = any (v_branches) and status = 'open'),
    'avg_ticket_minutes', (select round(avg(extract(epoch from t.ready_at - t.created_at)) / 60.0, 1)
                           from public.kitchen_tickets t join public.orders o on o.id = t.order_id
                           where o.branch_id = any (v_branches) and o.business_date = v_today and t.ready_at is not null),
    'yesterday_net_sales_minor', (select coalesce(sum(p.base_minor), 0) from public.payments p join public.bills b on b.id = p.bill_id
                        where b.branch_id = any (v_branches) and b.business_date = v_today - 1 and p.status = 'completed')
  );
end;
$$;

-- Helpful indexes for reporting by business date.
create index if not exists bills_branch_date_idx on public.bills (branch_id, business_date);
create index if not exists orders_branch_date_idx on public.orders (branch_id, business_date);
create index if not exists kitchen_tickets_order_idx on public.kitchen_tickets (order_id);
create index if not exists guest_requests_branch_created_idx on public.guest_requests (branch_id, created_at);

revoke execute on function public.sales_report(uuid, uuid, date, date), public.dashboard_today(uuid, uuid) from public, anon;
grant execute on function public.sales_report(uuid, uuid, date, date), public.dashboard_today(uuid, uuid) to authenticated;
revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, anon;
