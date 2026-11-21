-- =============================================================================
-- Phase 5 · Billing: branch tax settings, bills, payments (split / mixed),
-- refunds, cashier shifts, cash movements, PIN operators for shared POS
-- devices, public receipt links.
--
-- Tax model: a bill's pre-tax amount ("base") = items − discount + service.
-- Each payment covers part of the base and adds tax at the rate for its
-- method (e.g. PRA: 16% cash, 5% card), so mixed cash/card splits are taxed
-- correctly. All amounts are integer minor units.
-- =============================================================================

create type public.bill_status as enum ('open', 'paid', 'refunded', 'void');
create type public.payment_method as enum ('cash', 'card', 'wallet', 'bank_transfer');
create type public.payment_status as enum ('completed', 'refunded');
create type public.shift_status as enum ('open', 'closed');
create type public.cash_movement_type as enum ('in', 'out');

-- ---------------------------------------------------------------------------
-- Branch billing settings (basis points: 1600 = 16%)
-- ---------------------------------------------------------------------------
alter table public.branches
  add column tax_label text not null default 'Sales tax' check (char_length(tax_label) <= 40),
  add column tax_cash_bps int not null default 0 check (tax_cash_bps between 0 and 5000),
  add column tax_card_bps int not null default 0 check (tax_card_bps between 0 and 5000),
  add column tax_wallet_bps int not null default 0 check (tax_wallet_bps between 0 and 5000),
  add column service_charge_bps int not null default 0 check (service_charge_bps between 0 and 3000),
  add column tax_registration text check (tax_registration is null or char_length(tax_registration) <= 60),
  add column receipt_footer text check (receipt_footer is null or char_length(receipt_footer) <= 300);

grant update (tax_label, tax_cash_bps, tax_card_bps, tax_wallet_bps, service_charge_bps, tax_registration, receipt_footer)
  on public.branches to authenticated;

-- ---------------------------------------------------------------------------
-- Cashier shifts & cash movements
-- ---------------------------------------------------------------------------
create table public.cash_shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  user_id uuid not null references auth.users (id),
  status public.shift_status not null default 'open',
  opening_float_minor bigint not null default 0 check (opening_float_minor >= 0),
  counted_cash_minor bigint check (counted_cash_minor >= 0),
  expected_cash_minor bigint,
  variance_minor bigint,
  notes text not null default '' check (char_length(notes) <= 500),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (id, tenant_id),
  foreign key (branch_id, tenant_id) references public.branches (id, tenant_id) on delete cascade
);
create unique index cash_shifts_one_open on public.cash_shifts (branch_id, user_id) where status = 'open';

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  shift_id uuid not null,
  type public.cash_movement_type not null,
  amount_minor bigint not null check (amount_minor > 0),
  reason text not null check (char_length(reason) between 1 and 200),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  foreign key (shift_id, tenant_id) references public.cash_shifts (id, tenant_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Bills
-- ---------------------------------------------------------------------------
create table public.bill_counters (
  branch_id uuid not null references public.branches (id) on delete cascade,
  business_date date not null,
  last_number int not null default 0,
  primary key (branch_id, business_date)
);

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  session_id uuid unique,
  bill_number int not null,
  business_date date not null,
  type public.order_type not null default 'dine_in',
  status public.bill_status not null default 'open',
  currency text not null,
  subtotal_minor bigint not null default 0 check (subtotal_minor >= 0),
  discount_minor bigint not null default 0 check (discount_minor >= 0),
  discount_note text not null default '' check (char_length(discount_note) <= 200),
  service_bps int not null default 0,
  service_minor bigint not null default 0 check (service_minor >= 0),
  base_minor bigint not null default 0 check (base_minor >= 0),
  paid_base_minor bigint not null default 0 check (paid_base_minor >= 0),
  tax_minor bigint not null default 0 check (tax_minor >= 0),
  paid_total_minor bigint not null default 0 check (paid_total_minor >= 0),
  customer_name text check (customer_name is null or char_length(customer_name) <= 80),
  customer_phone text check (customer_phone is null or char_length(customer_phone) <= 32),
  -- Unguessable link for a digital receipt (WhatsApp / SMS in Phase 8).
  receipt_token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  created_by uuid references auth.users (id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (branch_id, business_date, bill_number),
  foreign key (branch_id, tenant_id) references public.branches (id, tenant_id) on delete cascade,
  foreign key (session_id, tenant_id) references public.table_sessions (id, tenant_id) on delete set null (session_id)
);
create index bills_branch_created_idx on public.bills (branch_id, created_at desc);
create trigger bills_updated_at before update on public.bills
  for each row execute function private.set_updated_at();

alter table public.orders add column bill_id uuid;
alter table public.orders add constraint orders_bill_fk
  foreign key (bill_id, tenant_id) references public.bills (id, tenant_id) on delete set null (bill_id);
create index orders_bill_idx on public.orders (bill_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  bill_id uuid not null,
  shift_id uuid not null,
  method public.payment_method not null,
  status public.payment_status not null default 'completed',
  base_minor bigint not null check (base_minor > 0),
  tax_bps int not null,
  tax_minor bigint not null check (tax_minor >= 0),
  amount_minor bigint not null check (amount_minor > 0),
  tendered_minor bigint check (tendered_minor is null or tendered_minor >= 0),
  change_minor bigint not null default 0 check (change_minor >= 0),
  reference text check (reference is null or char_length(reference) <= 80),
  note text not null default '' check (char_length(note) <= 300),
  received_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (bill_id, tenant_id) references public.bills (id, tenant_id) on delete cascade,
  foreign key (shift_id, tenant_id) references public.cash_shifts (id, tenant_id)
);
create index payments_bill_idx on public.payments (bill_id);
create index payments_shift_idx on public.payments (shift_id);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  payment_id uuid not null,
  shift_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  reason text not null check (char_length(reason) between 1 and 300),
  refunded_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  foreign key (payment_id, tenant_id) references public.payments (id, tenant_id) on delete cascade,
  foreign key (shift_id, tenant_id) references public.cash_shifts (id, tenant_id)
);

