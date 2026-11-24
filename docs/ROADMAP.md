# EdgeX Restaurant ERP — Phase-wise Development Plan

Multi-tenant restaurant management SaaS: QR ordering, kitchen display, waiter app,
POS & split payments, multi-branch management, inventory, and analytics.
Target market: Pakistan first, then international.

**Strategy:** ship a sellable MVP (QR ordering + KDS + waiter + POS) as fast as
possible, get the first paying restaurant onto it, and then add inventory,
local integrations, and advanced analytics. Security (RLS) is built and tested
in every phase, not saved for the end.

---

## 0. Key architecture decisions (lock these in before Phase 1)

| Topic                 | Decision                                                                                                                                                                                                                                                                                                              | Why                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Repo layout           | One Vite + React + TS app with lazy-loaded route groups (`/admin`, `/app`, `/pos`, `/kds`, `/waiter`, `/m/:slug`), plus a `supabase/` folder (migrations, seed, edge functions, tests)                                                                                                                                | One codebase stays easy to manage. Code-splitting keeps the customer menu bundle small. |
| Tenancy model         | `tenants` (business / billing account) → `branches`. Brand fields live on `tenants`. Drop the separate `restaurants` table for now and add `brands` later only if multi-brand groups need it.                                                                                                                         | Avoids a redundant level that has to be joined into every RLS check.                    |
| Membership & roles    | `tenant_members(user_id, tenant_id, role_id)` + `member_branches(member_id, branch_id)`. `roles` are per tenant, seeded from system templates. `role_permissions` maps roles to permission keys such as `orders.refund`.                                                                                              | Configurable permissions per role and per branch, as the spec requires.                 |
| RLS pattern           | `SECURITY DEFINER STABLE` helpers: `is_tenant_member(tid)`, `has_perm(tid, perm, branch_id)`. Every policy uses `(select auth.uid())`. `tenant_id` is never taken from the client. A trigger sets it from the parent record / membership.                                                                             | Blocks cross-tenant access and keeps policies fast.                                     |
| Guests (QR customers) | Guests never write to tables directly. A QR code holds an unguessable `table.qr_token`. Menu reads and order writes go through RPCs / Edge Functions that check the token, open or reuse a `table_session`, **recalculate all prices on the server**, and apply rate limits. Guests get a session token for tracking. | Public endpoints are the biggest attack surface in this product.                        |
| Realtime              | Staff screens use `postgres_changes` (RLS-filtered). Guest tracking uses **Broadcast on private channels** (`session:<id>`), fed by DB triggers.                                                                                                                                                                      | Guests are anonymous, so `postgres_changes` + RLS is the wrong fit for them.            |
| Money                 | Integer minor units (`amount_paisa bigint`) plus `currency` on the tenant. Product name and price are copied into `order_items` when the order is placed.                                                                                                                                                             | No rounding bugs, and old invoices don't change when the menu changes.                  |
| Order numbers         | Per-branch daily counter table, assigned inside a transaction                                                                                                                                                                                                                                                         | Gives readable numbers like "#042" for kitchen and guests.                              |
| Tax                   | Configurable tax rules per branch, **including different rates by payment method** (Pakistani provincial authorities have used different rates for card and cash payments). Service charge and discounts are calculated on the server.                                                                                | Pakistan compliance comes first.                                                        |
| Testing               | pgTAP for RLS/policy tests, Vitest for logic, Playwright for end-to-end flows (guest → kitchen → waiter → POS). Supabase CLI for local development. GitHub Actions CI.                                                                                                                                                | A "Phase 9 security testing" step is too late to find a tenant data leak.               |

---

## Phase 0 — Foundation (≈1 week) ✅ Done

**Goal:** an empty but production-shaped project.

- Vite + React + TS + Tailwind + shadcn/ui + Lucide + React Router + TanStack Query + React Hook Form + Zod.
- Design tokens: Deep Navy (primary), Digital Blue (accent), Golden Amber (secondary), Warm Cream / White (background), Charcoal (text). Light and dark themes.
- App shell: sidebar layout, top bar, toasts, modals, skeletons, empty states, data-table component.
- Supabase CLI project (`supabase/`), local stack, typed client (`supabase gen types`).
- ESLint, Prettier, Vitest, Playwright, GitHub Actions (lint → typecheck → unit → db tests → build).
- Vercel project with SPA rewrites and preview deployments per branch. Separate Supabase projects for staging and production.
- PWA manifest + service worker (installable; offline caching comes later).
- `.env.example` with only the anon key. The service-role key is used only in Edge Functions.

