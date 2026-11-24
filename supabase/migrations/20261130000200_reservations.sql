-- =============================================================================
-- Phase 10b: reservations.
--
-- * Per-branch booking rules (hours, slot length, party size, covers per
--   slot, auto-confirm). Times are the restaurant's local time.
-- * Guests book through public functions by restaurant slug and manage the
--   booking with an unguessable token. Staff use reservations.manage.
-- * A confirmed booking with a phone number queues a WhatsApp confirmation.
-- =============================================================================

-- Permission ------------------------------------------------------------------
insert into public.permissions (key, module, label, description, sort_order) values
  ('reservations.manage', 'Tables', 'Manage reservations', 'Confirm, seat and cancel bookings; take bookings by phone.', 32);
update public.role_templates set permissions = permissions || array['reservations.manage']
where key in ('branch_manager', 'restaurant_manager', 'cashier');
insert into public.role_permissions (tenant_id, role_id, permission_key)
select r.tenant_id, r.id, 'reservations.manage' from public.roles r
where r.template_key in ('branch_manager', 'restaurant_manager', 'cashier')
on conflict do nothing;

-- Branch rules -----------------------------------------------------------------
alter table public.branches
  add column reservations_enabled boolean not null default false,
  add column res_open time not null default '12:00',
  add column res_close time not null default '23:00',
  add column res_slot_minutes int not null default 30 check (res_slot_minutes in (15, 30, 60)),
  add column res_duration_minutes int not null default 90 check (res_duration_minutes between 30 and 300),
  add column res_max_party int not null default 12 check (res_max_party between 1 and 100),
  add column res_covers_per_slot int not null default 40 check (res_covers_per_slot between 1 and 1000),
  add column res_days_ahead int not null default 30 check (res_days_ahead between 1 and 180),
  add column res_auto_confirm boolean not null default false;
grant update (reservations_enabled, res_open, res_close, res_slot_minutes, res_duration_minutes, res_max_party,
              res_covers_per_slot, res_days_ahead, res_auto_confirm) on public.branches to authenticated;

-- Bookings ---------------------------------------------------------------------
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  table_id uuid,
  name text not null check (char_length(name) between 1 and 80),
  phone text check (char_length(phone) <= 32),
  party_size int not null check (party_size between 1 and 100),
  starts_at timestamptz not null,
  duration_minutes int not null default 90 check (duration_minutes between 15 and 600),
  status text not null default 'requested'
    check (status in ('requested', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show')),
  source text not null default 'online' check (source in ('online', 'staff')),
  notes text not null default '' check (char_length(notes) <= 300),
  cancel_reason text check (char_length(cancel_reason) <= 200),
  token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (branch_id, tenant_id) references public.branches (id, tenant_id) on delete cascade,
  foreign key (table_id, tenant_id) references public.tables (id, tenant_id) on delete set null (table_id)
);
create index reservations_branch_start_idx on public.reservations (branch_id, starts_at);
create trigger reservations_updated_at before update on public.reservations
  for each row execute function private.set_updated_at();
create trigger audit_reservations after insert or update of status, table_id, starts_at, party_size or delete on public.reservations
  for each row execute function private.audit_row();

alter table public.reservations enable row level security;
revoke all on public.reservations from anon, authenticated;
grant select on public.reservations to authenticated;
create policy reservations_select on public.reservations for select to authenticated
  using (private.has_branch_perm(tenant_id, branch_id, 'tables.view')
         or private.has_branch_perm(tenant_id, branch_id, 'reservations.manage'));

-- Helpers ------------------------------------------------------------------------
create or replace function private.branch_tz(p_branch_id uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select t.timezone from public.branches b join public.tenants t on t.id = b.tenant_id where b.id = p_branch_id;
$$;

-- Covers already booked whose sitting overlaps [p_at, p_at + duration).
create or replace function private.booked_covers(p_branch_id uuid, p_at timestamptz, p_duration int, p_except uuid default null)
returns int
language sql stable security definer
set search_path = ''
as $$
  select coalesce(sum(party_size), 0)::int from public.reservations
  where branch_id = p_branch_id and status in ('requested', 'confirmed', 'seated')
    and (p_except is null or id <> p_except)
    and starts_at < p_at + make_interval(mins => p_duration)
    and starts_at + make_interval(mins => duration_minutes) > p_at;
$$;

-- Public: what a guest needs to book (branches that take reservations).
create or replace function public.get_booking_info(p_slug text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'restaurant', jsonb_build_object('name', t.name, 'slug', t.slug, 'logo_url', t.logo_url,
                                     'brand_color', t.brand_color, 'timezone', t.timezone),
    'today', (now() at time zone t.timezone)::date,
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'address', b.address, 'phone', b.phone,
                                          'max_party', b.res_max_party, 'days_ahead', b.res_days_ahead)
                       order by b.name)
      from public.branches b
      where b.tenant_id = t.id and b.is_active and b.reservations_enabled), '[]'))
  from public.tenants t
  where t.slug = lower(p_slug) and private.tenant_access(t.id) = 'active';
$$;

