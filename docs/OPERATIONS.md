# Operations runbook

## Monitoring

| What                      | How                                                                                                                                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Uptime                    | Point an uptime monitor (Better Stack, UptimeRobot, …) at `https://<domain>/api/health` every 1–5 min. 200 = healthy. 503 = database unreachable **or** the WhatsApp / tax-invoice queue has been stuck for over 15 minutes. The JSON shows `db_ms`, queue size, oldest message age and failures in the last 24 h. |
| Front-end errors          | Set `VITE_SENTRY_DSN` in Vercel (Production). Sentry loads only when it is set. Crashed pages show a friendly "Reload" screen and are reported; users are identified by id only, never by name or email.                                                                                                           |
| Server function logs      | Vercel → Project → Logs (`/api/*`: payments, messages, tax invoices). Add a Log Drain to Better Stack / Datadog to keep them longer.                                                                                                                                                                               |
| Database                  | Supabase → Reports (CPU, connections, slow queries) and Logs. Run `npx supabase db advisors --linked` after each release.                                                                                                                                                                                          |
| Payments needing a refund | Bills with "Paid after settling · refund" in the POS (`online_payments.needs_review`).                                                                                                                                                                                                                             |

## Backups

- **Supabase (Production project): enable Point-in-Time Recovery** (Pro plan
  add-on). It restores the whole database to any second in the retention
  window. Without PITR, Pro keeps 7 daily backups.
- **Off-site copy (optional):** a nightly logical dump of the app schemas:
  `pg_dump "$DATABASE_URL" -Fc --no-owner --no-privileges -n public -n private -n auth > edgex-$(date +%F).dump`
  (use a `pg_dump` with the same major version as the database), stored
  encrypted outside Supabase.
- **Storage** (menu images) is not in database backups; it is re-uploadable,
  but sync the `menu-images` bucket too if you want a full copy.

### Restore drill (tested)

`scripts/ops/backup-restore-check.sh` dumps the database, restores it into a
fresh database and compares every table's row count and the money totals.
Run it before launch and every quarter.

```bash
# Local stack (tools inside the DB container match the server version)
PG_TOOLS="docker exec -i supabase_db_edgex-erp" \
DUMP_URL=postgresql://postgres:postgres@localhost:5432/postgres \
scripts/ops/backup-restore-check.sh
```

Last run (1 year of data, 330k orders): dump 120 MB in 13 s, restore in 22 s,
**all 59 tables match, bill totals match to the paisa**.

### Restoring production

1. Decide the target time (just before the incident). Tell restaurants the
   system is in maintenance (Admin → Settings) to stop new writes.
2. Supabase → Database → Backups → **Point in time** → restore to that time
   (or pick a daily backup). The project is unavailable for a few minutes.
3. Check: `/api/health` is 200; sign in as a test restaurant; latest bills
   and orders are as expected; run `npx supabase db advisors --linked`.
4. Queued messages and tax invoices created after the restore point are
   re-created by the app as new events happen; check Admin for restaurants
   whose last orders were lost and tell them.
5. Write down what happened and when (incident log).

## Keys and secrets

| Secret                        | Where it lives                                  | Rotate when                   |
| ----------------------------- | ----------------------------------------------- | ----------------------------- |
| Supabase service-role key     | Vercel env `SUPABASE_SERVICE_ROLE_KEY` only     | Suspected leak; staff changes |
| Gateway / WhatsApp / tax keys | Per restaurant, `private.integration_secrets`   | The restaurant asks; leak     |
| Sentry DSN                    | Vercel env `VITE_SENTRY_DSN` (public by design) | Abuse                         |

Rotating the service-role key: Supabase → API → roll the key, update Vercel,
redeploy. Restaurant secrets: re-enter in Settings → Integrations.

## Releases

1. CI must be green (format, lint, types, unit, database tests and advisors,
   end-to-end incl. the security probe).
2. `npx supabase db push` to production (migrations are additive), then let
   Vercel deploy the app.
3. Watch `/api/health` and Sentry for 15 minutes.
