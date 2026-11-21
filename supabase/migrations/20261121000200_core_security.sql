-- =============================================================================
-- Phase 1 · Access helpers, Row Level Security, audit and plan-limit triggers
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Access helpers (SECURITY DEFINER so policies can call them without
-- recursing into RLS on the membership tables). `(select auth.uid())` lets
-- Postgres evaluate the uid once per statement instead of once per row.
-- ---------------------------------------------------------------------------
create or replace function private.is_platform_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_platform_admin from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

-- Active member of the tenant (suspended tenants still count, so members can
-- see why they are locked out; permissions below are what get blocked).
create or replace function private.is_member(p_tenant_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_members m
    where m.tenant_id = p_tenant_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create or replace function private.has_perm(p_tenant_id uuid, p_perm text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_members m
    join public.tenants t on t.id = m.tenant_id and t.status = 'active'
    join public.roles r on r.id = m.role_id
    where m.tenant_id = p_tenant_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (
        r.is_owner
        or exists (
          select 1 from public.role_permissions rp
          where rp.role_id = r.id and rp.permission_key = p_perm
        )
      )
  );
$$;

create or replace function private.can_access_branch(p_tenant_id uuid, p_branch_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_members m
    where m.tenant_id = p_tenant_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (
        m.all_branches
        or exists (
          select 1 from public.member_branches mb
          where mb.member_id = m.id and mb.branch_id = p_branch_id
        )
      )
  );
$$;

-- Permission that is also scoped to a branch (used by Phase 2+ tables).
create or replace function private.has_branch_perm(p_tenant_id uuid, p_branch_id uuid, p_perm text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.has_perm(p_tenant_id, p_perm)
     and private.can_access_branch(p_tenant_id, p_branch_id);
$$;

-- True when the given user shares an active tenant with the caller
-- (lets staff see each other's names and emails, nobody else's).
create or replace function private.shares_tenant(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_members me
    join public.tenant_members them on them.tenant_id = me.tenant_id
    where me.user_id = (select auth.uid())
      and me.status = 'active'
      and them.user_id = p_user_id
  );
$$;

-- Plan limit for a tenant, or null when unlimited / no subscription row.
create or replace function private.plan_limit(p_tenant_id uuid, p_key text)
returns int
language sql stable security definer
set search_path = ''
as $$
  select (sp.limits ->> p_key)::int
  from public.subscriptions s
  join public.subscription_plans sp on sp.id = s.plan_id
  where s.tenant_id = p_tenant_id;
$$;

-- ---------------------------------------------------------------------------
-- Plan-limit triggers (enforced in the database, not only in the UI)
-- ---------------------------------------------------------------------------
create or replace function private.enforce_branch_limit()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_limit int := private.plan_limit(new.tenant_id, 'branches');
begin
  -- Callers without permission are rejected by RLS right after this trigger;
  -- don't reveal plan details to them first.
  if auth.uid() is not null and not private.has_perm(new.tenant_id, 'branches.manage') then
    return new;
  end if;
  if v_limit is not null
     and (select count(*) from public.branches b where b.tenant_id = new.tenant_id) >= v_limit then
    raise exception 'Your plan allows % branch(es). Upgrade to add more.', v_limit
      using errcode = 'P0001', hint = 'plan_limit:branches';
  end if;
  return new;
end;
$$;

create trigger branches_enforce_limit before insert on public.branches
  for each row execute function private.enforce_branch_limit();

create or replace function private.enforce_staff_limit()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_limit int := private.plan_limit(new.tenant_id, 'staff');
begin
  if v_limit is not null
     and (select count(*) from public.tenant_members m
          where m.tenant_id = new.tenant_id and m.status = 'active') >= v_limit then
    raise exception 'Your plan allows % staff account(s). Upgrade to add more.', v_limit
      using errcode = 'P0001', hint = 'plan_limit:staff';
  end if;
  return new;
end;
$$;

create trigger tenant_members_enforce_limit before insert on public.tenant_members
  for each row execute function private.enforce_staff_limit();

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------
create or replace function private.audit_row()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_tenant uuid := case
    when tg_table_name = 'tenants' then (v_row ->> 'id')::uuid
    else (v_row ->> 'tenant_id')::uuid
  end;
begin
  -- Never write invite tokens into the log.
  v_row := v_row - 'token';
  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, data)
  values (
    v_tenant,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'member_id'),
    case when tg_op = 'UPDATE'
      then jsonb_build_object('old', to_jsonb(old) - 'token', 'new', v_row)
      else v_row
    end
  );
  return null;
end;
$$;

create trigger audit_tenants after insert or update or delete on public.tenants
  for each row execute function private.audit_row();
create trigger audit_branches after insert or update or delete on public.branches
  for each row execute function private.audit_row();
create trigger audit_roles after insert or update or delete on public.roles
  for each row execute function private.audit_row();
