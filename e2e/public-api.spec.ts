import { createHmac } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { asGuest, asUser, signUpOwner, sql } from './helpers.ts'

// Enterprise API: create a key and a webhook in Settings, place an order,
// receive a signed webhook, read the order back through /api/v1, revoke.
test.skip(({ isMobile }) => isMobile, 'Settings run on desktop')
test.setTimeout(120_000)

const run = Date.now().toString(36)

test('API key and signed webhooks', async ({ page, request }) => {
  await signUpOwner(page, {
    email: `api.${run}@test.edgex.pk`,
    restaurant: `API Grill ${run}`,
    slug: `apigrill-${run}`,
  })
  const api = await asUser(page)
  const [{ id: tenant }] = await api.get('tenants?select=id')
  const [{ id: branch }] = await api.get('branches?select=id')
  sql(
    `update public.subscriptions set plan_id = (select id from public.subscription_plans where code = 'enterprise') where tenant_id = '${tenant}'`,
  )
  const [cat] = await api.post('categories', { tenant_id: tenant, name: 'BBQ' })
  const tikka = await api.post('rpc/save_product', {
    p_product: {
      tenant_id: tenant,
      category_id: cat.id,
      name: 'Chicken Tikka',
      price_minor: 95000,
    },
  })
  const [t1] = await api.post('tables', { tenant_id: tenant, branch_id: branch, label: 'T1' })

  // --- Settings ---------------------------------------------------------------------------------
  await page.goto('/app/settings?tab=api')
  await page.getByLabel('Key name').fill('Accounting')
  await page.getByRole('button', { name: 'Create key' }).click()
  const key = (await page.getByTestId('secret-value').textContent())!.trim()
  expect(key).toMatch(/^edgx_/)
  await page.getByRole('button', { name: 'I have saved it' }).click()
  await expect(page.getByRole('cell', { name: `${key.slice(0, 12)}…` })).toBeVisible()

  await page.getByLabel('Endpoint URL').fill('https://webhook.test/edgex')
  await page.getByRole('button', { name: 'Add endpoint' }).click()
  const secret = (await page.getByTestId('secret-value').textContent())!.trim()
  expect(secret).toMatch(/^whsec_/)
  await page.getByRole('button', { name: 'I have saved it' }).click()
  await expect(page.getByTestId('webhook-endpoint')).toContainText('order.created')

  // --- An order arrives → signed webhook ---------------------------------------------------------
  const placed = await asGuest.rpc('place_guest_order', {
    p_table_token: t1.qr_token,
    p_items: [{ product_id: tikka, quantity: 2 }],
  })
  type Hook = { event: string; signature: string; body: string }
  const received = async () => {
    await request.post('/api/notify/flush')
    const all = (await (await request.get('/api/test/webhook-sink')).json()) as Hook[]
    return all.filter((h) => h.body.includes(placed.order_id))
  }
  await expect.poll(async () => (await received()).length).toBeGreaterThan(0)
  const [hook] = await received()
  expect(hook.event).toBe('order.created')
  const body = JSON.parse(hook.body)
  expect(body.data.order).toMatchObject({ id: placed.order_id, total_minor: 190000 })
  expect(body.data.order.items[0]).toMatchObject({ name: 'Chicken Tikka', quantity: 2 })
  // Verify the signature as a customer would.
  const [, t, v1] = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(hook.signature)!
  expect(createHmac('sha256', secret).update(`${t}.${hook.body}`).digest('hex')).toBe(v1)

  // --- Read it back through the API --------------------------------------------------------------
  const get = (path: string, k = key) =>
    request.get(`/api/v1/${path}`, { headers: { Authorization: `Bearer ${k}` } })
  expect((await get('orders', 'edgx_nope')).status()).toBe(401)
  expect((await request.get('/api/v1/orders')).status()).toBe(401)
  const orders = await get('orders')
  expect(orders.status()).toBe(200)
  expect(orders.headers()['x-ratelimit-remaining']).toBeDefined()
  expect((await orders.json()).data.map((o: { id: string }) => o.id)).toContain(placed.order_id)
  expect(await (await get(`orders/${placed.order_id}`)).json()).toMatchObject({
    number: placed.order_number,
    total_minor: 190000,
  })
  expect((await (await get('menu')).json()).products[0].name).toBe('Chicken Tikka')
  expect((await (await get('branches')).json())[0].id).toBe(branch)
  expect((await get('orders?from=2020-01-01&to=2026-12-31')).status()).toBe(400) // range too long
  expect((await get('sales')).status()).toBe(200)

  // --- Another restaurant's order is invisible ------------------------------------------------------
  expect((await get('orders/00000000-0000-0000-0000-000000000000')).status()).toBe(404)

  // --- Revoke ------------------------------------------------------------------------------------
  await page.getByRole('button', { name: 'Revoke' }).click()
  await expect(page.getByText('Key revoked')).toBeVisible()
  expect((await get('orders')).status()).toBe(401)
})
