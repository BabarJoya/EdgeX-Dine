-- pgTAP smoke test: proves the database test runner works in CI.
-- Phase 1 adds the tenant-isolation (RLS) tests next to this file.
begin;
select plan(1);
select has_schema('public');
select * from finish();
rollback;
