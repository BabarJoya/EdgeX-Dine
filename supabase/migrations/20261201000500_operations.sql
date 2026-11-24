-- =============================================================================
-- Phase 11: operations. A health check for uptime monitors (server only).
-- =============================================================================
create or replace function public.server_health()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'db_time', now(),
    'outbox_pending', (select count(*) from public.message_outbox where status in ('pending', 'sending')),
    'outbox_oldest_seconds', (select extract(epoch from now() - min(created_at))::int
                              from public.message_outbox where status in ('pending', 'sending')),
    'outbox_failed_24h', (select count(*) from public.message_outbox
                          where status = 'failed' and created_at > now() - interval '24 hours'));
$$;
revoke all on function public.server_health() from public, anon, authenticated;
grant execute on function public.server_health() to service_role;
