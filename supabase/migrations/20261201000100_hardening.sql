-- =============================================================================
-- Phase 11: hardening.
--
-- * Index every foreign key that had no index on its leading column (found
--   with `supabase db advisors --level info`). Keeps cascades and joins fast
--   as data grows. FKs to auth.users (created_by, …) are left out on purpose:
--   users are almost never deleted.
-- * One SELECT policy per table: "manage" policies were FOR ALL, which also
--   added a second SELECT policy evaluated on every read.
-- =============================================================================

create index if not exists cash_movements_shift_id_fk_idx on public.cash_movements (shift_id, tenant_id);
create index if not exists categories_parent_id_fk_idx on public.categories (parent_id, tenant_id);
create index if not exists delivery_zones_branch_id_fk_idx on public.delivery_zones (branch_id, tenant_id);
create index if not exists guest_requests_session_id_fk_idx on public.guest_requests (session_id, tenant_id);
create index if not exists guest_requests_table_id_fk_idx on public.guest_requests (table_id, tenant_id);
create index if not exists inventory_stock_item_id_fk_idx on public.inventory_stock (item_id, tenant_id);
create index if not exists kitchen_tickets_station_id_fk_idx on public.kitchen_tickets (station_id);
create index if not exists message_outbox_tenant_id_fk_idx on public.message_outbox (tenant_id);
create index if not exists modifier_groups_tenant_id_fk_idx on public.modifier_groups (tenant_id);
create index if not exists notifications_tenant_id_fk_idx on public.notifications (tenant_id);
create index if not exists online_payments_branch_id_fk_idx on public.online_payments (branch_id, tenant_id);
create index if not exists online_payments_payment_id_fk_idx on public.online_payments (payment_id, tenant_id);
create index if not exists order_item_modifiers_modifier_id_fk_idx on public.order_item_modifiers (modifier_id);
create index if not exists order_items_kitchen_station_id_fk_idx on public.order_items (kitchen_station_id);
create index if not exists order_items_product_id_fk_idx on public.order_items (product_id);
create index if not exists order_items_variant_id_fk_idx on public.order_items (variant_id);
create index if not exists orders_table_id_fk_idx on public.orders (table_id, tenant_id);
create index if not exists pos_operator_sessions_branch_id_fk_idx on public.pos_operator_sessions (branch_id);
create index if not exists pos_operator_sessions_tenant_id_fk_idx on public.pos_operator_sessions (tenant_id);
create index if not exists products_category_id_fk_idx on public.products (category_id, tenant_id);
create index if not exists products_kitchen_station_id_fk_idx on public.products (kitchen_station_id, tenant_id);
create index if not exists purchase_items_item_id_fk_idx on public.purchase_items (item_id, tenant_id);
create index if not exists purchases_supplier_id_fk_idx on public.purchases (supplier_id, tenant_id);
create index if not exists recipe_items_item_id_fk_idx on public.recipe_items (item_id, tenant_id);
create index if not exists refunds_payment_id_fk_idx on public.refunds (payment_id, tenant_id);
create index if not exists refunds_shift_id_fk_idx on public.refunds (shift_id, tenant_id);
create index if not exists reservations_table_id_fk_idx on public.reservations (table_id, tenant_id);
create index if not exists role_permissions_permission_key_fk_idx on public.role_permissions (permission_key);
create index if not exists roles_template_key_fk_idx on public.roles (template_key);
create index if not exists subscription_invoices_plan_id_fk_idx on public.subscription_invoices (plan_id);
create index if not exists subscriptions_plan_id_fk_idx on public.subscriptions (plan_id);
create index if not exists tables_area_id_fk_idx on public.tables (area_id, branch_id);
create index if not exists tenant_invites_role_id_fk_idx on public.tenant_invites (role_id, tenant_id);

-- floor_areas / tables: write policies only for writes.
drop policy floor_areas_write on public.floor_areas;
drop policy floor_areas_select on public.floor_areas;
create policy floor_areas_select on public.floor_areas for select to authenticated
  using (private.has_branch_perm(tenant_id, branch_id, 'tables.view')
         or private.has_branch_perm(tenant_id, branch_id, 'tables.manage'));
create policy floor_areas_insert on public.floor_areas for insert to authenticated
  with check (private.has_branch_perm(tenant_id, branch_id, 'tables.manage'));
create policy floor_areas_update on public.floor_areas for update to authenticated
  using (private.has_branch_perm(tenant_id, branch_id, 'tables.manage'))
  with check (private.has_branch_perm(tenant_id, branch_id, 'tables.manage'));
create policy floor_areas_delete on public.floor_areas for delete to authenticated
  using (private.has_branch_perm(tenant_id, branch_id, 'tables.manage'));

drop policy tables_write on public.tables;
drop policy tables_select on public.tables;
create policy tables_select on public.tables for select to authenticated
  using (private.has_branch_perm(tenant_id, branch_id, 'tables.view')
         or private.has_branch_perm(tenant_id, branch_id, 'orders.view')
         or private.has_branch_perm(tenant_id, branch_id, 'tables.manage'));
create policy tables_insert on public.tables for insert to authenticated
  with check (private.has_branch_perm(tenant_id, branch_id, 'tables.manage'));
create policy tables_update on public.tables for update to authenticated
  using (private.has_branch_perm(tenant_id, branch_id, 'tables.manage'))
  with check (private.has_branch_perm(tenant_id, branch_id, 'tables.manage'));
create policy tables_delete on public.tables for delete to authenticated
  using (private.has_branch_perm(tenant_id, branch_id, 'tables.manage'));

-- profiles_select already includes platform admins.
drop policy profiles_admin_select on public.profiles;

-- Staff-only functions that were still executable by anonymous visitors
-- (both checked permissions inside, so calls were refused, but they should
-- not be callable at all). New functions are no longer executable by anon
-- unless granted explicitly; the schema guard test lists the public ones.
revoke execute on function public.save_integration(uuid, text, boolean, text, jsonb, jsonb) from public, anon;
revoke execute on function public.retry_fiscal_invoice(uuid) from public, anon;
grant execute on function public.save_integration(uuid, text, boolean, text, jsonb, jsonb),
  public.retry_fiscal_invoice(uuid) to authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
