-- =============================================================================
-- Schema-wide guards. These run against every table, including ones added in
-- future phases, so a forgotten policy or grant fails CI instead of shipping.
-- =============================================================================
begin;
select plan(5);

select is(
  (select array_agg(c.relname::text order by c.relname)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  null,
  'every public table has Row Level Security enabled');

select is(
  (select array_agg(distinct table_name::text order by table_name::text)
   from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon'
     and not (table_name = 'subscription_plans' and privilege_type = 'SELECT')),
  null,
  'anonymous users have no table privileges except reading plans');

select is(
  (select array_agg(distinct table_name::text order by table_name::text)
   from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'authenticated'
     and privilege_type in ('UPDATE', 'INSERT', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
  null,
  'signed-in users have no table-wide write grants (only column-level ones)');

select is(
  (select array_agg(table_name::text || '.' || column_name::text order by table_name, column_name)
   from information_schema.column_privileges
   where table_schema = 'public' and grantee = 'authenticated'
     and privilege_type = 'UPDATE' and column_name in ('id', 'tenant_id')),
  null,
  'id and tenant_id columns are never updatable by clients');

select is(
  (select array_agg(p.proname::text order by p.proname)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'server\_%'
     and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'))),
  null,
  'server_* functions (gateway callbacks, secrets) are callable by the server only');

select * from finish();
rollback;
