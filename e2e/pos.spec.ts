import { expect, test } from '@playwright/test'
import { asGuest, asUser, signUpOwner } from './helpers.ts'

// A day at the till: taxes by method, PIN unlock, shift, discount, split
// cash/card payment, receipt, takeaway and shift close.
test.skip(({ isMobile }) => isMobile, 'POS is a tablet/desktop screen')
test.setTimeout(120_000)

const run = Date.now().toString(36)

test('cashier bills a table with a cash/card split, a takeaway, and closes the shift', async ({
  page,
  context,
}) => {
  await signUpOwner(page, {
    email: `pos.${run}@test.edgex.pk`,
    restaurant: `Till ${run}`,
    slug: `till-${run}`,
  })

  // --- Billing settings: PRA-style 16% cash / 5% card, 10% service ------------
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('tab', { name: 'Billing & tax' }).click()
  await page.getByLabel('Tax name on receipts').fill('PRA Sales Tax')
  await page.getByLabel('Tax · cash').fill('16')
  await page.getByLabel('Tax · card').fill('5')
  await page.getByLabel('Service charge').fill('10')
  await page.getByRole('button', { name: 'Save billing settings' }).click()
  await expect(page.getByText('Billing settings saved')).toBeVisible()

  // --- Menu, table and a guest order (Rs 2,200) --------------------------------
  const api = await asUser(page)
  const [{ id: tenant }] = await api.get('tenants?select=id')
  const [{ id: branch }] = await api.get('branches?select=id')
  const [cat] = await api.post('categories', { tenant_id: tenant, name: 'Main' })
  const tikka = await api.post('rpc/save_product', {
    p_product: { tenant_id: tenant, category_id: cat.id, name: 'Tikka', price_minor: 100000 },
  })
  await api.post('rpc/save_product', {
    p_product: { tenant_id: tenant, category_id: cat.id, name: 'Lassi', price_minor: 20000 },
  })
  const [t1] = await api.post('tables', { tenant_id: tenant, branch_id: branch, label: 'T1' })
  const lassi = (await api.get('products?select=id&name=eq.Lassi'))[0].id
  await asGuest.rpc('place_guest_order', {
    p_table_token: t1.qr_token,
    p_items: [
      { product_id: tikka, quantity: 2 },
      { product_id: lassi, quantity: 1 },
    ],
  })

  // --- Set a PIN, unlock the till with it, open a shift -------------------------
  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Set POS PIN' }).click()
  await page.getByLabel('New PIN').fill('482913')
  await page.getByLabel('Confirm PIN').fill('482913')
  await page.getByRole('button', { name: 'Save PIN' }).click()
  await expect(page.getByText('PIN saved')).toBeVisible()

  await page.goto('/pos')
  await expect(page.getByRole('heading', { name: "Who's on the till?" })).toBeVisible()
  for (const d of '482910') await page.getByRole('button', { name: d, exact: true }).click()
  await expect(page.getByText('Wrong PIN')).toBeVisible()
  for (const d of '482913') await page.getByRole('button', { name: d, exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Start your shift' })).toBeVisible()
  await page.getByLabel('Opening cash (float)').fill('5000')
  await page.getByRole('button', { name: 'Open shift' }).click()

  // --- Table bill: 2,200 + 10% service = 2,420 before tax -----------------------
  await page.getByRole('button', { name: 'Table T1' }).click()
  const bill = page.getByTestId('bill-panel')
  await expect(bill).toContainText('Before tax')
  await expect(bill).toContainText('Rs 2,420')

  // 10% discount → (2,200 − 220) + 10% = 2,178
  await bill.getByRole('button', { name: 'Add discount' }).click()
  await page.getByLabel('Percent off').fill('10')
  await page.getByLabel('Reason').fill('Regular guest')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(bill).toContainText('Rs 2,178')

  // Split equally between 2: first half in cash (1,089 + 16%), change from 1,500
  await bill.getByRole('button', { name: 'Equally' }).click()
  await bill.getByRole('button', { name: /^Cash/ }).click()
  await expect(bill.getByRole('button', { name: /^Charge Rs 1,263/ })).toBeVisible()
  await bill.getByRole('button', { name: 'Rs 1,500' }).click()
  await expect(bill.getByText(/Change: Rs\s23[67]/)).toBeVisible()
  await bill.getByRole('button', { name: /^Charge/ }).click()
  await expect(page.getByText(/Rs\s1,263 received/)).toBeVisible()

  // Second half by card (1,089 + 5%)
  await bill.getByRole('button', { name: 'Whole' }).click()
  await bill.getByRole('button', { name: /^Card/ }).click()
  await bill.getByLabel(/Card last 4 digits/).fill('4821')
  await bill.getByRole('button', { name: /^Charge Rs 1,143/ }).click()
  await expect(page.getByText('Bill paid')).toBeVisible()
  await expect(bill).toContainText('Paid Rs 2,407')

  // Receipt shows both tax rates
  const receiptLink = await bill.getByRole('link', { name: 'Print receipt' }).getAttribute('href')
  const receipt = await context.newPage()
  await receipt.goto(receiptLink!.replace('?print=1', ''))
  await expect(receipt.getByText('PRA Sales Tax 16% (Cash)')).toBeVisible()
  await expect(receipt.getByText('PRA Sales Tax 5% (Card)')).toBeVisible()
  await expect(receipt.getByText('Discount (Regular guest)')).toBeVisible()
  await receipt.close()

  // --- Takeaway: Lassi, paid exact cash (200 + 16% = 232) ------------------------
  await page.getByRole('button', { name: 'Takeaway', exact: true }).click()
  await page.getByRole('button', { name: 'New takeaway' }).click()
  await page.getByRole('button', { name: /^Lassi/ }).click()
  await page.getByRole('button', { name: /Add to order/ }).click()
  await page.getByRole('button', { name: /Review · 1 item/ }).click()
  await page.getByLabel('Customer name').fill('Bilal')
  await page.getByRole('button', { name: /Send & bill/ }).click()
  await expect(bill).toContainText('Takeaway')
  await expect(bill).not.toContainText('Service charge')
  await bill.getByRole('button', { name: /^Charge Rs 232/ }).click()
  await expect(page.getByText('Bill paid')).toBeVisible()

  // --- Close the shift: 5,000 + 1,263.24 + 232 = 6,495.24 expected ---------------
  await page.getByRole('button', { name: 'Shift' }).click()
  await expect(page.getByText('X-report (shift so far)')).toBeVisible()
  await page.getByLabel('Cash counted in the drawer').fill('6495.24')
  await page.getByRole('button', { name: /Close shift/ }).click()
  await expect(page.getByText('Z-report (shift closed)')).toBeVisible()
  await expect(page.getByText('Balanced')).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('heading', { name: "Who's on the till?" })).toBeVisible()
})
