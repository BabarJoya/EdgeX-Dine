-- =============================================================================
-- Kitchen tickets, waiter ordering, assignment, transfer and merge (pgTAP).
--
-- Karachi Grill (Ali): Clifton (T1, T2, T3) and DHA (D1).
-- Stations: Grill (Tikka), Drinks (Lassi); Kheer has no station.
-- Kamal: Kitchen Staff at Clifton.  Wasim: Waiter at Clifton.
-- Sara: owner of another restaurant.
-- =============================================================================
begin;
select plan(39);

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-00000000a111', 'ali@karachigrill.pk', '{}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000b222', 'sara@lahorebites.pk', '{}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c333', 'wasim@example.com',   '{}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f666', 'kamal@example.com',   '{}', 'authenticated', 'authenticated');

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
create function tests.item(p text, qty int default 1) returns jsonb language sql as $$
  select jsonb_build_object('product_id', tests.id(p), 'quantity', qty)
$$;
-- Ticket of an order at a station ('none' = no station).
create function tests.ticket(o text, st text) returns uuid language sql as $$
  select id from public.kitchen_tickets
  where order_id = tests.id(o) and station_key = coalesce(tests.id(st), '00000000-0000-0000-0000-000000000000')
$$;
grant execute on all functions in schema tests to authenticated, anon;

-- Fixtures --------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000b222');
insert into tests.ids values ('t_sara', public.create_tenant('Lahore Bites', 'lahore-bites', 'Gulberg'));

select tests.act_as('00000000-0000-0000-0000-00000000a111');
insert into tests.ids values ('t_ali', public.create_tenant('Karachi Grill', 'karachi-grill', 'Clifton'));
insert into public.branches (tenant_id, name) values (tests.id('t_ali'), 'DHA');
insert into tests.ids select 'b_clifton', id from public.branches where name = 'Clifton';
insert into tests.ids select 'b_dha', id from public.branches where name = 'DHA';
insert into public.tables (tenant_id, branch_id, label)
select tests.id('t_ali'), tests.id('b_clifton'), l from unnest(array['T1', 'T2', 'T3']) l;
insert into public.tables (tenant_id, branch_id, label) values (tests.id('t_ali'), tests.id('b_dha'), 'D1');
insert into tests.ids select 'tb_' || lower(label), id from public.tables;
insert into tests.ids select 'tok_' || lower(label), qr_token from public.tables;

with s as (insert into public.kitchen_stations (tenant_id, name) values (tests.id('t_ali'), 'Grill') returning id)
insert into tests.ids select 'st_grill', id from s;
with s as (insert into public.kitchen_stations (tenant_id, name) values (tests.id('t_ali'), 'Drinks') returning id)
insert into tests.ids select 'st_drinks', id from s;
with c as (insert into public.categories (tenant_id, name) values (tests.id('t_ali'), 'Main') returning id)
insert into tests.ids select 'cat', id from c;
insert into tests.ids values ('p_tikka', public.save_product(jsonb_build_object('tenant_id', tests.id('t_ali'),
  'category_id', tests.id('cat'), 'name', 'Tikka', 'price_minor', 50000, 'kitchen_station_id', tests.id('st_grill'))));
insert into tests.ids values ('p_lassi', public.save_product(jsonb_build_object('tenant_id', tests.id('t_ali'),
  'category_id', tests.id('cat'), 'name', 'Lassi', 'price_minor', 20000, 'kitchen_station_id', tests.id('st_drinks'))));
insert into tests.ids values ('p_kheer', public.save_product(jsonb_build_object('tenant_id', tests.id('t_ali'),
  'category_id', tests.id('cat'), 'name', 'Kheer', 'price_minor', 30000)));

insert into tests.ids values ('inv_w', public.invite_member(tests.id('t_ali'), 'wasim@example.com',
  (select id from public.roles where template_key = 'waiter'), false, array[tests.id('b_clifton')]));
insert into tests.ids values ('inv_k', public.invite_member(tests.id('t_ali'), 'kamal@example.com',
  (select id from public.roles where template_key = 'kitchen'), false, array[tests.id('b_clifton')]));