**Done when:** CI is green, a preview URL deploys, and you can switch between light and dark themes.

---

## Phase 1 — Database core, auth, tenancy, RBAC (≈2 weeks) ✅ Done

**Tables:** `tenants`, `branches`, `profiles`, `tenant_members`, `member_branches`,
`roles`, `permissions`, `role_permissions`, `subscription_plans`, `subscriptions`
(structure only), `audit_logs`, `notifications`.

- Supabase Auth: email/password, magic link, password reset. Staff invites by email. PIN login for shared POS / KDS devices, using a branch device token + staff PIN.
- Signup flow: owner signs up → creates tenant → first branch → system roles are seeded → trial subscription starts.
- Seeded roles: Owner, Branch Manager, Restaurant Manager, Cashier, Waiter, Kitchen Staff, Inventory Manager, Accountant. Super Admin is a platform flag, not a tenant role.
- RLS on every table, plus helper functions. Audit trigger for sensitive tables.
- Frontend: auth pages, tenant/branch switcher, route guards driven by permissions (`<Can perm="menu.edit">`).
- **pgTAP tests:** user A cannot read or write tenant B's data on any table. A waiter cannot perform manager actions.

**Done when:** two test tenants are fully isolated (proved by tests), and a role change takes effect without logging out.

**Delivered:** 55 pgTAP isolation/permission tests and a full browser journey
(sign up → create restaurant → add branch → invite waiter → waiter sees only
their branch and allowed screens). Invites are shared as a link (copy or
WhatsApp). **Moved:** automatic invite _emails_ (needs your SMTP provider) to
Phase 6, and staff PIN login for shared tablets to Phase 4–5, where the POS
and kitchen screens that need it are built.

---

## Phase 2 — Owner dashboard, branding & menu management (≈2 weeks) ✅ Done

**Tables:** `categories` (with subcategories via `parent_id`), `products`,
`product_variants`, `modifier_groups`, `modifiers`, `product_modifier_groups`,
`product_branch_overrides` (price / availability per branch), `kitchen_stations`,
`product_translations`.

- Restaurant profile: logo, cover image, colours, currency, timezone, languages (English / Urdu with RTL support, plus others later).
- Branch management: address, opening hours, tax and service-charge settings.
- Staff management: invite, assign role and branches, deactivate.
- Menu builder: drag-to-sort categories and products, images (Supabase Storage with resize), variants (Half/Full, S/M/L), add-on groups with min/max selection, discounts, available/unavailable toggle, routing each product to a kitchen station.
- Simple owner dashboard home (KPIs filled in later).

**Done when:** an owner can build a full real menu with Urdu translations, and branch-level prices or availability override the default.

**Delivered:** menu builder (categories + subcategories, items with sizes,
reusable add-on groups, kitchen stations, labels, photos resized in the
browser, one-tap "sold out", Urdu names in Nastaliq, per-branch price and
availability). 39 new database tests, including schema-wide guards that fail
CI if any future table is missing RLS. Restaurant branding/profile was
delivered in Phase 1 Settings.

---

## Phase 3 — Tables, QR codes & guest ordering ⭐ (≈2–3 weeks) ✅ Done

**Tables:** `floor_areas`, `tables` (with `qr_token`, `status`, `position`),
`table_sessions`, `qr_codes` (also covers the restaurant-wide menu QR), `orders`,
`order_items`, `order_item_modifiers`, `guest_requests` (= waiter calls).

- Table management: create tables (up to the plan limit), visual floor-plan editor (drag and drop), statuses (Available / Occupied / Reserved / Cleaning).
- QR generation: one per table plus a restaurant-wide QR. Printable PDF table cards with the restaurant's branding. QR codes can be regenerated / revoked.
- **Guest menu `/m/:slug?t=<token>`** — a separate, mobile-first, lightweight UI: categories, search and filter, item details, variants and add-ons, special instructions, cart, place order. Language toggle with Urdu RTL.
- Server-side `place_order` RPC / Edge Function: checks the token and the open session, recalculates prices and tax, writes the order and kitchen tickets in one transaction, and rate-limits per token and IP.
- Guest Zone: current-session order history, live status tracking (Broadcast), call waiter (Assistance / Water / Napkins / Bill / Other), request bill, feedback.