-- Public: open slots for a branch, date and party size.
create or replace function public.reservation_slots(p_branch_id uuid, p_date date, p_party int)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  b public.branches;
  v_tz text := private.branch_tz(p_branch_id);
  v_today date;
  v_t time;
  v_at timestamptz;
  v_out jsonb := '[]'::jsonb;
  v_close timestamptz;
begin
  select * into b from public.branches where id = p_branch_id and reservations_enabled and is_active;
  if b.id is null or private.tenant_access(b.tenant_id) <> 'active' then
    raise exception 'This branch does not take reservations' using errcode = 'P0002';
  end if;
  v_today := (now() at time zone v_tz)::date;
  if p_date < v_today or p_date > v_today + b.res_days_ahead or coalesce(p_party, 0) not between 1 and b.res_max_party then
    return '[]'::jsonb;
  end if;
  -- Closing past midnight (e.g. 12:00–01:00) runs into the next day.
  v_close := ((p_date + case when b.res_close <= b.res_open then 1 else 0 end) + b.res_close) at time zone v_tz;
  v_t := b.res_open;
  v_at := (p_date + v_t) at time zone v_tz;
  -- Last seating one slot before closing.
  while v_at + make_interval(mins => b.res_slot_minutes) <= v_close loop
    if v_at > now() + interval '30 minutes' then
      v_out := v_out || jsonb_build_object(
        'time', to_char(v_at at time zone v_tz, 'HH24:MI'),
        'available', private.booked_covers(b.id, v_at, b.res_duration_minutes) + p_party <= b.res_covers_per_slot);
    end if;
    v_at := v_at + make_interval(mins => b.res_slot_minutes);
  end loop;
  return v_out;
end;
$$;

-- Public: request a booking. p_time is local 'HH:MI' on p_date.
create or replace function public.request_reservation(
  p_branch_id uuid, p_date date, p_time text, p_party int, p_name text, p_phone text, p_notes text default '')
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  b public.branches;
  v_slot jsonb;
  v_at timestamptz;
  v_phone text := private.wa_number(p_phone);
  v_r public.reservations;
begin
  select * into b from public.branches where id = p_branch_id;
  select s into v_slot from jsonb_array_elements(public.reservation_slots(p_branch_id, p_date, p_party)) s
  where s ->> 'time' = p_time;
  if v_slot is null then
    raise exception 'Please choose one of the available times' using errcode = '22023';
  end if;
  if not (v_slot ->> 'available')::boolean then
    raise exception 'That time is fully booked. Please choose another.' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Please enter your name' using errcode = '22023';
  end if;
  if v_phone is null then
    raise exception 'Please enter a valid mobile number' using errcode = '22023';
  end if;
  -- Abuse limit: three upcoming bookings per number per restaurant.
  if (select count(*) from public.reservations r
      where r.tenant_id = b.tenant_id and private.wa_number(r.phone) = v_phone
        and r.status in ('requested', 'confirmed') and r.starts_at > now()) >= 3 then
    raise exception 'You already have three upcoming bookings. Please call the restaurant.' using errcode = 'P0001';
  end if;

  v_at := (p_date + p_time::time) at time zone private.branch_tz(b.id);
  insert into public.reservations (tenant_id, branch_id, name, phone, party_size, starts_at, duration_minutes,
                                   status, source, notes)
  values (b.tenant_id, b.id, trim(p_name), trim(p_phone), p_party, v_at, b.res_duration_minutes,
          case when b.res_auto_confirm then 'confirmed' else 'requested' end, 'online', left(coalesce(p_notes, ''), 300))
  returning * into v_r;
  return jsonb_build_object('token', v_r.token, 'status', v_r.status);
end;
$$;

-- Public: a guest's own booking.
create or replace function public.get_reservation(p_token text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'restaurant', t.name, 'slug', t.slug, 'brand_color', t.brand_color, 'branch', b.name,
    'address', b.address, 'branch_phone', b.phone,
    'name', r.name, 'party_size', r.party_size, 'status', r.status, 'notes', r.notes,
    'date', to_char(r.starts_at at time zone t.timezone, 'YYYY-MM-DD'),
    'time', to_char(r.starts_at at time zone t.timezone, 'HH24:MI'),
    'can_cancel', r.status in ('requested', 'confirmed') and r.starts_at > now())
  from public.reservations r
  join public.branches b on b.id = r.branch_id
  join public.tenants t on t.id = r.tenant_id
  where r.token = p_token;
$$;

