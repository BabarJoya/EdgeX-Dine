import { expect, test } from '@playwright/test'
import { asUser, signUpOwner } from './helpers.ts'

// WhatsApp Cloud API: receipts and order-ready messages are queued by the
// database and sent by the server (against a local stand-in for Meta's API).
test.skip(({ isMobile }) => isMobile, 'Settings run on desktop')
test.setTimeout(90_000)

const run = Date.now().toString(36)
const phone = `0300${String(Date.now()).slice(-7)}`
const intl = `92${phone.slice(1)}`

type Sent = {
  path: string
  body: { to: string; template: { name: string; components: { parameters: { text: string }[] }[] } }
}

test('paid takeaway gets a WhatsApp receipt, then an order-ready message', async ({
  page,
  request,
}) => {
  await signUpOwner(page, {
    email: `wa.${run}@test.edgex.pk`,
    restaurant: `WA Grill ${run}`,
    slug: `wagrill-${run}`,
  })

  await page.goto('/app/settings?tab=integrations')
  const wa = page.getByRole('region', { name: 'WhatsApp' })
  await wa.getByLabel('Phone number ID').fill('1098765')
  await wa.getByLabel('Access token').fill('test-token')
  await wa.getByRole('switch', { name: 'Use WhatsApp' }).click()
  await wa.getByRole('button', { name: 'Save WhatsApp' }).click()
  await expect(page.getByText('WhatsApp saved')).toBeVisible()

  const api = await asUser(page)
  const [{ id: tenant }] = await api.get('tenants?select=id')
  const [{ id: branch }] = await api.get('branches?select=id')
  const [cat] = await api.post('categories', { tenant_id: tenant, name: 'BBQ' })
  const tikka = await api.post('rpc/save_product', {
    p_product: { tenant_id: tenant, category_id: cat.id, name: 'Tikka', price_minor: 95000 },
  })
  await api.post('rpc/open_shift', { p_branch_id: branch, p_opening_float_minor: 0 })
  const order = await api.post('rpc/create_counter_order', {
    p_branch_id: branch,
    p_type: 'takeaway',
    p_items: [{ product_id: tikka, quantity: 2 }],
    p_customer_name: 'Hamza',
    p_customer_phone: phone,
  })
  await api.post('rpc/take_payment', {
    p_bill_id: order.bill_id,
    p_method: 'cash',
    p_base_minor: 190000,
  })

  const sentTo = async () => {
    await request.post('/api/notify/flush')
    const all = (await (await request.get('/api/test/whatsapp')).json()) as Sent[]
    return all.filter((m) => m.body.to === intl)
  }
  await expect.poll(async () => (await sentTo()).length).toBe(1)
  const [receipt] = await sentTo()
  expect(receipt.path).toBe('/api/test/whatsapp/1098765/messages')
  expect(receipt.body.template.name).toBe('edgex_receipt')
  const params = receipt.body.template.components[0].parameters.map((p) => p.text)
  expect(params[0]).toBe(`WA Grill ${run}`)
  expect(params[2]).toBe('Rs 1,900')
  expect(params[3]).toMatch(/\/r\/[0-9a-f]{32}$/)

  // Ready for pickup.
  await api.post('rpc/update_order_status', { p_order_id: order.order_id, p_status: 'accepted' })
  await api.post('rpc/update_order_status', { p_order_id: order.order_id, p_status: 'ready' })
  await expect.poll(async () => (await sentTo()).length).toBe(2)
  const ready = (await sentTo())[1]
  expect(ready.body.template.name).toBe('edgex_order_ready')

  // Sent messages are logged and never re-sent.
  const log = await api.get(
    'message_outbox?select=kind,status,provider_message_id&order=created_at',
  )
  expect(log.map((m: { status: string }) => m.status)).toEqual(['sent', 'sent'])
  expect((await sentTo()).length).toBe(2)
})