create trigger audit_tenant_members after insert or update or delete on public.tenant_members
  for each row execute function private.audit_row();
create trigger audit_tenant_invites after insert or delete on public.tenant_invites
  for each row execute function private.audit_row();
create trigger audit_subscriptions after insert or update on public.subscriptions
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- Table privileges: start from nothing, then grant only what the policies
-- below are meant to allow. Column lists stop clients from changing
-- tenant_id, status flags or ownership columns even on rows they may edit.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.subscription_plans to anon, authenticated;
grant select on public.permissions, public.role_templates to authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;

grant select on public.tenants to authenticated;
grant update (name, slug, currency, timezone, country, logo_url, brand_color)
  on public.tenants to authenticated;

grant select, delete on public.branches to authenticated;
grant insert (tenant_id, name, code, address, city, phone, timezone, is_active)
  on public.branches to authenticated;
grant update (name, code, address, city, phone, timezone, is_active)
  on public.branches to authenticated;

grant select, delete on public.roles to authenticated;
grant insert (tenant_id, name, description) on public.roles to authenticated;
grant update (name, description) on public.roles to authenticated;

grant select on public.role_permissions, public.tenant_members, public.member_branches,
  public.subscriptions, public.audit_logs to authenticated;
grant select, delete on public.tenant_invites to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.tenants enable row level security;
alter table public.branches enable row level security;
alter table public.permissions enable row level security;
alter table public.role_templates enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.tenant_members enable row level security;
alter table public.member_branches enable row level security;
alter table public.tenant_invites enable row level security;
alter table public.subscriptions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;

-- Profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_tenant(id) or private.is_platform_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Plans: active plans are public (pricing page); admins see all.
create policy plans_select on public.subscription_plans for select to anon, authenticated
  using (is_active or private.is_platform_admin());

-- Catalogues
create policy permissions_select on public.permissions for select to authenticated using (true);
create policy role_templates_select on public.role_templates for select to authenticated using (true);

-- Tenants
create policy tenants_select on public.tenants for select to authenticated
  using (private.is_member(id) or private.is_platform_admin());
create policy tenants_update on public.tenants for update to authenticated
  using (private.has_perm(id, 'settings.manage'))
  with check (private.has_perm(id, 'settings.manage'));

-- Branches: staff see the branches they work in; managers see all.
create policy branches_select on public.branches for select to authenticated
  using (
    private.can_access_branch(tenant_id, id)
    or private.has_perm(tenant_id, 'branches.manage')
    or private.is_platform_admin()
  );
create policy branches_insert on public.branches for insert to authenticated
  with check (private.has_perm(tenant_id, 'branches.manage'));
create policy branches_update on public.branches for update to authenticated
  using (private.has_perm(tenant_id, 'branches.manage'))
  with check (private.has_perm(tenant_id, 'branches.manage'));
create policy branches_delete on public.branches for delete to authenticated
  using (private.has_perm(tenant_id, 'branches.manage'));

-- Roles: custom roles only; system roles can be renamed but not deleted;
-- the owner role is read-only.
create policy roles_select on public.roles for select to authenticated
  using (private.is_member(tenant_id) or private.is_platform_admin());
create policy roles_insert on public.roles for insert to authenticated
  with check (private.has_perm(tenant_id, 'roles.manage'));
create policy roles_update on public.roles for update to authenticated
  using (private.has_perm(tenant_id, 'roles.manage') and not is_owner)
  with check (private.has_perm(tenant_id, 'roles.manage') and not is_owner);
create policy roles_delete on public.roles for delete to authenticated
  using (private.has_perm(tenant_id, 'roles.manage') and not is_system and not is_owner);

-- Read-only for clients; writes go through the RPCs in the next migration.
create policy role_permissions_select on public.role_permissions for select to authenticated
  using (private.is_member(tenant_id) or private.is_platform_admin());
create policy tenant_members_select on public.tenant_members for select to authenticated
  using (private.is_member(tenant_id) or user_id = (select auth.uid()) or private.is_platform_admin());
create policy member_branches_select on public.member_branches for select to authenticated
  using (private.is_member(tenant_id) or private.is_platform_admin());

create policy tenant_invites_select on public.tenant_invites for select to authenticated
  using (private.has_perm(tenant_id, 'staff.manage'));
create policy tenant_invites_delete on public.tenant_invites for delete to authenticated
  using (private.has_perm(tenant_id, 'staff.manage') and accepted_at is null);

create policy subscriptions_select on public.subscriptions for select to authenticated
  using (private.is_member(tenant_id) or private.is_platform_admin());

create policy audit_logs_select on public.audit_logs for select to authenticated
  using (private.has_perm(tenant_id, 'audit.view') or private.is_platform_admin());

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and private.is_member(tenant_id));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