**Done when:** a guest on a cheap Android phone over 3G can scan, order, and see the status change in under about 2 seconds, and tampered prices or tokens are rejected (with tests).

**Delivered:** areas, tables with drag-to-arrange floor plan and statuses,
printable A4 QR cards (English + Urdu), QR regeneration, guest menu in
English/Urdu (RTL) with brand colour, sizes and add-on rules, cart, order
tracking, call waiter / water / napkins / bill; staff Orders page with live
updates (Supabase Realtime) and guest requests; close table. All prices are
computed in the database; 47 new database tests cover tampering, flooding,
cross-tenant items and branch scope. **Adjusted:** guest order tracking
refreshes every 4 seconds (robust on weak mobile data) instead of a push
channel; staff screens are instant. Table transfer/merge moves to Phase 4
with the waiter app; tax and service charge are applied at billing (Phase 5).

---

## Phase 4 — Kitchen Display & Waiter app ⭐ (≈2 weeks) ✅ Done

**Tables:** `kitchen_tickets`, `kitchen_ticket_items`, `order_status_events`.

- **KDS** (`/kds`, landscape tablet or TV): live ticket queue per station (BBQ, Fast Food, Drinks, Desserts…), order number + table, items, modifiers and notes, preparation timer with colour aging, priority flag, accept/reject, status flow New → Accepted → Preparing → Ready → Served, sound alert, bump bar / tap-to-advance, recall the last bumped ticket.
- One order is split into several station tickets automatically, based on how each product is routed.
- **Waiter app** (`/waiter`, phone PWA): assigned tables, live table status, take an order for a table or add to an existing one, edits that need a permission check (manager PIN), guest-request notifications with sound and acknowledge/resolve, "ready to serve" alerts, mark as served, view the bill status.
- Table operations: assign waiter, transfer table, merge tables, close the table after payment.
- Reconnection handling: when a realtime connection comes back, the screen re-fetches the current state so no tickets are missed.

**Done when:** a full end-to-end Playwright test passes (guest orders → right station shows the ticket → kitchen marks it ready → waiter is notified → served), and the kitchen screen survives a 30-second network drop without losing tickets.

**Delivered:** automatic per-station tickets; kitchen display with station
filter (remembered per screen), age timers (amber at 8 min, red at 15),
rush flag, accept/start/ready, quick "Ready", recall, sound alerts, full
screen, dark mode; waiter phone app with tables (all/mine), guest requests,
"ready at the pass", table view with add order (same item picker as
guests), move, merge, claim/release, close. Tables page also has move and
merge. Order status follows the kitchen tickets automatically. Screens
refetch every 15–20 s as a safety net when realtime drops. 39 new database
tests. **Moved:** staff PIN login for shared tablets → Phase 5 (with cashier
shifts, where per-person attribution matters most); waiter response-time
analytics → Phase 7 reports (timestamps are already recorded).

---

## Phase 5 — POS, billing & Split Pay ⭐ (≈2–3 weeks) ✅ Done

**Tables:** `payments`, `payment_splits`, `refunds`, `cash_shifts`,
`cash_movements`, `discounts`, `tax_rules`, `receipts`, `customers` (basic).

- Touch-first POS: dine-in / takeaway / delivery, manual order entry, add to an open table order, discounts (with permission), tax and service charge, customer lookup.
- Payments: cash (change calculation), card (recorded manually for now), wallet (recorded manually for now), partial payments, mixed payment methods.
- **Split Pay:** split equally, by item, or by custom amount, with the remaining balance tracked. The same split flow is offered to guests in the Guest Zone ("request to pay my items").
- Receipts: browser printing for 80mm/58mm thermal paper (MVP), digital receipt link, reprint. Cancel/refund requires permission and is written to the audit log.
- Cashier shifts: opening float, cash in/out, closing count, variance, Z-report / daily closing.

