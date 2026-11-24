import { expect, test } from '@playwright/test'
import { asGuest, asUser, signUpOwner, sql } from './helpers.ts'

// Inventory: items, supplier, a received purchase, a recipe with its food
// cost, sales deducting stock, wastage, a stock count, low-stock alert,
// an expense and the profit & loss statement; then the plan gate.
test.skip(({ isMobile }) => isMobile, 'Back office runs on desktop')
test.setTimeout(150_000)

const run = Date.now().toString(36)

test('owner runs stock from purchase to profit & loss', async ({ page }) => {
  await signUpOwner(page, {
    email: `inv.${run}@test.edgex.pk`,
    restaurant: `Stock Grill ${run}`,
    slug: `stockgrill-${run}`,
  })
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

  // --- Items and a supplier ---------------------------------------------------------
  await page.goto('/app/inventory')
  const addItem = async (name: string, unit: string, reorder: string) => {
    await page.getByRole('button', { name: 'Add item' }).click()
    await page.getByRole('dialog').getByLabel('Name').fill(name)
    await page.getByRole('dialog').getByLabel('Unit').selectOption({ label: unit })
    await page
      .getByRole('dialog')
      .getByLabel(/Reorder at/)
      .fill(reorder)
    await page.getByRole('button', { name: 'Save item' }).click()
    await expect(page.getByText('Item added')).toBeVisible()
  }
  await addItem('Chicken', 'kg', '5')
  await addItem('Cooking oil', 'L', '0')

  await page.getByRole('tab', { name: 'Suppliers' }).click()
  await page.getByRole('button', { name: 'Add supplier' }).click()
  await page.getByRole('dialog').getByLabel('Name').fill('Sabzi Mandi Traders')
  await page.getByRole('dialog').getByLabel('Phone').fill('0300 1112223')
  await page.getByRole('button', { name: 'Save supplier' }).click()
  await expect(page.getByRole('cell', { name: 'Sabzi Mandi Traders' })).toBeVisible()

  // --- Purchase received: 10 kg chicken Rs 8,000; 5 L oil Rs 2,500 --------------------
  await page.getByRole('tab', { name: 'Purchases' }).click()
  await page.getByRole('button', { name: 'New purchase' }).click()
  await page
    .getByRole('dialog')
    .getByLabel('Supplier')
    .selectOption({ label: 'Sabzi Mandi Traders' })
  await page.getByRole('dialog').getByLabel('Invoice / reference').fill('SMT-0042')
  await page.getByRole('dialog').getByLabel('Item 1').selectOption({ label: 'Chicken' })
  await page.getByRole('dialog').getByLabel('Quantity 1').fill('10')
  await page.getByRole('dialog').getByLabel('Line total 1').fill('8000')
  await page.getByRole('button', { name: 'Add line' }).click()
  await page.getByRole('dialog').getByLabel('Item 2').selectOption({ label: 'Cooking oil' })
  await page.getByRole('dialog').getByLabel('Quantity 2').fill('5')
  await page.getByRole('dialog').getByLabel('Line total 2').fill('2500')
  await expect(page.getByRole('dialog')).toContainText('Rs 10,500')
  await page.getByRole('button', { name: 'Receive now' }).click()
  await expect(page.getByText('Purchase saved')).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Received' })).toBeVisible()

  await page.getByRole('tab', { name: 'Stock' }).click()
  await expect(page.getByTestId('stock-Chicken')).toContainText('10 kg')
  await expect(page.getByTestId('stock-Chicken')).toContainText('Rs 800/kg')
  await expect(page.getByTestId('stock-value')).toHaveText('Rs 10,500')

  // --- Recipe: 250 g chicken + 20 ml oil = Rs 210 → 77.9% margin -----------------------
  await page.getByRole('tab', { name: 'Recipes & costing' }).click()
  await page.getByRole('button', { name: 'Chicken Tikka' }).click()
  await page.getByRole('dialog').getByLabel('Ingredient 1').selectOption({ label: 'Chicken' })
  await page.getByRole('dialog').getByLabel('Amount 1').fill('0.25')
  await page.getByRole('button', { name: 'Add ingredient' }).click()
  await page.getByRole('dialog').getByLabel('Ingredient 2').selectOption({ label: 'Cooking oil' })
  await page.getByRole('dialog').getByLabel('Amount 2').fill('0.02')
  await expect(page.getByTestId('recipe-cost')).toContainText('Rs 210')
  await page.getByRole('button', { name: 'Save recipe' }).click()
  await expect(page.getByTestId('cost-Chicken Tikka')).toContainText('Rs 210')
  await expect(page.getByTestId('cost-Chicken Tikka')).toContainText('77.9%')

  // --- 4 tikka sold → 1 kg chicken, 80 ml oil used ------------------------------------
  const [t1] = await api.post('tables', { tenant_id: tenant, branch_id: branch, label: 'T1' })
  await asGuest.rpc('place_guest_order', {
    p_table_token: t1.qr_token,
    p_items: [{ product_id: tikka, quantity: 4 }],
  })
  await page.getByRole('tab', { name: 'Stock' }).click()
  await page.reload()
  await expect(page.getByTestId('stock-Chicken')).toContainText('9 kg')
  await expect(page.getByTestId('stock-Cooking oil')).toContainText('4.92 L')

  // --- Wastage and a count -------------------------------------------------------------
  await page.getByRole('button', { name: 'Record wastage of Chicken' }).click()
  await page
    .getByRole('dialog')
    .getByLabel(/Quantity/)
    .fill('0.5')
  await page.getByRole('dialog').getByLabel('Reason').fill('Dropped on the floor')
  await page.getByRole('button', { name: 'Record wastage' }).click()
  await expect(page.getByTestId('stock-Chicken')).toContainText('8.5 kg')

  await page.getByRole('button', { name: 'Count stock' }).click()
  await page.getByRole('dialog').getByLabel('Counted Cooking oil').fill('4.9')
  await page.getByRole('button', { name: 'Save count' }).click()
  await expect(page.getByTestId('stock-Cooking oil')).toContainText('4.9 L')

  // --- Low stock: raise the reorder level above what is left ----------------------------
  await page.getByRole('button', { name: 'Chicken', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByLabel(/Reorder at/)
    .fill('10')
  await page.getByRole('button', { name: 'Save item' }).click()
  await expect(page.getByTestId('stock-Chicken')).toContainText('Low')

  // --- Expense ---------------------------------------------------------------------------
  await page.getByRole('tab', { name: 'Expenses' }).click()
  await page.getByRole('button', { name: 'Add expense' }).click()
  await page.getByRole('dialog').getByLabel('Category').selectOption({ label: 'Gas' })
  await page.getByRole('dialog').getByLabel('Amount').fill('3000')
  await page.getByRole('dialog').getByRole('button', { name: 'Add expense' }).click()
  await expect(page.getByTestId('expenses-total')).toHaveText('Rs 3,000')

  // --- The bill is paid; P&L for today -----------------------------------------------------
  await api.post('rpc/open_shift', { p_branch_id: branch, p_opening_float_minor: 0 })
  const [session] = await api.get(`table_sessions?select=id&table_id=eq.${t1.id}`)
  const bill = await api.post('rpc/open_table_bill', { p_session_id: session.id })
  await api.post('rpc/take_payment', { p_bill_id: bill, p_method: 'cash', p_base_minor: 380000 })

  await page.goto('/app')
  await expect(page.getByTestId('low-stock')).toContainText('Chicken')
  await expect(page.getByText('Add your menu')).toHaveClass(/line-through/)

  await page.goto('/app/reports')
  await page.getByRole('button', { name: 'Today' }).click()
  const pl = page.getByTestId('profit-loss')
  // Sales 3,800 − food 840 (4 × 210) − wastage 400 − count 10 = 2,550; − gas 3,000 = −450
  await expect(pl).toContainText('Net salesRs 3,800')
  await expect(pl).toContainText('Food cost22.1% of sales−Rs 840')
  await expect(pl).toContainText('Wastage−Rs 400')
  await expect(pl).toContainText('Gross profitRs 2,550')
  await expect(pl).toContainText('Net profit−Rs 450')

  // --- Plan gate -------------------------------------------------------------------------------
  sql(
    `update public.subscriptions set plan_id = (select id from public.subscription_plans where code = 'starter')
      where tenant_id = '${tenant}'`,
  )
  await page.goto('/app/inventory')
  await expect(page.getByText("Inventory isn't in your plan")).toBeVisible()
})
