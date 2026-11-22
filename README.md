# EdgeX Restaurant ERP

Multi-tenant restaurant management SaaS: QR ordering, kitchen display, waiter app,
POS with split payments, and multi-branch management.

- **Plan:** [docs/ROADMAP.md](docs/ROADMAP.md)
- **Status:** Phases 0–8 complete — QR ordering, kitchen display, waiter app, POS with split payments, cashier shifts, subscriptions, support, sales reports, and Pakistan integrations (JazzCash / Easypaisa bill payment, Raast, WhatsApp, thermal printers, FBR / PRA invoices). Phase 9 (inventory and costing) next.
- **Going live:** [docs/SETUP.md](docs/SETUP.md) — connect Supabase and deploy to Vercel.

## Stack

React 19 + Vite + TypeScript · Tailwind CSS v4 · shadcn/ui-style components (Radix) ·
TanStack Query · React Router · Supabase (Postgres, Auth, Realtime, Storage) · Vercel · PWA.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase URL + anon key
npm run dev                  # http://localhost:5173
```

Local database (requires Docker):

```bash
npm run db:start   # starts Supabase locally and prints the anon key
npm run db:reset   # re-applies migrations + seed
npm run db:test    # 353 pgTAP tests (RLS, tenant isolation, menu, ordering, kitchen, billing, platform, reports, integrations)
npm run db:types   # regenerate src/lib/database.types.ts
```

## Scripts

| Command                                 | What it does                                       |
| --------------------------------------- | -------------------------------------------------- |
| `npm run dev`                           | Dev server                                         |
| `npm run build`                         | Typecheck + production build (with service worker) |
| `npm run lint` / `typecheck` / `format` | Code quality                                       |
| `npm test`                              | Unit tests (Vitest)                                |
| `npm run test:e2e`                      | End-to-end tests (Playwright, desktop + mobile)    |

## App areas

| Path                      | Who                          | Notes                                 |
| ------------------------- | ---------------------------- | ------------------------------------- |
| `/app/*`                  | Owner, managers              | Back office with sidebar              |
| `/pos`, `/kds`, `/waiter` | Station devices              | Full-screen, touch-first              |
| `/m/:slug`                | Guests (QR)                  | Mobile-first, kept lightweight        |
| `/admin`                  | EdgeX team (platform admins) | Restaurants, plans, payments, support |
| `/design`                 | Developers                   | Live design-system reference          |

## Design system

Defined in `src/styles/globals.css`. Deep navy for brand and primary actions,
digital blue for links / focus / selection, golden amber only for things that
need attention, warm paper neutrals, IBM Plex Sans with tabular numbers.
No gradients or glow effects. All text/background pairs meet WCAG AA
contrast (4.5:1) in light and dark mode.

## Security rules

- Only the Supabase **anon** key is ever used in the browser. The service-role
  key lives only in Edge Functions / CI secrets.
- Every table has Row Level Security; `tenant_id` is never trusted from the client.
- Guests (QR) never write to tables directly — only through validated RPCs.

## Deployment (Vercel)

Import the repo in Vercel; `vercel.json` sets the build, SPA rewrites and
security headers. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as
environment variables (separate Supabase projects for Preview and Production).
