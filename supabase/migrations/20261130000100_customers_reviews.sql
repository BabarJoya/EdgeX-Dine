-- =============================================================================
-- Phase 10a: guest reviews and the customer directory.
--
-- * reviews: one per paid bill, left from the receipt link (unguessable
--   token). Happy guests (4–5★) are offered the branch's Google review link.
-- * Customers are not a separate table: they are the phone numbers on bills
--   (POS, online orders, reservations), grouped. Nothing to keep in sync.
-- =============================================================================

alter table public.branches
  add column google_review_url text check (google_review_url is null or google_review_url ~ '^https://');
grant update (google_review_url) on public.branches to authenticated;

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  bill_id uuid not null unique,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 500),
  customer_name text,
  customer_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (bill_id, tenant_id) references public.bills (id, tenant_id) on delete cascade,
  foreign key (branch_id, tenant_id) references public.branches (id, tenant_id) on delete cascade
);
create index reviews_branch_created_idx on public.reviews (branch_id, created_at desc);
create trigger reviews_updated_at before update on public.reviews
  for each row execute function private.set_updated_at();

alter table public.reviews enable row level security;
revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to authenticated;
create policy reviews_select on public.reviews for select to authenticated
  using (private.has_branch_perm(tenant_id, branch_id, 'customers.view')
         or private.has_branch_perm(tenant_id, branch_id, 'reports.view'));

-- Normalised phone used to group customers (same rule as WhatsApp numbers).
create index bills_customer_phone_idx on public.bills (tenant_id, (private.wa_number(customer_phone)))
  where customer_phone is not null;

-- ---------------------------------------------------------------------------
-- Guest side (receipt link)
-- ---------------------------------------------------------------------------
create or replace function public.get_review(p_receipt_token text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'can_review', b.status = 'paid' and coalesce(r.created_at, now()) > now() - interval '7 days'
                  and b.paid_at > now() - interval '14 days',
    'rating', r.rating, 'comment', r.comment,
    'google_review_url', case when r.rating >= 4 then br.google_review_url end)
  from public.bills b
  join public.branches br on br.id = b.branch_id
  left join public.reviews r on r.bill_id = b.id
  where b.receipt_token = p_receipt_token;
$$;

create or replace function public.submit_review(p_receipt_token text, p_rating int, p_comment text default '')
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_bill public.bills;
begin
  select * into v_bill from public.bills where receipt_token = p_receipt_token;
  if v_bill.id is null then
    raise exception 'Receipt not found' using errcode = 'P0002';
  end if;
  if v_bill.status <> 'paid' or v_bill.paid_at < now() - interval '14 days' then
    raise exception 'This bill can no longer be reviewed' using errcode = 'P0001';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Choose 1 to 5 stars' using errcode = '22023';
  end if;
  if exists (select 1 from public.reviews where bill_id = v_bill.id and created_at < now() - interval '7 days') then
    raise exception 'This review can no longer be changed' using errcode = 'P0001';
  end if;

  insert into public.reviews (tenant_id, branch_id, bill_id, rating, comment, customer_name, customer_phone)
  values (v_bill.tenant_id, v_bill.branch_id, v_bill.id, p_rating, left(trim(coalesce(p_comment, '')), 500),
          v_bill.customer_name, v_bill.customer_phone)
  on conflict (bill_id) do update set rating = excluded.rating, comment = excluded.comment;

  return public.get_review(p_receipt_token);
end;
$$;
grant execute on function public.get_review(text), public.submit_review(text, int, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Staff side
-- ---------------------------------------------------------------------------
create or replace function private.customer_branches(p_tenant_id uuid, p_branch_id uuid)
returns uuid[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(b.id), '{}') from public.branches b
  where b.tenant_id = p_tenant_id and (p_branch_id is null or b.id = p_branch_id)
    and private.has_branch_perm(p_tenant_id, b.id, 'customers.view');
$$;

-- Customer list: one row per phone number on paid bills.
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
      select private.wa_number(b.customer_phone) as phone,
             (array_agg(b.customer_name order by b.paid_at desc, b.bill_number desc) filter (where b.customer_name is not null))[1] as name,
             count(*) as visits,
             sum(b.paid_total_minor) as spent_minor,
             min(b.paid_at) as first_visit,
             max(b.paid_at) as last_visit,
             round(avg(r.rating), 1) as avg_rating
      from public.bills b
      left join public.reviews r on r.bill_id = b.id
      where b.tenant_id = p_tenant_id and b.branch_id = any (v_branches) and b.status = 'paid'
        and private.wa_number(b.customer_phone) is not null
      group by private.wa_number(b.customer_phone)
      having v_q is null
          -- Digits typed as "0321…" match the stored "92321…".
          or private.wa_number(b.customer_phone) like '%' || regexp_replace(regexp_replace(v_q, '\D', '', 'g'), '^0', '') || '%'
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
        and private.wa_number(b.customer_phone) = v_phone), '[]'));
end;
$$;

-- Retention and feedback for a period.
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
      select private.wa_number(customer_phone) as phone, business_date
      from public.bills
      where tenant_id = p_tenant_id and branch_id = any (v_branches) and status = 'paid'
        and private.wa_number(customer_phone) is not null
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

revoke execute on function public.customers_list(uuid, uuid, text), public.customer_detail(uuid, text),
  public.customer_insights(uuid, uuid, date, date) from public, anon;
grant execute on function public.customers_list(uuid, uuid, text), public.customer_detail(uuid, text),
  public.customer_insights(uuid, uuid, date, date) to authenticated;
