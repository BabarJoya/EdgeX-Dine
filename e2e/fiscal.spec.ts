import { expect, test } from '@playwright/test'
import { asUser, signUpOwner } from './helpers.ts'

// Tax-authority invoices: a paid bill is reported, a rejection is visible and
// can be sent again, and the fiscal number + QR appear on the receipt.
test.skip(({ isMobile }) => isMobile, 'Settings run on desktop')
test.setTimeout(90_000)

const run = Date.now().toString(36)

test('paid bill gets a PRA fiscal invoice number on its receipt', async ({ page, request }) => {
  await signUpOwner(page, {
    email: `fiscal.${run}@test.edgex.pk`,
    restaurant: `Tax Grill ${run}`,
    slug: `taxgrill-${run}`,
  })

  await page.goto('/app/settings?tab=integrations')
  const tax = page.getByRole('region', { name: 'Tax authority (FBR / PRA)' })
  await tax.getByLabel('Authority', { exact: true }).selectOption('pra')
  await tax.getByLabel('POS ID').fill('812345')
  await tax.getByLabel('Access token').fill('wrong-token')
  await tax.getByRole('switch', { name: 'Use Tax authority (FBR / PRA)' }).click()
  await tax.getByRole('button', { name: 'Save Tax authority (FBR / PRA)' }).click()
  await expect(page.getByText('Tax authority (FBR / PRA) saved')).toBeVisible()

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
  })
  await api.post('rpc/take_payment', {
    p_bill_id: order.bill_id,
    p_method: 'cash',
    p_base_minor: 190000,
  })
  const bill = async () =>
    (
      await api.get(
        `bills?select=fiscal_status,fiscal_error,fiscal_invoice_number,receipt_token&id=eq.${order.bill_id}`,
      )
    )[0]

  // Wrong token: retried until it gives up (auth errors are retried a few times).
  await expect
    .poll(async () => (await request.post('/api/notify/flush'), (await bill()).fiscal_status), {
      timeout: 30_000,
    })
    .toBe('failed')
  expect((await bill()).fiscal_error).toContain('Unauthorized')

  // Fix the token, send again.
  await tax.getByLabel('Access token').fill('test-fiscal')
  await tax.getByRole('button', { name: 'Save Tax authority (FBR / PRA)' }).click()
  await expect(page.getByText('Tax authority (FBR / PRA) saved').last()).toBeVisible()
  await api.post('rpc/retry_fiscal_invoice', { p_bill_id: order.bill_id })
  await expect
    .poll(async () => (await request.post('/api/notify/flush'), (await bill()).fiscal_status))
    .toBe('done')
  const { fiscal_invoice_number: number, receipt_token: token } = await bill()
  expect(number).toMatch(/^TEST\d{6}/)

  await page.goto(`/r/${token}`)
  const fiscal = page.getByTestId('fiscal')
  await expect(fiscal).toContainText('PRA Invoice No.')
  await expect(fiscal).toContainText(number)
  await expect(fiscal.getByRole('img', { name: 'PRA invoice QR code' })).toBeVisible()
})