select tests.act_as('00000000-0000-0000-0000-00000000c333');
select public.accept_invite(tests.v('inv_w'));
select tests.act_as('00000000-0000-0000-0000-00000000f666');
select public.accept_invite(tests.v('inv_k'));

-- Guest order with items for two stations plus one unassigned ----------------
select tests.act_as_anon();
with r as (select public.place_guest_order(tests.v('tok_t1'),
  jsonb_build_array(tests.item('p_tikka', 2), tests.item('p_lassi'), tests.item('p_kheer'))) j)
insert into tests.ids select 'o1', j ->> 'order_id' from r;
insert into tests.ids select 'guest1', public.place_guest_order(tests.v('tok_t1'), jsonb_build_array(tests.item('p_lassi'))) ->> 'guest_token';
select throws_ok($$ select count(*) from public.kitchen_tickets $$, '42501', null, 'guests cannot read kitchen tickets');

-- Kitchen ---------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000f666');
select is((select count(*)::int from public.kitchen_tickets where order_id = tests.id('o1')), 3,
  'order is split into one ticket per station (incl. unassigned)');
select is((select count(*)::int from public.kitchen_tickets where station_id = tests.id('st_drinks')), 2,
  'drinks station gets the drinks from both orders');
select lives_ok($$ select public.update_ticket_status(tests.ticket('o1', 'st_grill'), 'accepted') $$, 'kitchen accepts the grill ticket');
select is((select status::text from public.orders where id = tests.id('o1')), 'accepted', 'order follows: accepted');
select public.update_ticket_status(tests.ticket('o1', 'st_grill'), 'ready');
select is((select status::text from public.orders where id = tests.id('o1')), 'preparing',
  'one station ready, others not: order is preparing');
select public.update_ticket_status(tests.ticket('o1', 'st_drinks'), 'ready');
select public.update_ticket_status(tests.ticket('o1', 'none'), 'ready');
select is((select status::text from public.orders where id = tests.id('o1')), 'ready', 'all stations ready: order is ready');
select ok((select ready_at is not null from public.orders where id = tests.id('o1')), 'ready time recorded');

select public.update_ticket_status(tests.ticket('o1', 'st_drinks'), 'preparing');
select is((select status::text from public.orders where id = tests.id('o1')), 'preparing', 'recalling a ticket moves the order back');
select throws_ok($$ select public.update_ticket_status(tests.ticket('o1', 'st_drinks'), 'accepted') $$,
  'P0001', 'Tickets can only move forward', 'tickets cannot go backwards (except recall)');
select throws_ok($$ select public.update_ticket_status(tests.ticket('o1', 'st_drinks'), 'served') $$,
  '22023', null, 'serving happens on the order, not the ticket');
select throws_ok($$ select public.update_order_status(tests.id('o1'), 'cancelled', 'burnt') $$,
  '42501', null, 'kitchen staff cannot cancel orders');
select throws_ok($$ select public.place_staff_order(tests.id('tb_t2'), jsonb_build_array(tests.item('p_lassi'))) $$,
  'P0002', null, 'kitchen staff cannot take orders');
select public.update_ticket_status(tests.ticket('o1', 'st_drinks'), 'ready');

-- Waiter ----------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000c333');
select is((select count(*)::int from public.kitchen_tickets), 4, 'waiter can see tickets (to know what is ready)');
select throws_ok($$ select public.update_ticket_status(tests.ticket('o1', 'st_grill'), 'preparing') $$,
  '42501', null, 'waiters cannot change kitchen tickets');
select public.update_order_status(tests.id('o1'), 'served');
select is((select count(*)::int from public.kitchen_tickets where order_id = tests.id('o1') and status = 'served'), 3,
  'serving the order closes its tickets');

select public.update_order_status((select id from public.orders where order_number = 2), 'accepted');
select is((select status::text from public.kitchen_tickets where order_id = (select id from public.orders where order_number = 2)),
  'accepted', 'accepting an order accepts its tickets');
select lives_ok($$ select public.set_ticket_priority((select id from public.kitchen_tickets where status = 'accepted'), true) $$,
  'waiter can flag a ticket as priority');

