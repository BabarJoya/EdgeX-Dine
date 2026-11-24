// Dinner-rush load test against a LOCAL stack (after seed-volume.sql):
//   node scripts/perf/load-test.mjs [tables=60] [ordersPerTable=3] [screens=10]
// 1. `tables` guests order at the same time through the public API
//    (place_guest_order), `ordersPerTable` orders each, back to back.
// 2. `screens` kitchen displays (signed in, realtime + RLS) listen for new
//    tickets; we measure how long each order takes to reach them.
// Checks: every order succeeds, order numbers stay unique, every screen sees
// every order.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const [TABLES = 60, PER = 3, SCREENS = 10] = process.argv.slice(2).map(Number)
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const URL = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const DB = process.env.TEST_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const sql = (q) =>
  execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-qtAc', q], { encoding: 'utf8' }).trim()

// --- Setup: tables, a kitchen user --------------------------------------------------------
const tenant = sql("select id from public.tenants where slug = 'perf-grill'")
if (!tenant) throw new Error('Run scripts/perf/seed-volume.sql first')
const branch = sql(
  `select id from public.branches where tenant_id = '${tenant}' and name = 'Clifton'`,
)
sql(`delete from public.tables where branch_id = '${branch}' and label like 'L%'`)
sql(
  `insert into public.tables (tenant_id, branch_id, label) select '${tenant}', '${branch}', 'L' || g from generate_series(1, ${TABLES}) g`,
)
const tokens = sql(
  `select string_agg(qr_token, ',' order by label) from public.tables where branch_id = '${branch}' and label like 'L%'`,
).split(',')
const products = sql(
  `select string_agg(id::text, ',') from public.products where tenant_id = '${tenant}'`,
).split(',')

const email = `kds.load.${Date.now()}@edgex.test`
const admin = await fetch(`${URL}/auth/v1/admin/users`, {
  method: 'POST',
  headers: {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ email, password: 'Load-test-123', email_confirm: true }),
}).then((r) => r.json())
sql(`insert into public.tenant_members (tenant_id, user_id, role_id, all_branches)
     select '${tenant}', '${admin.id}', id, true from public.roles where tenant_id = '${tenant}' and template_key = 'kitchen'`)

// --- Kitchen screens --------------------------------------------------------------------------
const placedAt = new Map() // order_id -> ms
const seen = [] // per screen: Map order_id -> latency
const screens = []
for (let s = 0; s < SCREENS; s++) {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: 'Load-test-123' })
  if (error) throw error
  await client.realtime.setAuth()
  const got = new Map()
  seen.push(got)
  await new Promise((resolve, reject) => {
    const ch = client
      .channel(`kds-load-${s}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'kitchen_tickets',
          filter: `branch_id=eq.${branch}`,
        },
        (p) => {
          got.set(p.new.order_id, Date.now())
        },
      )
      .subscribe((status) =>
        status === 'SUBSCRIBED'
          ? resolve()
          : status === 'CHANNEL_ERROR'
            ? reject(new Error(status))
            : null,
      )
    screens.push({ client, ch })
  })
}
await new Promise((r) => setTimeout(r, 1500))

// --- The rush --------------------------------------------------------------------------------
const latencies = []
let failures = 0
const order = async (token) => {
  const items = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => ({
    product_id: products[Math.floor(Math.random() * products.length)],
    quantity: 1 + Math.floor(Math.random() * 2),
  }))
  const t0 = Date.now()
  const r = await fetch(`${URL}/rest/v1/rpc/place_guest_order`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_table_token: token, p_items: items }),
  })
  const ms = Date.now() - t0
  if (!r.ok) {
    failures++
    console.error('order failed', r.status, await r.text())
    return
  }
  const body = await r.json()
  placedAt.set(body.order_id, t0 + ms)
  latencies.push(ms)
}
const started = Date.now()
await Promise.all(
  tokens.map(async (t) => {
    for (let i = 0; i < PER; i++) await order(t)
  }),
)
const wall = Date.now() - started
await new Promise((r) => setTimeout(r, Number(process.env.SETTLE_MS ?? 20000)))

// --- Results ----------------------------------------------------------------------------------
const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}
const delivery = []
let missed = 0
for (const got of seen)
  for (const [id, at] of placedAt) {
    const t = got.get(id)
    if (t === undefined) missed++
    else delivery.push(Math.max(0, t - at))
  }
const dupes = sql(
  `select count(*) from (select order_number from public.orders where branch_id = '${branch}' and business_date = (now() at time zone 'Asia/Karachi')::date group by order_number having count(*) > 1) x`,
)

console.log(
  JSON.stringify(
    {
      orders: {
        placed: latencies.length,
        failed: failures,
        wall_ms: wall,
        per_second: +(latencies.length / (wall / 1000)).toFixed(1),
        p50_ms: pct(latencies, 50),
        p95_ms: pct(latencies, 95),
        max_ms: Math.max(...latencies),
      },
      realtime: {
        screens: SCREENS,
        deliveries: delivery.length,
        missed,
        p50_ms: pct(delivery, 50),
        p95_ms: pct(delivery, 95),
        max_ms: Math.max(...delivery),
      },
      duplicate_order_numbers: Number(dupes),
    },
    null,
    2,
  ),
)
for (const { client } of screens) await client.removeAllChannels()
sql(`delete from public.tenant_members where user_id = '${admin.id}'`)
process.exit(failures || missed || Number(dupes) ? 1 : 0)