**Done when:** a full real service day can run on the system and the closing report matches the cash in the drawer.

**Delivered:** branch tax settings with separate cash / card / wallet
rates, service charge (dine-in), NTN/STRN and receipt footer; touch POS
with tables, takeaway and delivery (customer name/phone), today's bills;
discounts (percent or amount, with reason, permission-checked); payments
taxed per method so mixed cash/card splits are correct; split whole,
equally, by item or by amount; cash change with quick-note buttons;
refunds; 80 mm receipts + public receipt link + WhatsApp share; cashier
shifts with float, cash in/out, X/Z-reports and over/short; shared-device
PIN login (6 digits, bcrypt, unique per restaurant, 5-try lockout) with
every action checked against the cashier's own role. 53 new database
tests. **Moved:** guest-side self-payment needs a payment gateway → Phase 8;
a customers directory (CRM) → Phase 10 (name/phone are saved on bills now).
**Note:** amounts keep paisa precision; rounding to whole rupees at the
till can be added as a setting if restaurants want it.

---

### 🚀 MVP milestone — pilot launch

Phases 0–5 = **sellable MVP**. Onboard 1–3 pilot restaurants, with a minimal
Super Admin (next phase) used manually. Collect feedback for 2–4 weeks while
Phase 6 starts.

---

## Phase 6 — Super Admin, subscriptions & plan gating (≈2 weeks) ✅ Done

- **Super Admin panel** (`/admin`): list of tenants, approve or suspend, impersonate with an audit trail, platform activity, global settings.
- Plan builder: prices (PKR / USD), monthly or yearly, trial days, limits (branches, tables, staff, monthly orders), feature flags (KDS, online ordering, inventory, reports, custom branding, API).
- Enforcement: plan limits checked in the database (trigger / RPC checks) **and** in the UI (hide or upsell). Grace period when a plan expires, then read-only mode.
- SaaS billing: **start with manual invoicing / bank transfer / Raast, recorded by Super Admin** (Stripe does not onboard Pakistani merchants directly). Later: a local gateway (e.g. Safepay, PayFast, JazzCash, Easypaisa) for PKR and Paddle / Lemon Squeezy for international customers.
- Support tickets (tenant ↔ platform).
- Starter / Professional / Enterprise plans seeded as configurable data, not hard-coded.

**Done when:** a suspended or expired tenant loses access correctly, and plan limits are enforced in the database even when the API is called directly.

**Delivered:** platform console (/admin) with overview and MRR, restaurant
search and detail, approve / suspend / reactivate with audited reasons,
manual payments (bank, Raast, JazzCash, Easypaisa, cash) that extend the
paid period, trial extensions, plan builder (prices, limits, features,
trial plan), support inbox, platform settings (approval, grace period).
Restaurants: plan comparison and change requests, payment history, Help &
support, awaiting-approval / suspended screens, trial-ending and read-only
banners. Expired plans go read-only after the grace period (view and renew
only, no orders or payments, guests cannot order); kitchen display is gated
by plan. 41 new database tests. **Not done:** signing in _as_ a restaurant
(impersonation) needs a server-side function with the service-role key and
an audit trail; the read-only restaurant detail covers support for now.
Automatic card billing comes with the Phase 8 payment gateway.

---

## Phase 7 — Reports & analytics (≈1–2 weeks) ✅ Done

- SQL views / materialized views (refreshed with `pg_cron`) for daily, weekly and monthly sales, best-selling items, category revenue, branch comparison, waiter and staff performance, kitchen preparation times, waiter response times, payment-method breakdown, and feedback analytics.
- Recharts dashboards with date-range and branch filters.
- Export to Excel (SheetJS) and PDF.
- Profit & loss comes in Phase 9, once costs exist.

