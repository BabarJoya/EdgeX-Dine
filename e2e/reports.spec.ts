import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { asGuest, asUser, signUpOwner, sql } from './helpers.ts'

// Reports: real sales flow into the KPIs, charts have a table view, the
// report exports to Excel and PDF, the overview shows today, and the page is
// gated by the plan.
test.skip(({ isMobile }) => isMobile, 'Reports are checked on desktop')
test.setTimeout(120_000)

const run = Date.now().toString(36)
const restaurant = `Ledger Grill ${run}`

test('owner reads today’s sales, switches views, exports, and loses access on Starter', async ({
  page,
}) => {
  await signUpOwner(page, {
    email: `reports.${run}@test.edgex.pk`,
    restaurant,
    slug: `ledger-${run}`,
  })

  // --- Sales: a table order (2 × Tikka + Lassi = 2,200) paid cash, a takeaway
  // Lassi (200) paid card. No tax, so net = collected = 2,400. -----------------
  const api = await asUser(page)
  const [{ id: tenant }] = await api.get('tenants?select=id')
  const [{ id: branch }] = await api.get('branches?select=id')
  const [bbq] = await api.post('categories', { tenant_id: tenant, name: 'BBQ' })
  const [drinks] = await api.post('categories', { tenant_id: tenant, name: 'Drinks' })
  const tikka = await api.post('rpc/save_product', {
    p_product: { tenant_id: tenant, category_id: bbq.id, name: 'Tikka', price_minor: 100000 },
  })
  const lassi = await api.post('rpc/save_product', {
    p_product: { tenant_id: tenant, category_id: drinks.id, name: 'Lassi', price_minor: 20000 },
  })
  const [t1] = await api.post('tables', { tenant_id: tenant, branch_id: branch, label: 'T1' })
  await asGuest.rpc('place_guest_order', {
    p_table_token: t1.qr_token,
    p_items: [
      { product_id: tikka, quantity: 2 },
      { product_id: lassi, quantity: 1 },
    ],
  })
  await api.post('rpc/open_shift', { p_branch_id: branch, p_opening_float_minor: 0 })
  const [session] = await api.get(`table_sessions?select=id&table_id=eq.${t1.id}`)
  const tableBill = await api.post('rpc/open_table_bill', { p_session_id: session.id })
  await api.post('rpc/take_payment', {
    p_bill_id: tableBill,
    p_method: 'cash',
    p_base_minor: 220000,
  })
  const counter = await api.post('rpc/create_counter_order', {
    p_branch_id: branch,
    p_type: 'takeaway',
    p_items: [{ product_id: lassi, quantity: 1 }],
  })
  await api.post('rpc/take_payment', {
    p_bill_id: counter.bill_id,
    p_method: 'card',
    p_base_minor: 20000,
  })

  // --- Overview: today's tiles -----------------------------------------------
  await page.goto('/app')
  await expect(page.getByTestId('today-Net sales today')).toContainText('Rs 2,400')
  await expect(page.getByTestId('today-Orders today')).toContainText('2')

  // --- Reports ---------------------------------------------------------------
  await page.getByRole('link', { name: 'Reports' }).click()
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible()
  await expect(page.getByTestId('kpi-Net sales')).toContainText('Rs 2,400')
  await expect(page.getByTestId('kpi-Orders')).toContainText('2')

  // Best sellers: Tikka first (Rs 2,000), with a table view of the same numbers.
  const best = page.getByRole('region', { name: 'Best sellers' })
  await expect(
    best
      .getByRole('list', { name: /ranking/ })
      .locator('li')
      .first(),
  ).toContainText('Tikka')
  await best.getByRole('button', { name: 'Table' }).click()
  await expect(best.getByRole('row', { name: /Tikka/ })).toContainText('Rs 2,000')

  const methods = page.getByRole('region', { name: 'Payment methods' })
  await methods.getByRole('button', { name: 'Table' }).click()
  await expect(methods.getByRole('row', { name: /Cash/ })).toContainText('Rs 2,200')
  await expect(methods.getByRole('row', { name: /Card/ })).toContainText('Rs 200')

  // --- Exports ---------------------------------------------------------------
  const [xlsx] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Excel' }).click(),
  ])
  expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/)
  const xlsxBytes = readFileSync((await xlsx.path())!)
  expect(xlsxBytes.subarray(0, 2).toString()).toBe('PK') // a zip, i.e. a real workbook

  const [pdf] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'PDF' }).click(),
  ])
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/)
  expect(
    readFileSync((await pdf.path())!)
      .subarray(0, 5)
      .toString(),
  ).toBe('%PDF-')

  // --- Plan gate: Starter has no reports ---------------------------------------
  sql(
    `update public.subscriptions set plan_id = (select id from public.subscription_plans where code = 'starter')
      where tenant_id = '${tenant}'`,
  )
  await page.reload()
  await expect(page.getByText("Reports aren't in your plan")).toBeVisible()
  await expect(page.getByTestId('kpi-Net sales')).toHaveCount(0)
})
