-- =============================================================================
-- Reservations (pgTAP): slots and capacity, guest booking and cancelling,
-- staff workflow, permissions, WhatsApp confirmation.
--
-- Clifton takes bookings 12:00–23:00, 30-minute slots, 90-minute sittings,
-- 10 covers per slot, party of up to 8.
-- =============================================================================
begin;
select plan(22);
delete from public.message_outbox;

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-00000000a111', 'ali@karachigrill.pk', '{"full_name":"Ali"}',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c333', 'wasim@example.com',   '{"full_name":"Wasim"}', 'authenticated', 'authenticated');

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
create function tests.day() returns date language sql as $$ select (now() at time zone 'Asia/Karachi')::date + 1 $$;
create function tests.free(t text, party int) returns boolean language sql as $$
  select (s ->> 'available')::boolean from jsonb_array_elements(public.reservation_slots(tests.id('b'), tests.day(), party)) s
  where s ->> 'time' = t $$;
create function tests.book(t text, party int, phone text default '0300 1234567') returns text language sql as $$
  select public.request_reservation(tests.id('b'), tests.day(), t, party, 'Hamza', phone, 'Window seat') ->> 'token' $$;
grant execute on all functions in schema tests to authenticated, anon;

select tests.act_as('00000000-0000-0000-0000-00000000a111');
insert into tests.ids values ('t', public.create_tenant('Karachi Grill', 'karachi-grill', 'Clifton'));
insert into tests.ids select 'b', id from public.branches where tenant_id = tests.id('t');
insert into public.tables (tenant_id, branch_id, label) values (tests.id('t'), tests.id('b'), 'T5');
insert into tests.ids select 'tbl', id from public.tables where label = 'T5';
insert into tests.ids values ('inv_w', public.invite_member(tests.id('t'), 'wasim@example.com', (select id from public.roles where template_key = 'waiter'), true));
select public.save_integration(tests.id('t'), 'whatsapp', true, 'live', '{"phone_number_id":"111"}', '{"access_token":"tok"}');
select tests.act_as('00000000-0000-0000-0000-00000000c333');
select public.accept_invite(tests.v('inv_w'));

-- Off until the branch turns it on ------------------------------------------------------
select tests.act_as_anon();
select is(jsonb_array_length(public.get_booking_info('karachi-grill') -> 'branches'), 0, 'no branch takes bookings by default');
select tests.act_as('00000000-0000-0000-0000-00000000a111');
update public.branches set reservations_enabled = true, res_covers_per_slot = 10, res_max_party = 8 where id = tests.id('b');

select tests.act_as_anon();
select is(jsonb_array_length(public.get_booking_info('karachi-grill') -> 'branches'), 1, 'the branch is bookable once enabled');
select is(jsonb_array_length(public.reservation_slots(tests.id('b'), tests.day(), 2)), 22, '12:00 to 22:30 in 30-minute slots');
select is(jsonb_array_length(public.reservation_slots(tests.id('b'), tests.day(), 9)), 0, 'parties above the maximum get no slots');

-- Capacity ------------------------------------------------------------------------------
insert into tests.ids values ('r1', tests.book('19:00', 6));
select is((public.get_reservation(tests.v('r1')) ->> 'status'), 'requested', 'online bookings wait for the restaurant');
select is(tests.free('19:00', 4), true, '6 + 4 covers fit in 10');
select is(tests.free('19:00', 6), false, '6 + 6 do not');
select is(tests.free('18:00', 6), false, 'a 90-minute sitting from 18:00 overlaps 19:00');
select is(tests.free('17:30', 6), true, '17:30–19:00 does not');
select throws_ok($$ select tests.book('19:00', 6, '03211112223') $$, 'P0001', 'That time is fully booked. Please choose another.', 'full slots are refused');
select throws_ok($$ select tests.book('19:10', 2, '03211112223') $$, '22023', null, 'only listed times can be booked');
select throws_ok($$ select public.request_reservation(tests.id('b'), tests.day(), '13:00', 2, 'X', '12') $$, '22023', null, 'a valid phone number is needed');
select tests.book('13:00', 2);
select tests.book('14:00', 2);
select throws_ok($$ select tests.book('15:00', 2) $$, 'P0001', null, 'at most three upcoming bookings per phone number');

-- Guest cancels; capacity comes back -----------------------------------------------------------
select lives_ok($$ select public.cancel_my_reservation(tests.v('r1')) $$, 'a guest can cancel with the link');
select is(tests.free('19:00', 6), true, 'which frees the slot');

-- Staff ----------------------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000a111');
insert into tests.ids values ('r2', public.save_reservation(jsonb_build_object('branch_id', tests.id('b'), 'date', tests.day(),
  'time', '20:00', 'name', 'Sana', 'phone', '0321 7654321', 'party_size', 4, 'table_id', tests.id('tbl'))));
select is((select status from public.reservations where id = tests.id('r2')), 'confirmed', 'bookings taken by staff are confirmed');
select is((select row(kind, to_phone, (params ->> 'party_size')::int)::text from public.message_outbox),
  row('reservation', '923217654321', 4)::text, 'a confirmed booking queues a WhatsApp confirmation');
select throws_ok(format($$ select public.set_reservation_status(%L, 'completed') $$, tests.id('r2')), 'P0001', null,
  'a booking is seated before it is completed');
select public.set_reservation_status(tests.id('r2'), 'seated');
select is((public.table_reservations(tests.id('b')) -> 0 ->> 'name'), 'Sana', 'the seated booking shows on its table');

select tests.act_as('00000000-0000-0000-0000-00000000c333');
select is((select count(*)::int from public.reservations), 4, 'waiters can see bookings');
select throws_ok(format($$ select public.set_reservation_status(%L, 'completed') $$, tests.id('r2')), 'P0002', null,
  'but not change them');
select ok((select bool_or(rp.permission_key = 'reservations.manage') from public.role_permissions rp
           join public.roles r on r.id = rp.role_id where r.template_key = 'cashier' and r.tenant_id = tests.id('t')),
  'cashiers can manage bookings');

select * from finish();
rollback;
