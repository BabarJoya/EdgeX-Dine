-- =============================================================================
-- Phase 11: deleting a restaurant and all its data (account closure).
--
-- Some foreign keys inside a restaurant deliberately block deletes (a
-- category with dishes, a role with staff, a shift with payments, an item
-- with purchases), which also blocked the cascade from `tenants`. Deleting
-- children first, in a safe order, makes closure possible without weakening
-- those guards. Only platform admins can do it, only for a suspended
-- restaurant, with its slug typed as confirmation. The audit log keeps a
-- record (audit_logs has no foreign key on purpose).
-- =============================================================================

create or replace function private.purge_tenant(p_tenant_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.refunds where tenant_id = p_tenant_id;
  delete from public.payments where tenant_id = p_tenant_id;
  delete from public.purchase_items where tenant_id = p_tenant_id;
  delete from public.recipe_items where tenant_id = p_tenant_id;
  delete from public.products where tenant_id = p_tenant_id;
  -- Sub-categories before their parents.
  delete from public.categories where tenant_id = p_tenant_id and parent_id is not null;
  delete from public.categories where tenant_id = p_tenant_id;
  delete from public.tenant_members where tenant_id = p_tenant_id;
  delete from public.tenants where id = p_tenant_id;
end;
$$;

create or replace function public.admin_delete_tenant(p_tenant_id uuid, p_confirm_slug text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  t public.tenants;
begin
  perform private.assert_platform_admin();
  select * into t from public.tenants where id = p_tenant_id;
  if t.id is null then
    raise exception 'Restaurant not found' using errcode = 'P0002';
  end if;
  if t.status <> 'suspended' then
    raise exception 'Suspend the restaurant before deleting it' using errcode = 'P0001';
  end if;
  if lower(coalesce(p_confirm_slug, '')) <> t.slug then
    raise exception 'Type the restaurant''s web address (%) to confirm', t.slug using errcode = '22023';
  end if;
  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, data)
  values (t.id, auth.uid(), 'platform_delete', 'tenants', t.id::text,
          jsonb_build_object('name', t.name, 'slug', t.slug,
                             'orders', (select count(*) from public.orders where tenant_id = t.id),
                             'bills', (select count(*) from public.bills where tenant_id = t.id)));
  perform private.purge_tenant(t.id);
end;
$$;
revoke execute on function public.admin_delete_tenant(uuid, text) from public, anon;
grant execute on function public.admin_delete_tenant(uuid, text) to authenticated;