create trigger audit_bills after update of status, discount_minor on public.bills
  for each row execute function private.audit_row();
create trigger audit_payments after insert or update on public.payments
  for each row execute function private.audit_row();
create trigger audit_refunds after insert on public.refunds
  for each row execute function private.audit_row();
create trigger audit_cash_shifts after insert or update on public.cash_shifts
  for each row execute function private.audit_row();
create trigger audit_cash_movements after insert on public.cash_movements
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- PIN operators for shared POS devices
-- ---------------------------------------------------------------------------
create table public.staff_pins (
  member_id uuid primary key,
  tenant_id uuid not null,
  pin_hash text not null,
  updated_at timestamptz not null default now(),
  foreign key (member_id, tenant_id) references public.tenant_members (id, tenant_id) on delete cascade
);

create table public.pos_operator_sessions (
  token text primary key default encode(extensions.gen_random_bytes(24), 'hex'),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  operator_id uuid not null references auth.users (id) on delete cascade,
  device_user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '12 hours',
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.pos_unlock_attempts (
  device_user_id uuid primary key references auth.users (id) on delete cascade,
  failures int not null default 0,
  locked_until timestamptz
);

-- Permission check for any user (the PIN operator), same rules as has_perm.
create or replace function private.user_has_branch_perm(p_user uuid, p_tenant_id uuid, p_branch_id uuid, p_perm text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_members m
    join public.tenants t on t.id = m.tenant_id and t.status = 'active'
    join public.roles r on r.id = m.role_id
    where m.tenant_id = p_tenant_id and m.user_id = p_user and m.status = 'active'
      and (r.is_owner or exists (select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_key = p_perm))
      and (m.all_branches or exists (select 1 from public.member_branches mb where mb.member_id = m.id and mb.branch_id = p_branch_id))
  );
$$;

-- Who is acting at the POS: the PIN operator if a valid token for this
-- device user and branch is given, otherwise the signed-in user.
create or replace function private.pos_actor(p_operator_token text, p_branch_id uuid)
returns uuid
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_op uuid;
begin
  if nullif(p_operator_token, '') is null then
    return auth.uid();
  end if;
  select operator_id into v_op from public.pos_operator_sessions
  where token = p_operator_token and device_user_id = auth.uid() and branch_id = p_branch_id
    and revoked_at is null and expires_at > now();
  if v_op is null then
    raise exception 'Cashier session expired. Enter your PIN again.' using errcode = '42501', hint = 'operator_expired';
  end if;
  return v_op;
end;
$$;

create or replace function public.set_my_pin(p_tenant_id uuid, p_pin text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_member uuid;
begin
  if p_pin !~ '^\d{6}$' then
    raise exception 'PIN must be 6 digits' using errcode = '22023';
  end if;
  if p_pin in ('000000', '111111', '123456', '654321', '121212', '112233') then
    raise exception 'Choose a less obvious PIN' using errcode = '22023';
  end if;
  select id into v_member from public.tenant_members where tenant_id = p_tenant_id and user_id = auth.uid() and status = 'active';
  if v_member is null then
    raise exception 'Not a member of this restaurant' using errcode = '42501';
  end if;
  -- Unique per restaurant so a PIN identifies exactly one person.
  if exists (
    select 1 from public.staff_pins sp
    where sp.tenant_id = p_tenant_id and sp.member_id <> v_member
      and sp.pin_hash = extensions.crypt(p_pin, sp.pin_hash)) then
    raise exception 'That PIN is already used by someone else here. Choose another.' using errcode = '23505';
  end if;
  insert into public.staff_pins (member_id, tenant_id, pin_hash)
  values (v_member, p_tenant_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)))
  on conflict (member_id) do update set pin_hash = excluded.pin_hash, updated_at = now();
