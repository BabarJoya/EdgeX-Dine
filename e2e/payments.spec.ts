import { expect, test } from '@playwright/test'
import { asGuest, asUser, signUpOwner } from './helpers.ts'

// Online payment of a bill link: Raast details, gateway credentials stored
// server-side, a declined then an approved payment through the test gateway,
// and a forged callback that must not mark anything paid.
test.skip(({ isMobile }) => isMobile, 'Settings run on desktop; the guest side is a phone page')
test.setTimeout(120_000)

const run = Date.now().toString(36)

test('guest pays a bill link online; forged callbacks are ignored', async ({
  page,
  browser,
  request,
}) => {
  await signUpOwner(page, {
    email: `pay.${run}@test.edgex.pk`,
    restaurant: `Pay Grill ${run}`,
    slug: `paygrill-${run}`,
  })

  // --- Settings → Integrations ---------------------------------------------------
  await page.goto('/app/settings?tab=integrations')
  const raast = page.getByRole('region', { name: 'Raast / bank transfer' })
  await raast.getByLabel('Raast ID').fill('03001234567')
  await raast.getByLabel('IBAN').fill('PK36MEZN0000001123456702')
  await raast.getByLabel('Account title').fill('Pay Grill')
  await raast.getByRole('switch', { name: 'Use Raast / bank transfer' }).click()
  await raast.getByRole('button', { name: 'Save Raast / bank transfer' }).click()
  await expect(page.getByText('Raast / bank transfer saved')).toBeVisible()

  const jc = page.getByRole('region', { name: 'JazzCash' })
  await jc.getByRole('switch', { name: 'Use JazzCash' }).click()
  await jc.getByRole('button', { name: 'Save JazzCash' }).click()
  await expect(page.getByText('Add the credentials before turning this on')).toBeVisible()
  await jc.getByLabel('Merchant ID').fill('MC12345')
  await jc.getByLabel('Password').fill('secret-pass')
  await jc.getByLabel('Integrity salt').fill('secret-salt')
  await jc.getByRole('button', { name: 'Save JazzCash' }).click()
  await expect(page.getByText('JazzCash saved')).toBeVisible()
  await expect(jc.getByLabel('Integrity salt')).toHaveAttribute('placeholder', /Saved/)
  await expect(jc.getByLabel('Integrity salt')).toHaveValue('')

  // The secret never comes back to the browser.
  const api = await asUser(page)
  const rows = await api.get('tenant_integrations?select=*')
  expect(JSON.stringify(rows)).not.toContain('secret-salt')

  // --- A table bill of Rs 2,000 -----------------------------------------------------
  const [{ id: tenant }] = await api.get('tenants?select=id')
  const [{ id: branch }] = await api.get('branches?select=id')
  const [cat] = await api.post('categories', { tenant_id: tenant, name: 'Main' })
  const tikka = await api.post('rpc/save_product', {
    p_product: { tenant_id: tenant, category_id: cat.id, name: 'Tikka', price_minor: 100000 },
  })
  const [t1] = await api.post('tables', { tenant_id: tenant, branch_id: branch, label: 'T1' })
  await asGuest.rpc('place_guest_order', {
    p_table_token: t1.qr_token,
    p_items: [{ product_id: tikka, quantity: 2 }],
  })
  const [session] = await api.get(`table_sessions?select=id&table_id=eq.${t1.id}`)
  const billId = await api.post('rpc/open_table_bill', { p_session_id: session.id })
  const [{ receipt_token: token }] = await api.get(`bills?select=receipt_token&id=eq.${billId}`)

  // --- Guest opens the bill link on their phone --------------------------------------
  const ctx = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 390, height: 844 },
  })
  const guest = await ctx.newPage()
  await guest.goto(`/r/${token}`)
  await expect(guest.getByTestId('amount-due')).toHaveText('Rs 2,000')
  await expect(guest.getByText('03001234567')).toBeVisible()
  await expect(guest.getByRole('button', { name: 'Pay with JazzCash' })).toBeVisible()

  // A forged "approved" callback is rejected and records nothing.
  await guest.getByRole('button', { name: 'Pay with Test gateway' }).click()
  await expect(guest.getByRole('heading', { name: /Pay Rs 2,000/ })).toBeVisible()
  const ref = await guest.locator('input[name=ref]').first().inputValue()
  const forged = await request.post('/api/pay/return/test_gateway', {
    form: { ref, amount: '200000', result: 'approved', sig: 'f'.repeat(64) },
    maxRedirects: 0,
  })
  expect(forged.status()).toBe(303)
  expect(forged.headers().location).toContain('payment=error')
  expect((await api.get(`bills?select=status&id=eq.${billId}`))[0].status).toBe('open')

  // Declined → nothing charged, can try again.
  await guest.getByRole('button', { name: 'Decline' }).click()
  await expect(guest.getByText('The payment did not go through')).toBeVisible()
  await expect(guest.getByText('NOT PAID')).toBeVisible()

  // Approved → bill paid, receipt names the gateway.
  await guest.getByRole('button', { name: 'Pay with Test gateway' }).click()
  await guest.getByRole('button', { name: 'Approve payment' }).click()
  await expect(guest.getByText('Payment received. Thank you!')).toBeVisible()
  await expect(guest.getByText('Paid · Test gateway')).toBeVisible()
  await expect(guest.getByText('NOT PAID')).toHaveCount(0)
  await expect(guest.getByTestId('amount-due')).toHaveCount(0)

  const [bill] = await api.get(`bills?select=status,paid_total_minor&id=eq.${billId}`)
  expect(bill).toEqual({ status: 'paid', paid_total_minor: 200000 })

  // Replaying the approval changes nothing.
  const replay = await request.post('/api/pay/return/test_gateway', {
    form: { ref, amount: '200000', result: 'approved', sig: 'f'.repeat(64) },
    maxRedirects: 0,
  })
  expect(replay.headers().location).toContain('payment=')
  expect((await api.get(`payments?select=id&bill_id=eq.${billId}`)).length).toBe(1)
})