create or replace function public.cancel_my_reservation(p_token text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.reservations set status = 'cancelled', cancel_reason = 'Cancelled by guest'
  where token = p_token and status in ('requested', 'confirmed') and starts_at > now();
  if not found then
    raise exception 'This booking can no longer be cancelled online. Please call the restaurant.' using errcode = 'P0001';
  end if;
end;
$$;

grant execute on function public.get_booking_info(text), public.reservation_slots(uuid, date, int),
  public.request_reservation(uuid, date, text, int, text, text, text), public.get_reservation(text),
  public.cancel_my_reservation(text) to anon, authenticated;

-- Staff ------------------------------------------------------------------------------
-- Create or edit (bookings taken by phone may exceed the online capacity).
create or replace function public.save_reservation(p jsonb)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_branch uuid := (p ->> 'branch_id')::uuid;
  b public.branches;
  v_at timestamptz;
  v_table uuid := nullif(p ->> 'table_id', '')::uuid;
begin
  select * into b from public.branches where id = v_branch;
  if b.id is null or not private.has_branch_perm(b.tenant_id, b.id, 'reservations.manage') then
    raise exception 'You do not have permission to manage reservations' using errcode = '42501';
  end if;
  if v_table is not null and not exists (select 1 from public.tables where id = v_table and branch_id = b.id) then
    raise exception 'Table not found in this branch' using errcode = '22023';
  end if;
  v_at := ((p ->> 'date')::date + (p ->> 'time')::time) at time zone private.branch_tz(b.id);
  if v_id is null then
    insert into public.reservations (tenant_id, branch_id, table_id, name, phone, party_size, starts_at,
                                     duration_minutes, status, source, notes, created_by)
    values (b.tenant_id, b.id, v_table, trim(p ->> 'name'), nullif(trim(p ->> 'phone'), ''), (p ->> 'party_size')::int,
            v_at, coalesce((p ->> 'duration_minutes')::int, b.res_duration_minutes), 'confirmed', 'staff',
            left(coalesce(p ->> 'notes', ''), 300), auth.uid())
    returning id into v_id;
  else
    update public.reservations set table_id = v_table, name = trim(p ->> 'name'), phone = nullif(trim(p ->> 'phone'), ''),
      party_size = (p ->> 'party_size')::int, starts_at = v_at,
      duration_minutes = coalesce((p ->> 'duration_minutes')::int, duration_minutes),
      notes = left(coalesce(p ->> 'notes', ''), 300)
    where id = v_id and branch_id = b.id;
    if not found then
      raise exception 'Reservation not found' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.set_reservation_status(p_id uuid, p_status text, p_reason text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  r public.reservations;
begin
  select * into r from public.reservations where id = p_id for update;
  if r.id is null or not private.has_branch_perm(r.tenant_id, r.branch_id, 'reservations.manage') then
    raise exception 'Reservation not found' using errcode = 'P0002';
  end if;
  if not (
    r.status = 'requested' and p_status in ('confirmed', 'cancelled')
    or r.status = 'confirmed' and p_status in ('seated', 'cancelled', 'no_show')
    or r.status = 'seated' and p_status = 'completed'
  ) then
    raise exception 'A % booking cannot be marked %', r.status, p_status using errcode = 'P0001';
  end if;
  update public.reservations set status = p_status,
    cancel_reason = case when p_status = 'cancelled' then left(nullif(trim(p_reason), ''), 200) else cancel_reason end
  where id = r.id;
end;
$$;

-- Floor plan: today's upcoming bookings per table (next 3 hours, or seated).
create or replace function public.table_reservations(p_branch_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('table_id', r.table_id, 'name', r.name, 'party_size', r.party_size,
                                               'time', to_char(r.starts_at at time zone private.branch_tz(r.branch_id), 'HH24:MI'),
                                               'status', r.status) order by r.starts_at), '[]')
  from public.reservations r
  where r.branch_id = p_branch_id and r.table_id is not null
    and (r.status = 'confirmed' and r.starts_at between now() - interval '30 minutes' and now() + interval '3 hours'
         or r.status = 'seated')
    and (private.has_branch_perm(r.tenant_id, r.branch_id, 'tables.view')
         or private.has_branch_perm(r.tenant_id, r.branch_id, 'reservations.manage'));
$$;

revoke execute on function public.save_reservation(jsonb), public.set_reservation_status(uuid, text, text),
  public.table_reservations(uuid) from public, anon;
grant execute on function public.save_reservation(jsonb), public.set_reservation_status(uuid, text, text),
  public.table_reservations(uuid) to authenticated;

-- WhatsApp confirmation ----------------------------------------------------------------
alter table public.message_outbox drop constraint message_outbox_kind_check;
alter table public.message_outbox add constraint message_outbox_kind_check
  check (kind in ('receipt', 'order_ready', 'fiscal', 'reservation'));

create or replace function private.queue_reservation_message()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_to text := private.wa_number(new.phone);
  v_tz text := private.branch_tz(new.branch_id);
begin
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') and v_to is not null
     and new.starts_at > now() and private.whatsapp_on(new.tenant_id, 'send_reservations') then
    insert into public.message_outbox (tenant_id, branch_id, kind, ref_id, to_phone, params)
    values (new.tenant_id, new.branch_id, 'reservation', new.id, v_to, jsonb_build_object(
      'restaurant', (select name from public.tenants where id = new.tenant_id),
      'when', to_char(new.starts_at at time zone v_tz, 'Dy DD Mon, HH12:MI AM'),
      'party_size', new.party_size, 'token', new.token))
    on conflict (kind, ref_id) do nothing;
  end if;
  return null;
end;
$$;
create trigger reservations_queue_message after insert or update of status on public.reservations
  for each row execute function private.queue_reservation_message();