with r as (select public.place_staff_order(tests.id('tb_t2'), jsonb_build_array(tests.item('p_tikka'), tests.item('p_lassi')), 'No ice') j)
insert into tests.ids select 'o_w', j ->> 'order_id' from r;
select is((select source::text from public.orders where id = tests.id('o_w')), 'waiter', 'waiter order is marked as such');
select is((select created_by from public.orders where id = tests.id('o_w')), '00000000-0000-0000-0000-00000000c333'::uuid, 'and records who took it');
select is((select total_minor from public.orders where id = tests.id('o_w')), 70000::bigint, 'priced by the database');
select is((select waiter_id from public.tables where id = tests.id('tb_t2')), '00000000-0000-0000-0000-00000000c333'::uuid,
  'taking an order on a free table assigns the waiter');
select is((select count(*)::int from public.kitchen_tickets where order_id = tests.id('o_w')), 2, 'waiter order reaches the kitchen');
select throws_ok($$ select public.place_staff_order(tests.id('tb_d1'), jsonb_build_array(tests.item('p_lassi'))) $$,
  'P0002', null, 'waiter cannot order at another branch');
select throws_ok($$ update public.tables set waiter_id = auth.uid() $$, '42501', null, 'assignment only through the function');

select lives_ok($$ select public.assign_table_waiter(tests.id('tb_t1'), auth.uid()) $$, 'waiter claims a free table');
select tests.act_as('00000000-0000-0000-0000-00000000a111');
select public.assign_table_waiter(tests.id('tb_t3'), '00000000-0000-0000-0000-00000000f666');
select is((select waiter_id from public.tables where id = tests.id('tb_t3')), '00000000-0000-0000-0000-00000000f666'::uuid, 'manager assigns a table');
select throws_ok($$ select public.assign_table_waiter(tests.id('tb_t3'), '00000000-0000-0000-0000-00000000b222') $$,
  '22023', null, 'cannot assign someone from another restaurant');
select public.assign_table_waiter(tests.id('tb_t3'), null);
select tests.act_as('00000000-0000-0000-0000-00000000c333');
select throws_ok($$ select public.assign_table_waiter(tests.id('tb_t2'), '00000000-0000-0000-0000-00000000f666') $$,
  '42501', null, 'waiters cannot assign tables to others');

-- Transfer & merge ------------------------------------------------------------
insert into tests.ids select 'sess_t1', id from public.table_sessions where table_id = tests.id('tb_t1') and status = 'open';
insert into tests.ids select 'sess_t2', id from public.table_sessions where table_id = tests.id('tb_t2') and status = 'open';
select throws_ok($$ select public.transfer_table_session(tests.id('sess_t1'), tests.id('tb_t2')) $$,
  'P0001', null, 'cannot move guests onto an occupied table');
select throws_ok($$ select public.transfer_table_session(tests.id('sess_t1'), tests.id('tb_d1')) $$,
  '22023', null, 'cannot move guests to another branch');
select public.transfer_table_session(tests.id('sess_t1'), tests.id('tb_t3'));
select is((select count(*)::int from public.orders where table_id = tests.id('tb_t3')), 2, 'orders move with the guests');
select is((select status::text from public.tables where id = tests.id('tb_t1')), 'cleaning', 'old table needs cleaning');
select is((select status::text from public.tables where id = tests.id('tb_t3')), 'occupied', 'new table is occupied');

select tests.act_as_anon();
select is(public.get_guest_session(tests.v('guest1')) ->> 'table', 'T3', 'guests'' phones follow them to the new table');

select tests.act_as('00000000-0000-0000-0000-00000000b222');
select throws_ok($$ select public.merge_table_sessions(tests.id('sess_t1'), tests.id('sess_t2')) $$,
  'P0002', null, 'another restaurant cannot merge these tables');

select tests.act_as('00000000-0000-0000-0000-00000000c333');
select public.merge_table_sessions(tests.id('sess_t1'), tests.id('sess_t2'));
select is((select count(*)::int from public.orders where session_id = tests.id('sess_t2')), 3, 'merged sitting has all orders');
select is((select status::text from public.table_sessions where id = tests.id('sess_t1')), 'closed', 'merged-away sitting is closed');
select is((select status::text from public.tables where id = tests.id('tb_t3')), 'cleaning', 'merged-away table needs cleaning');

select * from finish();
rollback;