end;
$$;

-- Unlock the POS as a cashier. The device must be signed in by someone with
-- pos.use at this branch. Five wrong PINs lock the device for five minutes.
-- Wrong / locked results are RETURNED, not raised: raising would roll back the
-- failed-attempt counter and make the lockout useless.
create or replace function public.pos_unlock(p_branch_id uuid, p_pin text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_branch public.branches;
  v_attempt public.pos_unlock_attempts;
  v_member record;
  v_token text;
begin
  select * into v_branch from public.branches where id = p_branch_id;
  if v_branch.id is null or not private.has_branch_perm(v_branch.tenant_id, v_branch.id, 'pos.use') then
    raise exception 'This device cannot open the POS for this branch' using errcode = '42501';
  end if;
  select * into v_attempt from public.pos_unlock_attempts where device_user_id = auth.uid();
  if v_attempt.locked_until > now() then
    return jsonb_build_object('error', 'locked', 'message', 'Too many wrong PINs. Try again in a few minutes.');
  end if;

  select m.user_id, p.full_name, r.name as role_name into v_member
  from public.staff_pins sp
  join public.tenant_members m on m.id = sp.member_id and m.status = 'active'
  join public.roles r on r.id = m.role_id
  join public.profiles p on p.id = m.user_id
  where sp.tenant_id = v_branch.tenant_id and sp.pin_hash = extensions.crypt(p_pin, sp.pin_hash)
  limit 1;

  if v_member.user_id is null or not private.user_has_branch_perm(v_member.user_id, v_branch.tenant_id, v_branch.id, 'pos.use') then
    insert into public.pos_unlock_attempts (device_user_id, failures) values (auth.uid(), 1)
    on conflict (device_user_id) do update set
      failures = case when public.pos_unlock_attempts.locked_until <= now() then 1 else public.pos_unlock_attempts.failures + 1 end,
      locked_until = case when public.pos_unlock_attempts.failures + 1 >= 5 then now() + interval '5 minutes' else null end;
    return jsonb_build_object('error', 'bad_pin', 'message', 'Wrong PIN');
  end if;

  delete from public.pos_unlock_attempts where device_user_id = auth.uid();
  insert into public.pos_operator_sessions (tenant_id, branch_id, operator_id, device_user_id)
  values (v_branch.tenant_id, v_branch.id, v_member.user_id, auth.uid())
  returning token into v_token;
  return jsonb_build_object('token', v_token, 'user_id', v_member.user_id, 'name', v_member.full_name, 'role', v_member.role_name);
end;
$$;

create or replace function public.pos_lock(p_operator_token text)
returns void
language sql security definer
set search_path = ''
as $$
  update public.pos_operator_sessions set revoked_at = now()
  where token = p_operator_token and device_user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Bill calculation
-- ---------------------------------------------------------------------------
create or replace function private.recalc_bill(p_bill_id uuid)
returns public.bills
language plpgsql security definer
set search_path = ''
as $$
declare
  v_bill public.bills;
  v_sub bigint;
begin
  select * into v_bill from public.bills where id = p_bill_id for update;
  if v_bill.id is null or v_bill.status = 'void' then
    return v_bill;
  end if;
  select coalesce(sum(total_minor), 0) into v_sub from public.orders
  where bill_id = v_bill.id and status <> 'cancelled';

  update public.bills b set
    subtotal_minor = v_sub,
    discount_minor = least(b.discount_minor, v_sub),
    service_minor = case when b.type = 'dine_in' then round((v_sub - least(b.discount_minor, v_sub)) * b.service_bps / 10000.0)::bigint else 0 end,
    base_minor = (v_sub - least(b.discount_minor, v_sub))
                 + case when b.type = 'dine_in' then round((v_sub - least(b.discount_minor, v_sub)) * b.service_bps / 10000.0)::bigint else 0 end
  where id = v_bill.id
  returning * into v_bill;

  update public.bills set
    status = case
      when status = 'refunded' then 'refunded'
      when paid_base_minor >= base_minor and base_minor > 0 then 'paid'
      else 'open' end::public.bill_status,
    paid_at = case when paid_base_minor >= base_minor and base_minor > 0 then coalesce(paid_at, now()) else null end
  where id = v_bill.id
  returning * into v_bill;
  return v_bill;
end;
$$;

create or replace function private.new_bill(p_branch_id uuid, p_type public.order_type, p_session_id uuid, p_by uuid)
returns public.bills
language plpgsql security definer
set search_path = ''
as $$
declare
  v_branch public.branches;
  v_tz text;
  v_currency text;
  v_date date;
  v_no int;
  v_bill public.bills;
begin
  select b.* into v_branch from public.branches b where b.id = p_branch_id;
  select coalesce(v_branch.timezone, t.timezone), t.currency into v_tz, v_currency from public.tenants t where t.id = v_branch.tenant_id;
  v_date := (now() at time zone v_tz)::date;
  insert into public.bill_counters (branch_id, business_date, last_number) values (p_branch_id, v_date, 1)
  on conflict (branch_id, business_date) do update set last_number = public.bill_counters.last_number + 1
  returning last_number into v_no;
  insert into public.bills (tenant_id, branch_id, session_id, bill_number, business_date, type, currency, service_bps, created_by)
  values (v_branch.tenant_id, p_branch_id, p_session_id, v_no, v_date, p_type, v_currency,
          case when p_type = 'dine_in' then v_branch.service_charge_bps else 0 end, p_by)
  returning * into v_bill;
  return v_bill;
end;
$$;

-- Orders added to a sitting that already has a bill join it automatically.
create or replace function private.order_joins_bill()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_bill uuid;
begin
  if tg_op = 'INSERT' and new.session_id is not null and new.bill_id is null then
    select id into v_bill from public.bills where session_id = new.session_id and status <> 'void';
    if v_bill is not null then
      update public.orders set bill_id = v_bill where id = new.id;
    end if;
  end if;
  return null;
end;
$$;
create trigger orders_join_bill after insert on public.orders
  for each row execute function private.order_joins_bill();

create or replace function private.order_changes_bill()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.bill_id is not null then
    perform private.recalc_bill(new.bill_id);
  end if;
  if tg_op = 'UPDATE' and old.bill_id is not null and old.bill_id is distinct from new.bill_id then
    perform private.recalc_bill(old.bill_id);
  end if;
  return null;
end;
$$;
create trigger orders_change_bill after insert or update of status, total_minor, bill_id on public.orders
  for each row execute function private.order_changes_bill();

-- Merging sittings moves orders; keep each bill in step via the trigger above.

-- ---------------------------------------------------------------------------
-- POS RPCs
-- ---------------------------------------------------------------------------

-- Get (or create) the bill for a table sitting.
create or replace function public.open_table_bill(p_session_id uuid, p_operator_token text default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_session public.table_sessions;
  v_actor uuid;
  v_bill public.bills;
begin
  select * into v_session from public.table_sessions where id = p_session_id and status = 'open' for update;
  if v_session.id is null then
    raise exception 'Open table not found' using errcode = 'P0002';
  end if;
  v_actor := private.pos_actor(p_operator_token, v_session.branch_id);
  if not private.user_has_branch_perm(v_actor, v_session.tenant_id, v_session.branch_id, 'pos.use') then
    raise exception 'Open table not found' using errcode = 'P0002';
  end if;
  select * into v_bill from public.bills where session_id = v_session.id and status <> 'void';
  if v_bill.id is null then
    v_bill := private.new_bill(v_session.branch_id, 'dine_in', v_session.id, v_actor);
  end if;
  update public.orders set bill_id = v_bill.id where session_id = v_session.id and bill_id is null;
  perform private.recalc_bill(v_bill.id);
  return v_bill.id;
end;
$$;

-- Takeaway / delivery order straight from the POS (with its own bill).
create or replace function public.create_counter_order(
  p_branch_id uuid,
  p_type public.order_type,
  p_items jsonb,
  p_notes text default '',
  p_customer_name text default null,
  p_customer_phone text default null,
  p_operator_token text default null
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_branch public.branches;
  v_actor uuid;
  v_bill public.bills;
  v_order public.orders;
begin
  if p_type = 'dine_in' then
    raise exception 'Dine-in orders are taken on a table' using errcode = '22023';
  end if;
  select * into v_branch from public.branches where id = p_branch_id and is_active;
  if v_branch.id is null then
    raise exception 'Branch not found' using errcode = 'P0002';
  end if;
  v_actor := private.pos_actor(p_operator_token, p_branch_id);
  if not (private.user_has_branch_perm(v_actor, v_branch.tenant_id, p_branch_id, 'pos.use')
      and private.user_has_branch_perm(v_actor, v_branch.tenant_id, p_branch_id, 'orders.create')) then
    raise exception 'You do not have permission to take orders here' using errcode = '42501';
  end if;
  v_bill := private.new_bill(p_branch_id, p_type, null, v_actor);
  update public.bills set customer_name = nullif(trim(p_customer_name), ''), customer_phone = nullif(trim(p_customer_phone), '')
  where id = v_bill.id;
  v_order := private.create_order(v_branch.tenant_id, p_branch_id, null, null, 'pos', p_type, p_items, p_notes, v_actor);
  update public.orders set bill_id = v_bill.id where id = v_order.id;
  return jsonb_build_object('bill_id', v_bill.id, 'order_id', v_order.id, 'order_number', v_order.order_number);
end;
$$;

create or replace function public.apply_bill_discount(
  p_bill_id uuid,
  p_amount_minor bigint,
  p_note text,
  p_operator_token text default null
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_bill public.bills;
  v_actor uuid;
begin
  select * into v_bill from public.bills where id = p_bill_id for update;
  if v_bill.id is null then
    raise exception 'Bill not found' using errcode = 'P0002';
  end if;
  v_actor := private.pos_actor(p_operator_token, v_bill.branch_id);
  if not private.user_has_branch_perm(v_actor, v_bill.tenant_id, v_bill.branch_id, 'pos.use') then
    raise exception 'Bill not found' using errcode = 'P0002';
  end if;
  if not private.user_has_branch_perm(v_actor, v_bill.tenant_id, v_bill.branch_id, 'orders.discount') then
    raise exception 'You do not have permission to give discounts' using errcode = '42501';
  end if;
  if v_bill.status <> 'open' or v_bill.paid_base_minor > 0 then
    raise exception 'Discounts must be applied before any payment' using errcode = 'P0001';
  end if;
  if p_amount_minor < 0 or p_amount_minor > v_bill.subtotal_minor then
    raise exception 'Discount must be between 0 and the bill amount' using errcode = '22023';
  end if;
  if p_amount_minor > 0 and coalesce(trim(p_note), '') = '' then
    raise exception 'Give a reason for the discount' using errcode = '22023';
  end if;
  update public.bills set discount_minor = p_amount_minor, discount_note = coalesce(trim(p_note), '') where id = v_bill.id;
  perform private.recalc_bill(v_bill.id);
end;
$$;

-- Take a payment for part (or all) of the bill's base amount.
create or replace function public.take_payment(
  p_bill_id uuid,
  p_method public.payment_method,
  p_base_minor bigint,
  p_tendered_minor bigint default null,
  p_reference text default null,
  p_note text default '',
  p_operator_token text default null
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_bill public.bills;
  v_branch public.branches;
  v_actor uuid;
  v_shift uuid;
  v_bps int;
  v_tax bigint;
  v_amount bigint;
  v_change bigint := 0;
  v_payment public.payments;
begin
  select * into v_bill from public.bills where id = p_bill_id for update;
  if v_bill.id is null then
    raise exception 'Bill not found' using errcode = 'P0002';
  end if;
  v_actor := private.pos_actor(p_operator_token, v_bill.branch_id);
  if not private.user_has_branch_perm(v_actor, v_bill.tenant_id, v_bill.branch_id, 'payments.take') then
    raise exception 'You do not have permission to take payments' using errcode = '42501';
  end if;
  v_bill := private.recalc_bill(v_bill.id);
  if v_bill.status <> 'open' then
    raise exception 'This bill is already %', v_bill.status using errcode = 'P0001';
  end if;
  if p_base_minor is null or p_base_minor <= 0 or p_base_minor > v_bill.base_minor - v_bill.paid_base_minor then
    raise exception 'Amount must be more than zero and no more than what is left to pay' using errcode = '22023';
  end if;

  select id into v_shift from public.cash_shifts
  where branch_id = v_bill.branch_id and user_id = v_actor and status = 'open';
  if v_shift is null then
    raise exception 'Open a cash shift before taking payments' using errcode = 'P0001', hint = 'no_shift';
  end if;

  select * into v_branch from public.branches where id = v_bill.branch_id;
  v_bps := case p_method
    when 'cash' then v_branch.tax_cash_bps
    when 'card' then v_branch.tax_card_bps
    when 'wallet' then v_branch.tax_wallet_bps
    else v_branch.tax_card_bps end;
  v_tax := round(p_base_minor * v_bps / 10000.0)::bigint;
  v_amount := p_base_minor + v_tax;

  if p_method = 'cash' then
    if p_tendered_minor is not null then
      if p_tendered_minor < v_amount then
        raise exception 'Cash received is less than the amount due' using errcode = '22023';
      end if;
      v_change := p_tendered_minor - v_amount;
    end if;
  elsif p_tendered_minor is not null then
    raise exception 'Cash received only applies to cash payments' using errcode = '22023';
  end if;

  insert into public.payments (tenant_id, branch_id, bill_id, shift_id, method, base_minor, tax_bps, tax_minor,
                               amount_minor, tendered_minor, change_minor, reference, note, received_by)
  values (v_bill.tenant_id, v_bill.branch_id, v_bill.id, v_shift, p_method, p_base_minor, v_bps, v_tax,
          v_amount, p_tendered_minor, v_change, nullif(trim(p_reference), ''), left(coalesce(p_note, ''), 300), v_actor)
  returning * into v_payment;

  update public.bills set
    paid_base_minor = paid_base_minor + p_base_minor,
    tax_minor = tax_minor + v_tax,
    paid_total_minor = paid_total_minor + v_amount
  where id = v_bill.id;
  v_bill := private.recalc_bill(v_bill.id);

  return jsonb_build_object('payment_id', v_payment.id, 'amount_minor', v_amount, 'tax_minor', v_tax,
                            'change_minor', v_change, 'bill_status', v_bill.status,
                            'remaining_base_minor', v_bill.base_minor - v_bill.paid_base_minor);
end;
$$;

create or replace function public.refund_payment(p_payment_id uuid, p_reason text, p_operator_token text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_actor uuid;
  v_shift uuid;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  v_actor := private.pos_actor(p_operator_token, v_payment.branch_id);
  if not private.user_has_branch_perm(v_actor, v_payment.tenant_id, v_payment.branch_id, 'orders.refund') then
    raise exception 'You do not have permission to refund payments' using errcode = '42501';
  end if;
  if v_payment.status = 'refunded' then
    raise exception 'This payment was already refunded' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason for the refund' using errcode = '22023';
  end if;
  select id into v_shift from public.cash_shifts
  where branch_id = v_payment.branch_id and user_id = v_actor and status = 'open';
  if v_shift is null then
    raise exception 'Open a cash shift before refunding' using errcode = 'P0001', hint = 'no_shift';
  end if;

  update public.payments set status = 'refunded' where id = v_payment.id;
  insert into public.refunds (tenant_id, payment_id, shift_id, amount_minor, reason, refunded_by)
  values (v_payment.tenant_id, v_payment.id, v_shift, v_payment.amount_minor, trim(p_reason), v_actor);
  update public.bills set
    paid_base_minor = paid_base_minor - v_payment.base_minor,
    tax_minor = tax_minor - v_payment.tax_minor,
    paid_total_minor = paid_total_minor - v_payment.amount_minor,
    status = 'refunded'
  where id = v_payment.bill_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shifts
-- ---------------------------------------------------------------------------
create or replace function public.open_shift(p_branch_id uuid, p_opening_float_minor bigint, p_operator_token text default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_branch public.branches;
  v_actor uuid;
  v_id uuid;
begin
  select * into v_branch from public.branches where id = p_branch_id;
  if v_branch.id is null then
    raise exception 'Branch not found' using errcode = 'P0002';
  end if;
  v_actor := private.pos_actor(p_operator_token, p_branch_id);
  if not private.user_has_branch_perm(v_actor, v_branch.tenant_id, p_branch_id, 'payments.take') then
    raise exception 'You do not have permission to open a cash shift' using errcode = '42501';
  end if;
  if exists (select 1 from public.cash_shifts where branch_id = p_branch_id and user_id = v_actor and status = 'open') then
    raise exception 'You already have an open shift here' using errcode = 'P0001';
  end if;
  insert into public.cash_shifts (tenant_id, branch_id, user_id, opening_float_minor)
  values (v_branch.tenant_id, p_branch_id, v_actor, greatest(coalesce(p_opening_float_minor, 0), 0))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function private.shift_expected_cash(p_shift_id uuid)
returns bigint
language sql stable security definer
set search_path = ''
as $$
  select s.opening_float_minor
    + coalesce((select sum(p.amount_minor) from public.payments p where p.shift_id = s.id and p.method = 'cash'), 0)
    - coalesce((select sum(r.amount_minor) from public.refunds r join public.payments p on p.id = r.payment_id
                where r.shift_id = s.id and p.method = 'cash'), 0)
    + coalesce((select sum(amount_minor) from public.cash_movements m where m.shift_id = s.id and m.type = 'in'), 0)
    - coalesce((select sum(amount_minor) from public.cash_movements m where m.shift_id = s.id and m.type = 'out'), 0)
  from public.cash_shifts s where s.id = p_shift_id;
$$;

create or replace function private.manageable_shift(p_shift_id uuid, p_operator_token text)
returns public.cash_shifts
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_shift public.cash_shifts;
  v_actor uuid;
begin
  select * into v_shift from public.cash_shifts where id = p_shift_id;
  if v_shift.id is null then
    raise exception 'Shift not found' using errcode = 'P0002';
  end if;
  v_actor := private.pos_actor(p_operator_token, v_shift.branch_id);
  if not (v_shift.user_id = v_actor
          or private.user_has_branch_perm(v_actor, v_shift.tenant_id, v_shift.branch_id, 'shifts.manage')) then
    raise exception 'Shift not found' using errcode = 'P0002';
  end if;
  if v_shift.status <> 'open' then
    raise exception 'This shift is already closed' using errcode = 'P0001';
  end if;
  return v_shift;
end;
$$;

create or replace function public.record_cash_movement(
  p_shift_id uuid,
  p_type public.cash_movement_type,
  p_amount_minor bigint,
  p_reason text,
  p_operator_token text default null
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_shift public.cash_shifts := private.manageable_shift(p_shift_id, p_operator_token);
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason' using errcode = '22023';
  end if;
  insert into public.cash_movements (tenant_id, shift_id, type, amount_minor, reason, created_by)
  values (v_shift.tenant_id, v_shift.id, p_type, p_amount_minor, trim(p_reason), private.pos_actor(p_operator_token, v_shift.branch_id));
end;
$$;

create or replace function public.close_shift(
  p_shift_id uuid,
  p_counted_cash_minor bigint,
  p_notes text default '',
  p_operator_token text default null
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_shift public.cash_shifts := private.manageable_shift(p_shift_id, p_operator_token);
  v_expected bigint := private.shift_expected_cash(p_shift_id);
begin
  if p_counted_cash_minor is null or p_counted_cash_minor < 0 then
    raise exception 'Enter the cash counted in the drawer' using errcode = '22023';
  end if;
  update public.cash_shifts set
    status = 'closed', closed_at = now(), counted_cash_minor = p_counted_cash_minor,
    expected_cash_minor = v_expected, variance_minor = p_counted_cash_minor - v_expected,
    notes = left(coalesce(p_notes, ''), 500)
  where id = v_shift.id;
  update public.pos_operator_sessions set revoked_at = now()
  where operator_id = v_shift.user_id and branch_id = v_shift.branch_id and revoked_at is null;
  return public.shift_report(v_shift.id);
end;
$$;

-- Z-report / X-report for a shift.
create or replace function public.shift_report(p_shift_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_shift public.cash_shifts;
begin
  select * into v_shift from public.cash_shifts where id = p_shift_id;
  if v_shift.id is null or not (
       v_shift.user_id = auth.uid()
    or private.has_branch_perm(v_shift.tenant_id, v_shift.branch_id, 'shifts.manage')
    or private.has_branch_perm(v_shift.tenant_id, v_shift.branch_id, 'reports.view')
    or private.has_branch_perm(v_shift.tenant_id, v_shift.branch_id, 'pos.use')) then
    raise exception 'Shift not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'shift_id', v_shift.id,
    'status', v_shift.status,
    'cashier', (select full_name from public.profiles where id = v_shift.user_id),
    'opened_at', v_shift.opened_at,
    'closed_at', v_shift.closed_at,
    'opening_float_minor', v_shift.opening_float_minor,
    'by_method', coalesce((
      select jsonb_object_agg(method, jsonb_build_object('count', n, 'base_minor', base, 'tax_minor', tax, 'amount_minor', amt))
      from (select method, count(*) n, sum(base_minor) base, sum(tax_minor) tax, sum(amount_minor) amt
            from public.payments where shift_id = v_shift.id and status = 'completed' group by method) x), '{}'),
    'refunds_minor', coalesce((select sum(amount_minor) from public.refunds where shift_id = v_shift.id), 0),
    'cash_in_minor', coalesce((select sum(amount_minor) from public.cash_movements where shift_id = v_shift.id and type = 'in'), 0),
    'cash_out_minor', coalesce((select sum(amount_minor) from public.cash_movements where shift_id = v_shift.id and type = 'out'), 0),
    'expected_cash_minor', coalesce(v_shift.expected_cash_minor, private.shift_expected_cash(v_shift.id)),
    'counted_cash_minor', v_shift.counted_cash_minor,
    'variance_minor', v_shift.variance_minor,
    'discounts_minor', coalesce((select sum(b.discount_minor) from public.bills b
                                 where b.id in (select distinct bill_id from public.payments where shift_id = v_shift.id)), 0),
    'bills', (select count(distinct bill_id) from public.payments where shift_id = v_shift.id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Public receipt (by unguessable token)
-- ---------------------------------------------------------------------------
create or replace function public.get_receipt(p_receipt_token text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'restaurant', t.name, 'branch', br.name, 'address', br.address, 'phone', br.phone,
    'tax_label', br.tax_label, 'tax_registration', br.tax_registration, 'footer', br.receipt_footer,
    'bill_number', b.bill_number, 'date', b.created_at, 'paid_at', b.paid_at, 'type', b.type, 'status', b.status,
    'table', (select tb.label from public.table_sessions s join public.tables tb on tb.id = s.table_id where s.id = b.session_id),
    'currency', b.currency, 'customer_name', b.customer_name,
    'subtotal_minor', b.subtotal_minor, 'discount_minor', b.discount_minor, 'discount_note', b.discount_note,
    'service_bps', b.service_bps, 'service_minor', b.service_minor, 'base_minor', b.base_minor,
    'tax_minor', b.tax_minor, 'paid_total_minor', b.paid_total_minor,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('name', i.name, 'variant', i.variant_name, 'quantity', i.quantity,
                                          'line_total_minor', i.line_total_minor,
                                          'modifiers', (select coalesce(jsonb_agg(m.name), '[]') from public.order_item_modifiers m where m.order_item_id = i.id))
                       order by o.created_at, i.created_at)
      from public.orders o join public.order_items i on i.order_id = o.id
      where o.bill_id = b.id and o.status <> 'cancelled' and i.status <> 'cancelled'), '[]'),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('method', p.method, 'amount_minor', p.amount_minor, 'tax_minor', p.tax_minor,
                                          'tax_bps', p.tax_bps, 'tendered_minor', p.tendered_minor, 'change_minor', p.change_minor,
                                          'status', p.status) order by p.created_at)
      from public.payments p where p.bill_id = b.id), '[]')
  )
  from public.bills b
  join public.tenants t on t.id = b.tenant_id
  join public.branches br on br.id = b.branch_id
  where b.receipt_token = p_receipt_token;
$$;

-- ---------------------------------------------------------------------------
-- Privileges & RLS
-- ---------------------------------------------------------------------------
revoke all on public.cash_shifts, public.cash_movements, public.bill_counters, public.bills, public.payments,
  public.refunds, public.staff_pins, public.pos_operator_sessions, public.pos_unlock_attempts from anon, authenticated;
grant select on public.cash_shifts, public.cash_movements, public.bills, public.payments, public.refunds to authenticated;

alter table public.cash_shifts enable row level security;
alter table public.cash_movements enable row level security;
alter table public.bill_counters enable row level security;
alter table public.bills enable row level security;
alter table public.payments enable row level security;
alter table public.refunds enable row level security;
alter table public.staff_pins enable row level security;
alter table public.pos_operator_sessions enable row level security;
alter table public.pos_unlock_attempts enable row level security;
-- staff_pins / operator sessions / attempts / counters: no client access at all.

create policy cash_shifts_select on public.cash_shifts for select to authenticated
  using (user_id = (select auth.uid())
         or private.has_branch_perm(tenant_id, branch_id, 'shifts.manage')
         or private.has_branch_perm(tenant_id, branch_id, 'pos.use')
         or private.has_branch_perm(tenant_id, branch_id, 'reports.view'));
create policy cash_movements_select on public.cash_movements for select to authenticated
  using (exists (select 1 from public.cash_shifts s where s.id = shift_id));
create policy bills_select on public.bills for select to authenticated
  using (private.has_branch_perm(tenant_id, branch_id, 'pos.use')
         or private.has_branch_perm(tenant_id, branch_id, 'orders.view')
         or private.has_branch_perm(tenant_id, branch_id, 'reports.view'));
create policy payments_select on public.payments for select to authenticated
  using (exists (select 1 from public.bills b where b.id = bill_id));
create policy refunds_select on public.refunds for select to authenticated
  using (exists (select 1 from public.payments p where p.id = payment_id));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.bills;
  end if;
end;
$$;

revoke execute on function
  public.set_my_pin(uuid, text), public.pos_unlock(uuid, text), public.pos_lock(text),
  public.open_table_bill(uuid, text),
  public.create_counter_order(uuid, public.order_type, jsonb, text, text, text, text),
  public.apply_bill_discount(uuid, bigint, text, text),
  public.take_payment(uuid, public.payment_method, bigint, bigint, text, text, text),
  public.refund_payment(uuid, text, text),
  public.open_shift(uuid, bigint, text),
  public.record_cash_movement(uuid, public.cash_movement_type, bigint, text, text),
  public.close_shift(uuid, bigint, text, text),
  public.shift_report(uuid),
  public.get_receipt(text)
from public, anon;
grant execute on function
  public.set_my_pin(uuid, text), public.pos_unlock(uuid, text), public.pos_lock(text),
  public.open_table_bill(uuid, text),
  public.create_counter_order(uuid, public.order_type, jsonb, text, text, text, text),
  public.apply_bill_discount(uuid, bigint, text, text),
  public.take_payment(uuid, public.payment_method, bigint, bigint, text, text, text),
  public.refund_payment(uuid, text, text),
  public.open_shift(uuid, bigint, text),
  public.record_cash_movement(uuid, public.cash_movement_type, bigint, text, text),
  public.close_shift(uuid, bigint, text, text),
  public.shift_report(uuid)
to authenticated;
grant execute on function public.get_receipt(text) to anon, authenticated;
revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, anon;
