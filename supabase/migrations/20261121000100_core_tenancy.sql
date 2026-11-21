-- =============================================================================
-- Phase 1 · Core tenancy schema
-- tenants → branches, profiles, permission catalogue, roles, memberships,
-- invitations, subscription plans / subscriptions, audit log, notifications.
--
-- Security model
--   * Every tenant-owned row carries tenant_id. Composite foreign keys
--     (x_id, tenant_id) make it impossible to link rows across tenants.
--   * Clients never choose tenant_id for privileged writes: membership,
--     invitations, role permissions and onboarding go through SECURITY
--     DEFINER functions (next migration) that check the caller.
--   * Helper functions live in the `private` schema, which PostgREST does
--     not expose.
-- =============================================================================

create schema if not exists private;
grant usage on schema private to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.tenant_status as enum ('active', 'suspended');
create type public.member_status as enum ('active', 'disabled');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'expired');
create type public.billing_cycle as enum ('monthly', 'yearly');

-- ---------------------------------------------------------------------------
-- Utilities
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text check (phone is null or char_length(phone) <= 32),
  avatar_url text,
  -- Platform (EdgeX staff) super admin. Never writable by clients.
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_email_key on public.profiles (lower(email));
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- Create the profile automatically on sign-up and keep the email in sync.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Subscription plans (platform-wide catalogue)
-- ---------------------------------------------------------------------------
create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  name text not null,
  description text not null default '',
  currency text not null default 'PKR' check (currency ~ '^[A-Z]{3}$'),
  price_monthly_minor bigint not null default 0 check (price_monthly_minor >= 0),
  price_yearly_minor bigint not null default 0 check (price_yearly_minor >= 0),
  trial_days int not null default 14 check (trial_days between 0 and 365),
  -- e.g. {"branches": 1, "tables": 15, "staff": 5}. A missing key = unlimited.
  limits jsonb not null default '{}'::jsonb check (jsonb_typeof(limits) = 'object'),
  -- Feature flags, e.g. {"kds", "online_ordering", "inventory"}.
  features text[] not null default '{}',
  is_active boolean not null default true,
  is_default_trial boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index subscription_plans_one_default_trial
  on public.subscription_plans (is_default_trial) where is_default_trial;
create trigger subscription_plans_updated_at before update on public.subscription_plans
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Tenants & branches
-- ---------------------------------------------------------------------------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  -- Public URL slug for the QR menu / ordering site.
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$'),
  status public.tenant_status not null default 'active',
  currency text not null default 'PKR' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Asia/Karachi',
  country text not null default 'PK' check (country ~ '^[A-Z]{2}$'),
  logo_url text,
  brand_color text check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger tenants_updated_at before update on public.tenants
  for each row execute function private.set_updated_at();

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  code text check (code is null or code ~ '^[A-Z0-9-]{1,12}$'),
  address text check (address is null or char_length(address) <= 300),
  city text check (city is null or char_length(city) <= 80),
  phone text check (phone is null or char_length(phone) <= 32),
  timezone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, name)
);
create index branches_tenant_idx on public.branches (tenant_id);
create trigger branches_updated_at before update on public.branches
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Permissions & roles
-- ---------------------------------------------------------------------------
create table public.permissions (
  key text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  module text not null,
  label text not null,
  description text not null default '',
  sort_order int not null default 0
);

-- System role templates copied into each new tenant.
create table public.role_templates (
  key text primary key,
  name text not null,
  description text not null default '',
  permissions text[] not null default '{}',
  sort_order int not null default 0
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  description text not null default '' check (char_length(description) <= 300),
  template_key text references public.role_templates (key),
  is_system boolean not null default false,
  -- The owner role always has every permission; it cannot be edited.
  is_owner boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, name)
);
create unique index roles_one_owner_per_tenant on public.roles (tenant_id) where is_owner;
create trigger roles_updated_at before update on public.roles
  for each row execute function private.set_updated_at();

create table public.role_permissions (
  role_id uuid not null,
  tenant_id uuid not null,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_id, permission_key),
  foreign key (role_id, tenant_id) references public.roles (id, tenant_id) on delete cascade
);
create index role_permissions_tenant_idx on public.role_permissions (tenant_id);

-- ---------------------------------------------------------------------------
-- Memberships
-- ---------------------------------------------------------------------------
create table public.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid not null,
  -- true = access to every branch, including ones created later.
  all_branches boolean not null default false,
  status public.member_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id),
  unique (id, tenant_id),
  foreign key (role_id, tenant_id) references public.roles (id, tenant_id) on delete restrict
);
create index tenant_members_user_idx on public.tenant_members (user_id);
create index tenant_members_role_idx on public.tenant_members (role_id);
create trigger tenant_members_updated_at before update on public.tenant_members
  for each row execute function private.set_updated_at();

create table public.member_branches (
  member_id uuid not null,
  branch_id uuid not null,
  tenant_id uuid not null,
  primary key (member_id, branch_id),
  foreign key (member_id, tenant_id) references public.tenant_members (id, tenant_id) on delete cascade,
  foreign key (branch_id, tenant_id) references public.branches (id, tenant_id) on delete cascade
);
create index member_branches_branch_idx on public.member_branches (branch_id);
create index member_branches_tenant_idx on public.member_branches (tenant_id);

create table public.tenant_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role_id uuid not null,
  all_branches boolean not null default false,
  branch_ids uuid[] not null default '{}',
  -- Random, unguessable; only ever sent to the invitee.
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (role_id, tenant_id) references public.roles (id, tenant_id) on delete cascade
);
create unique index tenant_invites_open_email
  on public.tenant_invites (tenant_id, lower(email)) where accepted_at is null;

-- ---------------------------------------------------------------------------
-- Subscriptions (one current subscription per tenant)
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants (id) on delete cascade,
  plan_id uuid not null references public.subscription_plans (id),
  status public.subscription_status not null default 'trialing',
  billing_cycle public.billing_cycle not null default 'monthly',
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Audit log & notifications
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  -- No foreign key on purpose: the trail must survive deletion of the
  -- records (and tenants) it describes.
  tenant_id uuid,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_tenant_created_idx on public.audit_logs (tenant_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_unread_idx on public.notifications (user_id, created_at desc)
  where read_at is null;
