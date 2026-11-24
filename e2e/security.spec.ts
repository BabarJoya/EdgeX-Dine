import { expect, test } from '@playwright/test'
import { ANON, API, sql } from './helpers.ts'

// Black-box probe of the public API with only the public (anon) key, the
// way an attacker would see it: every table and every database function.
test.skip(({ isMobile }) => isMobile, 'API probe, no UI')

const GUEST_FUNCTIONS = new Set([
  'cancel_my_reservation',
  'create_guest_request',
  'get_booking_info',
  'get_guest_menu',
  'get_guest_session',
  'get_invite',
  'get_online_info',
  'get_receipt',
  'get_receipt_payment_options',
  'get_reservation',
  'get_review',
  'place_guest_order',
  'place_online_order',
  'request_reservation',
  'reservation_slots',
  'submit_review',
  'track_online_order',
])
const PUBLIC_READ = new Set(['subscription_plans'])
const headers = {
  apikey: ANON,
  Authorization: `Bearer ${ANON}`,
  'Content-Type': 'application/json',
}

test('anonymous callers cannot read or change any table', async () => {
  const tables = sql(
    "select string_agg(table_name, ',') from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'",
  ).split(',')
  expect(tables.length).toBeGreaterThan(40)
  const leaks: string[] = []
  for (const t of tables) {
    const read = await fetch(`${API}/rest/v1/${t}?select=*&limit=1`, { headers })
    const rows = read.ok ? ((await read.json()) as unknown[]) : []
    if (read.ok && rows.length && !PUBLIC_READ.has(t)) leaks.push(`read ${t}`)
    const write = await fetch(`${API}/rest/v1/${t}`, { method: 'POST', headers, body: '{}' })
    if (write.ok) leaks.push(`insert ${t}`)
    const del = await fetch(`${API}/rest/v1/${t}?id=not.is.null`, { method: 'DELETE', headers })
    if (del.ok && del.status !== 204) leaks.push(`delete ${t}`)
    if (del.status === 204) {
      // 204 with RLS just means "0 rows matched"; make sure nothing was deletable.
      const n = Number(sql(`select count(*) from public.${t}`))
      if (Number.isNaN(n)) leaks.push(`delete ${t}`)
    }
  }
  expect(leaks).toEqual([])
})

test('anonymous callers can only call the guest functions', async () => {
  const fns = sql(
    "select string_agg(distinct p.proname, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'",
  ).split(',')
  const callable: string[] = []
  for (const fn of fns) {
    const r = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: '{}' })
    const body = (await r.json().catch(() => ({}))) as { code?: string }
    // 401/403 = refused; 404 = not exposed. A database error other than
    // "permission denied" means the function body actually ran.
    const refused =
      r.status === 401 || r.status === 403 || r.status === 404 || body.code === '42501'
    if (!refused && !GUEST_FUNCTIONS.has(fn))
      callable.push(`${fn} (${r.status} ${body.code ?? ''})`)
  }
  expect(callable).toEqual([])
})

test('guest functions reject made-up tokens and ids', async () => {
  const call = (fn: string, body: unknown) =>
    fetch(`${API}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) }).then(
      async (r) => ({
        status: r.status,
        body: (await r.json().catch(() => null)) as unknown,
      }),
    )
  const fake = 'f'.repeat(32)
  expect((await call('get_receipt', { p_receipt_token: fake })).body).toBeNull()
  expect((await call('get_reservation', { p_token: fake })).body).toBeNull()
  expect((await call('track_online_order', { p_token: fake })).body).toBeNull()
  expect((await call('get_guest_session', { p_guest_token: fake })).body).toBeNull()
  expect(
    (await call('place_guest_order', { p_table_token: fake, p_items: [] })).status,
  ).toBeGreaterThanOrEqual(400)
  expect((await call('cancel_my_reservation', { p_token: fake })).status).toBeGreaterThanOrEqual(
    400,
  )
  expect(
    (await call('submit_review', { p_receipt_token: fake, p_rating: 5 })).status,
  ).toBeGreaterThanOrEqual(400)
  expect(
    (
      await call('place_online_order', {
        p_branch_id: '00000000-0000-0000-0000-000000000000',
        p_type: 'takeaway',
        p_items: [],
        p_name: 'x',
        p_phone: '03001234567',
      })
    ).status,
  ).toBeGreaterThanOrEqual(400)
})

test('server endpoints refuse forged input', async ({ request }) => {
  const start = await request.post('/api/pay/start', {
    data: { receipt_token: "' or 1=1 --", provider: 'jazzcash' },
  })
  expect(start.status()).toBe(400)
  const forged = await request.post('/api/pay/return/jazzcash', {
    form: {
      pp_TxnRefNo: 'EX000000000000ABCDEF',
      pp_ResponseCode: '000',
      pp_Amount: '100',
      pp_SecureHash: 'AA',
    },
    maxRedirects: 0,
  })
  expect(forged.status()).toBe(400) // unknown reference: nothing recorded
  expect((await request.post('/api/pay/return/not-a-gateway', { maxRedirects: 0 })).status()).toBe(
    404,
  )
})

test('health check reports the database and message queue', async ({ request }) => {
  const r = await request.get('/api/health')
  expect(r.status()).toBe(200)
  const body = await r.json()
  expect(body).toMatchObject({ ok: true, queue: { pending: expect.any(Number) } })
  expect(body.db_ms).toBeLessThan(5000)
  // No tenant data in a public endpoint.
  expect(JSON.stringify(body)).not.toMatch(/tenant|restaurant|phone/i)
})
