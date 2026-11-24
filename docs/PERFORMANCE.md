# Performance

Measured locally (Supabase CLI stack in Docker, one machine) with a year of
history for one restaurant: 3 branches, 40 dishes, **330k orders, 826k order
items, 323k bills and payments**, kitchen tickets for every order. Production
hardware will differ; the point is the shape — nothing scales with history
where it shouldn't.

Reproduce:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f scripts/perf/seed-volume.sql  # ~1.5 min
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -q -f scripts/perf/bench.sql
node scripts/perf/load-test.mjs 60 1 4      # tables, orders per table, kitchen screens
```

## Screens and reports (as the owner, with RLS)

| Query                                    | Before Phase 11 | After       |
| ---------------------------------------- | --------------- | ----------- |
| Open orders for a branch (Orders screen) | **57 s**        | < 1 ms      |
| Today's orders for a branch              | 220 ms          | 7–9 ms      |
| Today's bills with payments (POS)        | 230–350 ms      | 13–18 ms    |
| Active kitchen tickets (KDS)             | 1 ms            | < 1 ms      |
| Guest menu                               | 5–7 ms          | 5–7 ms      |
| Overview tiles (today)                   | 21 ms           | 18 ms       |
| Sales report, one branch, 30 days        | 430–630 ms      | 300–390 ms  |
| Sales report, all branches, 30 days      | 1.2–1.4 s       | 0.8–1.0 s   |
| Sales report, all branches, **365 days** | **50 s**        | 4–5 s       |
| Profit & loss, 30 days                   | 120 ms          | 80–100 ms   |
| Customers list / search                  | 4.4–5.2 s       | 0.2–0.35 s  |
| Customer insights, 30 days               | 4.2 s           | 0.16–0.26 s |

What changed (`supabase/migrations/20261201000300_performance.sql`):

1. **RLS evaluated once per query, not per row.** Policies called
   `private.has_branch_perm(tenant_id, branch_id, …)` for every row; with 110k
   orders in a branch that was 57 s. They now read
   `branch_id = ANY ((SELECT private.branch_ids_with('…'))::uuid[])` — the
   allowed branches are computed once (an InitPlan) and the branch indexes are
   used. The 69 policies were rewritten mechanically from the old ones, so the
   rules are identical; all permission tests pass unchanged.
2. **Sales report aggregates once.** Per-day, per-hour, per-branch and
   per-person figures were rescanned for every day/hour/person; they are now
   grouped once and joined.
3. **Customers** group by a stored, indexed normalised phone
   (`bills.customer_phone_norm`) instead of normalising every bill's number on
   every request.
4. Indexes for 33 foreign keys and a partial index for open orders.

## Dinner rush (`scripts/perf/load-test.mjs`)

Guests order through the public API at the same moment while signed-in
kitchen displays listen with realtime (postgres_changes, RLS enforced).

| Scenario                                      | Orders: p50 / p95 / max | Throughput | Kitchen screens: p50 / p95 / max | Lost |
| --------------------------------------------- | ----------------------- | ---------- | -------------------------------- | ---- |
| 60 tables order at once, 4 screens            | 454 / 622 / 625 ms      | 94 / s     | 1.1 / 1.7 / 1.7 s                | 0    |
| 60 tables × 3 orders back-to-back, 10 screens | 175 / 554 / 768 ms      | 195 / s    | 7.5 / 10.6 / 10.7 s              | 0    |

- No failed orders and **no duplicate order numbers** under concurrency
  (numbers come from a per-branch, per-day counter row).
- Realtime delivers every event, but with RLS each change is authorised for
  each subscriber, so a burst of 180 orders in one second to 10 screens queues
  up for ~10 s. A real rush is a few orders per minute per branch (first row).
  If a large chain needs more, switch the kitchen feed to Supabase Realtime
  _Broadcast from the database_ (one authorisation per channel join instead of
  per change). The KDS also refreshes every 15 s as a fallback.

## Remaining known costs

- A **one-year, all-branch** sales report takes ~4–5 s at this volume (it
  reads ~1M rows). Fine for an occasional report; if needed, add daily
  summary tables refreshed by `pg_cron`.
- Foreign keys to `auth.users` (`created_by`, …) are deliberately not indexed.