**Delivered:** one `sales_report` RPC computes the whole report in the
database (net sales, orders, average bill, tax, discounts, refunds,
cancellations, comparison with the previous period, every day in the range,
busiest hours, best sellers, categories, payment methods, order sources,
branch comparison, staff and kitchen speed, guest-request response times).
It is scoped to the branches the user may report on, needs the `reports`
plan feature, and is capped at a year per request. Business dates and hours
use the restaurant's time zone (also in the date presets). `dashboard_today`
feeds the Overview tiles. Reports page with presets and custom range, a
chart and table view for every chart, light/dark and phone layouts, Excel
(exceljs) and PDF (jsPDF) export loaded only when clicked.
**Moved:** materialized views and `pg_cron` are deferred until real data
volumes need them (the report runs on indexed tables today); feedback
analytics waits for feedback collection; Excel export uses exceljs instead
of SheetJS (SheetJS is no longer published to npm).

---

## Phase 8 — Pakistan integrations (≈2–3 weeks) ✅ Done (gateways need sandbox verification)

- **Digital payments:** JazzCash, Easypaisa, Raast QR, and a card gateway, with payments **verified by webhook in Edge Functions** (an order is never marked paid because the browser says so). An integration settings screen per tenant, with credentials stored server-side only.
- **WhatsApp:** Meta WhatsApp Cloud API for receipts, order-ready alerts and review links (needs Meta business verification and approved message templates — start that process early). Email receipts through Resend or a similar service.
- **Thermal printers:** ESC/POS through WebUSB / Web Serial where supported, plus an optional small local "print bridge" for LAN printers and automatic kitchen-ticket printing.
- **Tax authority integration:** FBR POS integration and provincial e-invoicing (PRA / SRB / KPRA) — many restaurant customers will need this to stay compliant, so treat it as a selling point.

**Delivered** (details in [INTEGRATIONS.md](INTEGRATIONS.md)): Settings →
Integrations with secrets stored server-side only; guests pay the bill link
(`/r/:token`, shared from the POS as QR / WhatsApp) through JazzCash or
Easypaisa, settled only by the server after verifying the gateway (signature
or status API), with idempotent callbacks, amount checks and late-payment
refund flags; Raast ID / IBAN shown on the bill link and confirmed at the
till; WhatsApp Cloud API receipts and order-ready messages through a
database outbox; direct ESC/POS printing over WebUSB / Web Serial (receipts
with QR, cash drawer, auto-printed kitchen tickets); FBR / PRA invoices in
the IMS format with the fiscal number and QR on the receipt and "send
again" in the POS. Server code runs as Vercel functions in `api/`.
**To verify before going live:** the JazzCash, Easypaisa, FBR and PRA
adapters were written from their published integration formats but not yet
run against the real sandboxes (they need merchant / POS registrations).
**Moved:** card gateway, review links and email receipts → Phase 10;
SRB / KPRA e-invoicing and credit notes for refunds → when a customer needs
them; the LAN print bridge → on demand (browser printing covers USB,
serial and Bluetooth).

---

## Phase 9 — Inventory, suppliers & costing (≈2–3 weeks) ✅ Done

**Tables:** `inventory_items`, `units`, `suppliers`, `purchases`,
`purchase_items`, `stock_movements`, `recipes`, `recipe_items`, `wastage`,
`expenses`.

- Raw materials, suppliers, purchase orders → goods received → stock.
- Recipes per product or variant; stock is deducted automatically when an order is served (one `stock_movements` row per item).
- Food costing and margin per item, low-stock alerts, wastage, stock adjustments and counts.
- Inventory reports, expenses → **profit & loss** report.

**Delivered:** Inventory page (Stock, Purchases, Recipes & costing,
Suppliers, Expenses). Stock is per branch and every change goes through a
`stock_movements` ledger that records its cost. Purchases are saved as
purchase orders and received later, or received at once; receiving updates
a moving-average cost per item. Recipes per dish, per size (overrides the
dish) and per add-on; ordering deducts the ingredients and cancelling puts
them back. Wastage with a reason, stock counts that record only the
differences, low-stock alerts on the Overview. Food cost and margin per dish
and size. Profit & loss on the Reports page: net sales − food cost −
wastage − count differences − expenses by category. All behind the plan's
`inventory` feature and the `inventory.view` / `inventory.manage`
permissions. The Overview setup checklist now ticks steps off from real data.
**Moved:** stock transfers between branches and supplier payments / ledgers
→ on demand; unit conversion (buy in kg, use in g) is handled by picking one
unit per item.

---

## Phase 10 — Online ordering, reservations & reviews (≈2 weeks) ✅ Done

