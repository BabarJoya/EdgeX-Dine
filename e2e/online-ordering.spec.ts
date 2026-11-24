import { expect, test } from '@playwright/test'
import { asUser, signUpOwner } from './helpers.ts'

// Online ordering: settings with a delivery area, a guest orders delivery
// from the website, the restaurant sees it with the address and moves it
// along, and the guest's tracking page follows.
test.skip(({ isMobile }) => isMobile, 'Back office on desktop; the guest uses a phone context')
test.setTimeout(120_000)

const run = Date.now().toString(36)
const slug = `ordergrill-${run}`

test('guest orders delivery online; restaurant prepares it; tracking follows', async ({
  page,
  browser,
}) => {
  await signUpOwner(page, {
    email: `online.${run}@test.edgex.pk`,
    restaurant: `Order Grill ${run}`,
    slug,
  })
  const api = await asUser(page)
  const [{ id: tenant }] = await api.get('tenants?select=id')
  const [cat] = await api.post('categories', { tenant_id: tenant, name: 'BBQ' })
  await api.post('rpc/save_product', {
    p_product: {
      tenant_id: tenant,
      category_id: cat.id,
      name: 'Chicken Tikka',
      price_minor: 95000,
    },
  })
  await api.post('rpc/save_product', {
    p_product: { tenant_id: tenant, category_id: cat.id, name: 'Mint Lassi', price_minor: 35000 },
  })

  // --- Settings ---------------------------------------------------------------------------------
  await page.goto('/app/settings?tab=online')
  await page.getByRole('switch', { name: 'Take online orders' }).click()
  await page.getByRole('switch', { name: 'Delivery' }).click()
  await page.getByRole('button', { name: 'Add area' }).click()
  await page.getByLabel('Area 1').fill('DHA Phase 6')
  await page.getByLabel('Fee 1').fill('150')
  await page.getByLabel('Minimum 1').fill('1000')
  await page.getByLabel('Minutes 1').fill('40')
  await page.getByRole('button', { name: 'Save online ordering' }).click()
  await expect(page.getByText('Online ordering saved')).toBeVisible()
  await expect(page.getByTestId('order-link')).toHaveText(new RegExp(`/o/${slug}$`))

  // --- Guest orders on a phone -------------------------------------------------------------------
  const ctx = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 390, height: 844 },
  })
  const g = await ctx.newPage()
  await g.goto(`/o/${slug}`)
  await g.getByRole('radio', { name: 'Delivery' }).click()
  await g.getByLabel('Deliver to').selectOption({ label: 'DHA Phase 6 · Rs 150 · ~40 min' })
  await g.getByRole('button', { name: /Mint Lassi/ }).click()
  await g.getByRole('button', { name: /Add to order/ }).click()
  await g.getByRole('button', { name: /Checkout/ }).click()
  await expect(g.getByText('The minimum order is Rs 1,000.')).toBeVisible()
  await g.keyboard.press('Escape')
  await g.getByRole('button', { name: /Chicken Tikka/ }).click()
  await g.getByRole('button', { name: /Add to order/ }).click()
  await g.getByRole('button', { name: /Checkout/ }).click()
  await expect(g.getByTestId('checkout-total')).toHaveText('Rs 1,450') // 950 + 350 + 150 delivery
  await g.getByLabel('Your name').fill('Hamza')
  await g.getByLabel('Mobile number').fill('0300 1234567')
  await g.getByLabel('Delivery address').fill('House 12, Street 4, DHA Phase 6')
  await g.getByLabel(/Notes for the restaurant/).fill('Ring the bell')
  await g.getByRole('button', { name: /Place order/ }).click()
  await expect(g.getByRole('heading', { name: /Order #\d+/ })).toBeVisible()
  await expect(g.getByTestId('track-status').locator('[aria-current="step"]')).toHaveText(
    /Order received/,
  )
  await expect(g.getByText('Expected around')).toBeVisible()

  // --- Restaurant ----------------------------------------------------------------------------------
  await page.goto('/app/orders')
  const card = page.getByTestId('order-customer').first()
  await expect(card).toContainText('Hamza')
  await expect(card).toContainText('DHA Phase 6 · House 12, Street 4, DHA Phase 6')
  await expect(page.getByText('Online', { exact: true }).first()).toBeVisible()
  const [order] = await api.get('orders?select=id,notes&source=eq.online')
  expect(order.notes).toBe('Ring the bell')
  await api.post('rpc/update_order_status', { p_order_id: order.id, p_status: 'accepted' })
  await api.post('rpc/update_order_status', { p_order_id: order.id, p_status: 'ready' })

  await g.reload()
  await expect(g.getByTestId('track-status').locator('[aria-current="step"]')).toHaveText(
    /On the way/,
  )

  // The bill includes the delivery fee; the receipt shows it.
  await g.getByRole('link', { name: 'View bill' }).click()
  await expect(g.getByText('Delivery', { exact: true })).toBeVisible()
  await expect(g.getByText('Deliver to: House 12, Street 4, DHA Phase 6')).toBeVisible()

  // The device remembers the order.
  await g.goto(`/o/${slug}`)
  await expect(g.getByText('Your recent orders:')).toBeVisible()
})
