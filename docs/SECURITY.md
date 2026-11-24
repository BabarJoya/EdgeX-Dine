# Security model and audit

## How data is protected

- **Every table has Row Level Security.** Reads go through policies that
  check membership, role permissions and branch access (`private.has_perm`,
  `private.has_branch_perm`). Clients have no table-wide write grants; writes
  go through database functions that check permissions, the plan's features
  and the subscription state.
- **Internal tables are closed to every client:** `bill_counters`,
  `order_counters`, `pos_operator_sessions`, `pos_unlock_attempts`,
  `staff_pins` (RLS on, no policies).
- **Guests (not signed in) can call exactly 17 functions** — menu, QR
  ordering, guest requests, online ordering and tracking, bookings, receipts,
  payment options and reviews — and every one of them is keyed by an
  unguessable token or a public restaurant slug. New functions are not
  callable anonymously unless granted explicitly.
- **Secrets** (gateway keys, WhatsApp and tax tokens) live in
  `private.integration_secrets` and are read only by server functions with the
  service key, which never reaches the browser.
- **Money is computed in the database**; the browser never decides a price,
  a tax or that a bill is paid. Gateway callbacks are verified by the server
  and are idempotent.

## Automated checks (run in CI on every push)

| Check                                                                                                                                                                                             | Where                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| RLS on every table; no client write grants; id / tenant_id never updatable                                                                                                                        | `supabase/tests/000_schema_guards.test.sql`  |
| Exact list of anonymous functions; `search_path` pinned on every SECURITY DEFINER function; closed tables list; one permissive policy per action; foreign keys indexed; no SECURITY DEFINER views | `supabase/tests/150_security_audit.test.sql` |
| Cross-tenant sweep: a restaurant with data in 39 of 48 tenant tables; another restaurant's owner and an anonymous visitor see **zero** rows in every table                                        | `supabase/tests/150_security_audit.test.sql` |
| Per-module permission and isolation tests (menu, orders, billing, inventory, …)                                                                                                                   | `supabase/tests/0*0_*.test.sql`              |
| Black-box API probe with the public key: read / insert / delete on every table, every database function, forged tokens, forged payment callbacks                                                  | `e2e/security.spec.ts`                       |
| Supabase security and performance advisors (`--fail-on warn`)                                                                                                                                     | CI `database` job                            |

## Audit log (Phase 11)

- Supabase security advisor: no findings. Performance advisor: three tables had
  two permissive SELECT policies (a `FOR ALL` write policy also covering
  reads) — split into per-command policies.
- 33 foreign keys had no index on their leading column — indexed. Foreign
  keys to `auth.users` (created_by, …) are left unindexed on purpose.
- `save_integration` and `retry_fiscal_invoice` were executable by anonymous
  callers (both refused them inside, so nothing leaked) — revoked, and new
  functions now default to not being callable anonymously.

## Before going live

- Enable leaked-password protection and email confirmation in Supabase Auth.
- Keep `ENABLE_TEST_GATEWAY` / `VITE_TEST_GATEWAY` unset in production.
- Rotate the service-role key if it is ever exposed; it is only set in Vercel's
  server environment.
- Run `npx supabase db advisors --linked` against production after each deploy.