- Ordering website per restaurant (`/o/:slug`, custom domain later): delivery or pickup, delivery zones and charges, guest checkout using phone number + OTP, order tracking, order history.
- Reservations: calendar, time slots, guest count, confirmation and cancellation (WhatsApp/SMS), reserved tables appear on the floor plan.
- Reviews: post-meal rating, Google review link, feedback dashboard.
- Customer CRM: visit history, retention metrics, basic loyalty (later).

**Delivered:** ordering website `/o/:slug` (branch, pickup or delivery,
delivery areas with fee / minimum / ETA, cart with sizes and add-ons, checkout
with name + mobile, notes) → orders arrive in Orders and the KDS marked
_Online_ with the customer and address; tracking page `/o/:slug/track/:token`
with progress and ETA, pay online from it when a gateway is on, recent orders
remembered on the device; delivery fee on the bill, receipt and POS.
Reservations: per-branch rules, public `/book/:slug` with live slot
availability by covers, `/res/:token` to view or cancel, staff day view with
confirm / seat / no-show / cancel and table assignment, bookings shown on the
floor plan, WhatsApp confirmation, new `reservations.manage` permission.
Reviews from the receipt link with the branch's Google review link for 4–5★,
and a Customers page (directory by phone with visits, spend and ratings,
new vs returning, feedback summary).
**Moved:** phone OTP at checkout needs an SMS / WhatsApp OTP sender — abuse
limits (orders in progress per number, orders per hour, bookings per number)
cover it until then; loyalty points and custom domains → later.

---

## Phase 11 — Hardening & scale (ongoing, focused 1–2 weeks before wider launch)

- Full RLS audit (pgTAP coverage on every table), Supabase security advisor, penetration test of public endpoints.
- Performance: indexes on `(tenant_id, branch_id, created_at)`, query plans, load test of `place_order` and realtime during a peak dinner rush.
- **Offline-capable POS:** queue orders and payments in IndexedDB during internet or power outages and sync them on reconnect (common in Pakistan — a major selling point).
- Backups: Supabase PITR, tested restore runbook. Monitoring with Sentry, uptime checks, log drains.
- Public API + webhooks for Enterprise customers. Documentation and onboarding videos.

---

## Per-phase checklist (repeat for every phase)

1. Migrations in `supabase/migrations` (never edit the database by hand).
2. RLS policies + pgTAP tests for every new table.
3. Frontend connected to the real Supabase backend (no mock data).
4. CRUD tested; permissions tested per role.
5. Realtime flows tested, including reconnection.
6. Playwright end-to-end test for the phase's main user journey.
7. CI green → staging deploy → manual QA → production.

## Timeline summary (one developer + AI assistance, rough)

| Phase   | Scope                                  | Est.          |
| ------- | -------------------------------------- | ------------- |
| 0       | Foundation                             | 1 wk          |
| 1       | DB, auth, tenancy, RBAC                | 2 wk          |
| 2       | Owner dashboard & menu                 | 2 wk          |
| 3       | Tables, QR, guest ordering             | 2–3 wk        |
| 4       | KDS & waiter app                       | 2 wk          |
| 5       | POS & split pay                        | 2–3 wk        |
| **MVP** | **Pilot launch**                       | **~11–13 wk** |
| 6       | Super Admin & subscriptions            | 2 wk          |
| 7       | Reports & analytics                    | 1–2 wk        |
| 8       | Pakistan integrations                  | 2–3 wk        |
| 9       | Inventory & costing                    | 2–3 wk        |
| 10      | Online ordering, reservations, reviews | 2 wk          |
| 11      | Hardening & scale                      | ongoing       |

## Changes from the original prompt (and why)

- **Super Admin moved after the MVP:** with your first few restaurants you can onboard them yourself. Selling comes sooner.
- **POS moved before inventory and reports:** restaurants won't pay without billing.
- **Security moved into every phase** instead of a final Phase 9.
- **`restaurants` table merged into `tenants`** to remove a redundant tenancy level.
- **Added:** guest-endpoint design, realtime Broadcast for guests, money in minor units, tax rates by payment method, FBR/PRA integration, offline POS, and a realistic SaaS billing path for Pakistan.
