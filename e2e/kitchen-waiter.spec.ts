import { expect, test } from '@playwright/test'
import { asGuest, asUser, signUpOwner } from './helpers.ts'

// Kitchen display + waiter app, driven like a real service.
test.skip(
  ({ isMobile }) => isMobile,
  'Runs once on desktop; the waiter view is checked at phone size inside',
)
test.setTimeout(120_000)

const run = Date.now().toString(36)

test('kitchen bumps station tickets, waiter serves, takes an order and moves a table', async ({
  page,
}) => {
  await signUpOwner(page, {
    email: `kds.${run}@test.edgex.pk`,
    restaurant: `Kitchen ${run}`,
    slug: `kitchen-${run}`,
  })
  const api = await asUser(page)
  const [{ id: tenant }] = await api.get('tenants?select=id')
  const [{ id: branch }] = await api.get('branches?select=id')
  const [grill] = await api.post('kitchen_stations', {
    tenant_id: tenant,
    name: 'Grill',
    sort_order: 1,
  })
  const [drinks] = await api.post('kitchen_stations', {
    tenant_id: tenant,
    name: 'Drinks',
    sort_order: 2,
  })
  const [cat] = await api.post('categories', { tenant_id: tenant, name: 'Main' })
  const tikka = await api.post('rpc/save_product', {
    p_product: {
      tenant_id: tenant,
      category_id: cat.id,
      name: 'Chicken Tikka',
      price_minor: 50000,
      kitchen_station_id: grill.id,
    },
  })
  const lassi = await api.post('rpc/save_product', {
    p_product: {
      tenant_id: tenant,
      category_id: cat.id,
      name: 'Lassi',
      price_minor: 20000,
      kitchen_station_id: drinks.id,
    },
  })
  await api.post(
    'tables',
    ['T1', 'T2', 'T3'].map((label, i) => ({
      tenant_id: tenant,
      branch_id: branch,
      label,
      pos_x: i * 200,
    })),
  )
  const [t1] = await api.get('tables?select=qr_token&label=eq.T1')

  // A guest orders food + a drink from T1.
  await asGuest.rpc('place_guest_order', {
    p_table_token: t1.qr_token,
    p_items: [
      { product_id: tikka, quantity: 2, notes: 'Well done' },
      { product_id: lassi, quantity: 1 },
    ],
  })

  // --- Kitchen display ------------------------------------------------------------
  await page.goto('/kds')
  await expect(page.getByTestId('ticket-1')).toHaveCount(2) // one per station
  await page.getByRole('button', { name: /^Grill/ }).click()
  const grillTicket = page.getByTestId('ticket-1')
  await expect(grillTicket).toHaveCount(1)
  await expect(grillTicket).toContainText('2× Chicken Tikka')
  await expect(grillTicket).toContainText('Well done')
  await expect(grillTicket).not.toContainText('Lassi')
  await grillTicket.getByRole('button', { name: 'Accept' }).click()
  await grillTicket.getByRole('button', { name: 'Start' }).click()
  await grillTicket.getByRole('button', { name: 'Ready', exact: true }).click()
  await expect(page.getByTestId('ticket-1')).toHaveCount(0)

  await page.getByRole('button', { name: /^Drinks/ }).click()
  await page.getByTestId('ticket-1').getByRole('button', { name: 'Ready', exact: true }).click()
  await expect(page.getByText(/Ready in the last 30 min · 1/)).toBeVisible()

  // --- Waiter app on a phone-sized screen ------------------------------------------
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/waiter')
  await page.getByRole('button', { name: /Ready/ }).click()
  await expect(page.getByText('2× Chicken Tikka')).toBeVisible()
  await page.getByRole('button', { name: 'Mark served' }).click()
  await expect(page.getByText('Nothing waiting at the pass')).toBeVisible()

  // Waiter takes an order for T2.
  await page.getByRole('button', { name: 'Tables' }).click()
  await page.getByRole('button', { name: /^Table T2,/ }).click()
  await page.getByRole('button', { name: 'Add order' }).click()
  await page.getByRole('button', { name: /^Lassi/ }).click()
  await page.getByRole('button', { name: /Add to order/ }).click()
  await page.getByRole('button', { name: /Review · 1 item/ }).click()
  await page.getByLabel('Note for the kitchen').fill('No ice')
  await page.getByRole('button', { name: /Send to kitchen/ }).click()
  await expect(page.getByText('Order #2 sent to the kitchen')).toBeVisible()
  await expect(page.getByTestId('waiter-order-2')).toContainText('Lassi')

  // Move T2's guests to T3.
  await page.getByRole('button', { name: 'Move' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'T3', exact: true }).click()
  await page.getByRole('button', { name: 'Move guests' }).click()
  await expect(page.getByText('Guests moved from T2 to T3')).toBeVisible()
  await page.getByRole('button', { name: 'Back to tables' }).click()
  await expect(page.getByRole('button', { name: /^Table T3, Occupied/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Table T2, Cleaning/ })).toBeVisible()

  // The kitchen sees the waiter's order on the drinks screen, with the note.
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/kds')
  await page.getByRole('button', { name: /^Drinks/ }).click()
  await expect(page.getByTestId('ticket-2')).toContainText('No ice')
  await expect(page.getByTestId('ticket-2')).toContainText('T3')
})
