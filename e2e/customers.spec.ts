import { expect, test } from '@playwright/test'
import { asUser, signUpOwner } from './helpers.ts'

// Reviews from the receipt link (Google link for happy guests) and the
// customer directory built from bill phone numbers.
test.skip(({ isMobile }) => isMobile, 'Back office runs on desktop; guests use a phone context')
test.setTimeout(120_000)

const run = Date.now().toString(36)

test('guests review their meal; owner sees customers and feedback', async ({ page, browser }) => {
  await signUpOwner(page, {
    email: `crm.${run}@test.edgex.pk`,
    restaurant: `Review Grill ${run}`,
    slug: `reviewgrill-${run}`,
  })

  await page.goto('/app/settings?tab=billing')
  await page.getByLabel('Google review link').fill('https://g.page/r/review-grill/review')
  await page.getByRole('button', { name: 'Save billing settings' }).click()
  await expect(page.getByText('Billing settings saved')).toBeVisible()

  const api = await asUser(page)
  const [{ id: tenant }] = await api.get('tenants?select=id')
  const [{ id: branch }] = await api.get('branches?select=id')
  const [cat] = await api.post('categories', { tenant_id: tenant, name: 'BBQ' })
  const tikka = await api.post('rpc/save_product', {
    p_product: {
      tenant_id: tenant,
      category_id: cat.id,
      name: 'Chicken Tikka',
      price_minor: 95000,
    },
  })
  await api.post('rpc/open_shift', { p_branch_id: branch, p_opening_float_minor: 0 })
  const sale = async (name: string, phone: string, qty: number) => {
    const o = await api.post('rpc/create_counter_order', {
      p_branch_id: branch,
      p_type: 'takeaway',
      p_items: [{ product_id: tikka, quantity: qty }],
      p_customer_name: name,
      p_customer_phone: phone,
    })
    await api.post('rpc/take_payment', {
      p_bill_id: o.bill_id,
      p_method: 'cash',
      p_base_minor: 95000 * qty,
    })
    return (await api.get(`bills?select=receipt_token&id=eq.${o.bill_id}`))[0]
      .receipt_token as string
  }
  const hamza1 = await sale('Hamza', '0300 1234567', 2)
  await sale('Hamza', '+923001234567', 1)
  const sana = await sale('Sana', '0321 7654321', 1)

  // --- Guests on their phones ------------------------------------------------------------
  const phone = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 390, height: 844 },
  })
  const g = await phone.newPage()
  await g.goto(`/r/${hamza1}`)
  await g.getByRole('radio', { name: '5 stars' }).click()
  await g.getByLabel('Tell us more (optional)').fill('Best tikka in town')
  await g.getByRole('button', { name: 'Send feedback' }).click()
  await expect(g.getByText('Thanks for your feedback')).toBeVisible()
  await expect(g.getByRole('link', { name: /Review us on Google/ })).toHaveAttribute(
    'href',
    'https://g.page/r/review-grill/review',
  )

  await g.goto(`/r/${sana}`)
  await g.getByRole('radio', { name: '2 stars' }).click()
  await g.getByLabel('Tell us more (optional)').fill('Naan was cold')
  await g.getByRole('button', { name: 'Send feedback' }).click()
  await expect(g.getByText('Thanks for your feedback')).toBeVisible()
  await expect(g.getByRole('link', { name: /Review us on Google/ })).toHaveCount(0)

  // --- Owner ---------------------------------------------------------------------------------
  await page.goto('/app/customers')
  await expect(page.getByTestId('kpi-Customers')).toContainText('2')
  await expect(page.getByTestId('kpi-New')).toContainText('2')
  await expect(page.getByTestId('kpi-Avg. rating')).toContainText('3.5')
  const hamza = page.getByRole('row', { name: /Hamza/ })
  await expect(hamza).toContainText('Rs 2,850')
  await expect(hamza.getByRole('cell').nth(1)).toHaveText('2')

  await page.getByLabel('Search customers').fill('0321')
  await page.getByLabel('Search customers').press('Enter')
  await expect(page.getByRole('row', { name: /Hamza/ })).toHaveCount(0)
  await expect(page.getByRole('row', { name: /Sana/ })).toBeVisible()

  await page.getByRole('row', { name: /Sana/ }).click()
  const visits = page.getByRole('list', { name: 'Visit history' })
  await expect(visits).toContainText('1× Chicken Tikka')
  await expect(visits).toContainText('Naan was cold')
  await page.keyboard.press('Escape')

  await page.getByRole('tab', { name: 'Feedback' }).click()
  await expect(page.getByLabel('Recent reviews')).toContainText('Best tikka in town')
  await expect(page.getByLabel('Recent reviews')).toContainText('Naan was cold')
})
