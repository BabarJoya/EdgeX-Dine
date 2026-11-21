-- =============================================================================
-- Phase 1 · RPCs for onboarding, invitations, members and role permissions.
-- These are the only way clients can create tenants, add members or change
-- what a role may do. Each one checks the caller before writing anything.
-- =============================================================================

-- Slugs that would collide with app routes or look official.
create or replace function private.is_reserved_slug(p_slug text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select p_slug = any (array[
    'admin', 'app', 'api', 'www', 'edgex', 'login', 'signup', 'auth', 'help',
    'support', 'billing', 'status', 'docs', 'blog', 'pos', 'kds', 'waiter',
    'menu', 'order', 'orders', 'static', 'assets', 'design', 'onboarding'
  ]);
$$;

-- ---------------------------------------------------------------------------
-- is_slug_available
-- ---------------------------------------------------------------------------
create or replace function public.is_slug_available(p_slug text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_slug ~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$'
     and not private.is_reserved_slug(p_slug)
     and not exists (select 1 from public.tenants t where t.slug = p_slug);
$$;

-- ---------------------------------------------------------------------------
-- create_tenant: sign-up onboarding. Creates the restaurant, its first branch,
-- the standard roles, makes the caller Owner and starts the trial.
-- ---------------------------------------------------------------------------
create or replace function public.create_tenant(
  p_name text,
  p_slug text,
  p_branch_name text,
  p_city text default null,
  p_currency text default 'PKR',
  p_timezone text default 'Asia/Karachi',
  p_country text default 'PK'
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant_id uuid;
  v_owner_role uuid;
  v_role_id uuid;
  v_tpl record;
  v_plan record;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  -- Abuse guard: a person can own a handful of restaurants, not hundreds.
  if (select count(*) from public.tenants t where t.created_by = v_uid) >= 5 then
    raise exception 'You have reached the limit of restaurants per account. Contact support.'
      using errcode = 'P0001';
  end if;

  p_slug := lower(trim(p_slug));
  if not public.is_slug_available(p_slug) then
    raise exception 'That web address is not available' using errcode = 'P0001', hint = 'slug';
  end if;

  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_timezone) then
    raise exception 'Unknown time zone' using errcode = '22023';
  end if;

  insert into public.tenants (name, slug, currency, timezone, country, created_by)
  values (trim(p_name), p_slug, upper(p_currency), p_timezone, upper(p_country), v_uid)
  returning id into v_tenant_id;

  -- Trial subscription on the default trial plan (inserted before the branch
  -- so plan limits apply from the start).
  select * into v_plan from public.subscription_plans
  where is_default_trial and is_active limit 1;
  if v_plan.id is null then
    raise exception 'No trial plan is configured' using errcode = 'P0001';
  end if;
  insert into public.subscriptions (tenant_id, plan_id, status, trial_ends_at, current_period_end)
  values (
    v_tenant_id, v_plan.id, 'trialing',
    now() + make_interval(days => v_plan.trial_days),
    now() + make_interval(days => v_plan.trial_days)
  );

  insert into public.branches (tenant_id, name, city)
  values (v_tenant_id, trim(p_branch_name), nullif(trim(p_city), ''));

  -- Copy role templates.
  for v_tpl in select * from public.role_templates order by sort_order loop
    insert into public.roles (tenant_id, name, description, template_key, is_system, is_owner)
    values (v_tenant_id, v_tpl.name, v_tpl.description, v_tpl.key, true, v_tpl.key = 'owner')
    returning id into v_role_id;

    if v_tpl.key = 'owner' then
      v_owner_role := v_role_id;
    else
      insert into public.role_permissions (role_id, tenant_id, permission_key)
      select v_role_id, v_tenant_id, p.key
      from public.permissions p
      where p.key = any (v_tpl.permissions);
    end if;
  end loop;

  insert into public.tenant_members (tenant_id, user_id, role_id, all_branches)
  values (v_tenant_id, v_uid, v_owner_role, true);

  return v_tenant_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- my_permissions: permission keys the caller holds in a tenant (for the UI;
-- the database enforces the same rules independently).
-- ---------------------------------------------------------------------------
create or replace function public.my_permissions(p_tenant_id uuid)
returns text[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (
      select case
        when r.is_owner then (select array_agg(p.key order by p.key) from public.permissions p)
        else (
          select array_agg(rp.permission_key order by rp.permission_key)
          from public.role_permissions rp where rp.role_id = r.id
        )
      end
      from public.tenant_members m
      join public.tenants t on t.id = m.tenant_id and t.status = 'active'
      join public.roles r on r.id = m.role_id
      where m.tenant_id = p_tenant_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    ),
    '{}'::text[]
  );
$$;

-- ---------------------------------------------------------------------------
-- Shared validation for role + branch assignments.
-- ---------------------------------------------------------------------------
create or replace function private.assert_assignable(
  p_tenant_id uuid,
  p_role_id uuid,
  p_all_branches boolean,
  p_branch_ids uuid[]
)
returns void
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_role record;
begin
  select * into v_role from public.roles r where r.id = p_role_id and r.tenant_id = p_tenant_id;
  if v_role.id is null then
    raise exception 'Role not found' using errcode = 'P0002';
  end if;
  if v_role.is_owner then
    raise exception 'The Owner role cannot be assigned here' using errcode = '42501';
  end if;
  -- Only someone who can manage roles may hand out a role with that power.
  if exists (
       select 1 from public.role_permissions rp
       where rp.role_id = p_role_id and rp.permission_key = 'roles.manage'
     ) and not private.has_perm(p_tenant_id, 'roles.manage') then
    raise exception 'You cannot assign a role that manages roles' using errcode = '42501';
  end if;
  if not coalesce(p_all_branches, false) then
    if coalesce(cardinality(p_branch_ids), 0) = 0 then
      raise exception 'Choose at least one branch' using errcode = '22023';
    end if;
    if exists (
      select 1 from unnest(p_branch_ids) b(id)
      where not exists (
        select 1 from public.branches x where x.id = b.id and x.tenant_id = p_tenant_id
      )
    ) then
      raise exception 'Branch not found' using errcode = 'P0002';
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- invite_member: returns the invite token so the inviter can share the link.
-- (An Edge Function will also email it once email sending is configured.)
-- ---------------------------------------------------------------------------
create or replace function public.invite_member(
  p_tenant_id uuid,
  p_email text,
  p_role_id uuid,
  p_all_branches boolean default false,
  p_branch_ids uuid[] default '{}'
)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_token text;
  v_limit int;
begin
  if not private.has_perm(p_tenant_id, 'staff.manage') then
    raise exception 'You do not have permission to invite staff' using errcode = '42501';
  end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;
  perform private.assert_assignable(p_tenant_id, p_role_id, p_all_branches, p_branch_ids);

  if exists (
    select 1 from public.tenant_members m
    join public.profiles p on p.id = m.user_id
    where m.tenant_id = p_tenant_id and lower(p.email) = v_email
  ) then
    raise exception 'This person is already on your team' using errcode = '23505';
  end if;

  v_limit := private.plan_limit(p_tenant_id, 'staff');
  if v_limit is not null and (
    (select count(*) from public.tenant_members m where m.tenant_id = p_tenant_id and m.status = 'active')
    + (select count(*) from public.tenant_invites i
       where i.tenant_id = p_tenant_id and i.accepted_at is null and i.expires_at > now()
         and lower(i.email) <> v_email)
  ) >= v_limit then
    raise exception 'Your plan allows % staff account(s). Upgrade to add more.', v_limit
      using errcode = 'P0001', hint = 'plan_limit:staff';
  end if;

  -- Re-inviting replaces any open invite for the same email.
  delete from public.tenant_invites i
  where i.tenant_id = p_tenant_id and lower(i.email) = v_email and i.accepted_at is null;

  insert into public.tenant_invites (tenant_id, email, role_id, all_branches, branch_ids, invited_by)
  values (
    p_tenant_id, v_email, p_role_id, coalesce(p_all_branches, false),
    case when coalesce(p_all_branches, false) then '{}' else p_branch_ids end,
    auth.uid()
  )
  returning token into v_token;

  return v_token;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_invite: public lookup by token for the sign-up page.
-- ---------------------------------------------------------------------------
create or replace function public.get_invite(p_token text)
returns table (tenant_name text, role_name text, email text, is_valid boolean)
language sql stable security definer
set search_path = ''
as $$
  select t.name, r.name, i.email,
         (i.accepted_at is null and i.expires_at > now() and t.status = 'active')
  from public.tenant_invites i
  join public.tenants t on t.id = i.tenant_id
  join public.roles r on r.id = i.role_id
  where i.token = p_token;
$$;

-- ---------------------------------------------------------------------------
-- accept_invite: the signed-in user's email must match the invitation, so a
-- forwarded link cannot be used by someone else.
-- ---------------------------------------------------------------------------
create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_inv record;
  v_member_id uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_uid;

  select i.* into v_inv from public.tenant_invites i
  join public.tenants t on t.id = i.tenant_id and t.status = 'active'
  where i.token = p_token
  for update of i;

  if v_inv.id is null or v_inv.accepted_at is not null or v_inv.expires_at <= now() then
    raise exception 'This invitation is invalid or has expired' using errcode = 'P0002';
  end if;
  if lower(v_inv.email) <> v_email then
    raise exception 'This invitation was sent to a different email address' using errcode = '42501';
  end if;
  if exists (select 1 from public.tenant_members m where m.tenant_id = v_inv.tenant_id and m.user_id = v_uid) then
    raise exception 'You are already a member of this restaurant' using errcode = '23505';
  end if;

  insert into public.tenant_members (tenant_id, user_id, role_id, all_branches)
  values (v_inv.tenant_id, v_uid, v_inv.role_id, v_inv.all_branches)
  returning id into v_member_id;

  if not v_inv.all_branches then
    insert into public.member_branches (member_id, branch_id, tenant_id)
    select v_member_id, b.id, v_inv.tenant_id
    from public.branches b
    where b.tenant_id = v_inv.tenant_id and b.id = any (v_inv.branch_ids);
  end if;

  update public.tenant_invites set accepted_at = now() where id = v_inv.id;
  return v_inv.tenant_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_member / remove_member
-- ---------------------------------------------------------------------------
create or replace function private.assert_manageable_member(p_member_id uuid)
returns public.tenant_members
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_member public.tenant_members;
begin
  select * into v_member from public.tenant_members m where m.id = p_member_id;
  if v_member.id is null or not private.has_perm(v_member.tenant_id, 'staff.manage') then
    -- Same message whether the member is missing or belongs to another tenant.
    raise exception 'Team member not found' using errcode = 'P0002';
  end if;
  if v_member.user_id = auth.uid() then
    raise exception 'You cannot change your own access' using errcode = '42501';
  end if;
  if exists (select 1 from public.roles r where r.id = v_member.role_id and r.is_owner) then
    raise exception 'The owner''s access cannot be changed' using errcode = '42501';
  end if;
  return v_member;
end;
$$;

create or replace function public.update_member(
  p_member_id uuid,
  p_role_id uuid,
  p_all_branches boolean,
  p_branch_ids uuid[] default '{}',
  p_status public.member_status default 'active'
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_member public.tenant_members := private.assert_manageable_member(p_member_id);
begin
  perform private.assert_assignable(v_member.tenant_id, p_role_id, p_all_branches, p_branch_ids);

  update public.tenant_members
  set role_id = p_role_id, all_branches = coalesce(p_all_branches, false), status = p_status
  where id = v_member.id;

  delete from public.member_branches where member_id = v_member.id;
  if not coalesce(p_all_branches, false) then
    insert into public.member_branches (member_id, branch_id, tenant_id)
    select v_member.id, b.id, v_member.tenant_id
    from public.branches b
    where b.tenant_id = v_member.tenant_id and b.id = any (p_branch_ids);
  end if;
end;
$$;

create or replace function public.remove_member(p_member_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_member public.tenant_members := private.assert_manageable_member(p_member_id);
begin
  delete from public.tenant_members where id = v_member.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_role_permissions: replaces a role's permission set.
-- A manager can only grant permissions they hold themselves, and cannot edit
-- the role they are in (no self-promotion).
-- ---------------------------------------------------------------------------
create or replace function public.set_role_permissions(p_role_id uuid, p_permissions text[])
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_role public.roles;
  v_is_owner boolean;
  v_unknown text;
begin
  select * into v_role from public.roles r where r.id = p_role_id;
  if v_role.id is null or not private.has_perm(v_role.tenant_id, 'roles.manage') then
    raise exception 'Role not found' using errcode = 'P0002';
  end if;
  if v_role.is_owner then
    raise exception 'The Owner role always has full access' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.tenant_members m join public.roles r on r.id = m.role_id
    where m.tenant_id = v_role.tenant_id and m.user_id = auth.uid() and r.is_owner
  ) into v_is_owner;

  if not v_is_owner then
    if exists (
      select 1 from public.tenant_members m
      where m.tenant_id = v_role.tenant_id and m.user_id = auth.uid() and m.role_id = v_role.id
    ) then
      raise exception 'You cannot change the permissions of your own role' using errcode = '42501';
    end if;
    if exists (
      select 1 from unnest(p_permissions) k(key)
      where not private.has_perm(v_role.tenant_id, k.key)
    ) then
      raise exception 'You can only grant permissions you have yourself' using errcode = '42501';
    end if;
  end if;

  select k.key into v_unknown from unnest(p_permissions) k(key)
  where not exists (select 1 from public.permissions p where p.key = k.key) limit 1;
  if v_unknown is not null then
    raise exception 'Unknown permission: %', v_unknown using errcode = '22023';
  end if;

  delete from public.role_permissions where role_id = v_role.id;
  insert into public.role_permissions (role_id, tenant_id, permission_key)
  select distinct v_role.id, v_role.tenant_id, k.key from unnest(p_permissions) k(key);

  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, data)
  values (v_role.tenant_id, auth.uid(), 'update', 'role_permissions', v_role.id::text,
          jsonb_build_object('permissions', to_jsonb(p_permissions)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.is_slug_available(text),
  public.create_tenant(text, text, text, text, text, text, text),
  public.my_permissions(uuid),
  public.invite_member(uuid, text, uuid, boolean, uuid[]),
  public.accept_invite(text),
  public.update_member(uuid, uuid, boolean, uuid[], public.member_status),
  public.remove_member(uuid),
  public.set_role_permissions(uuid, text[])
to authenticated;
grant execute on function public.get_invite(text) to anon, authenticated;

-- Internal helpers are never callable through the API (private schema is not
-- exposed), but keep execute limited to the roles policies run as.
revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, anon;
