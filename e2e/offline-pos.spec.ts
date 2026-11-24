import { expect, test } from '@playwright/test'
import { asUser, signUpOwner, sql } from './helpers.ts'

// Offline POS: the connection drops, the till keeps selling takeaway from
// the menu saved on the device, the app even survives a reload, and the
// queued sales sync exactly once when the internet is back.
test.skip(({ isMobile }) => isMobile, 'POS is a tablet/desktop screen')
test.setTimeout(150_000)

const run = Date.now().toString(36)

test('takeaway sales keep working offline and sync once on reconnect', async ({
  page,
  context,
}) => {
  await signUpOwner(page, {
    email: `offline.${run}@test.edgex.pk`,
    restaurant: `Offline Grill ${run}`,
    slug: `offgrill-${run}`,
  })
  const api = await asUser(page)
  const [{ id: tenant }] = await api.get('tenants?select=id')
  const [{ id: branch }] = await api.get('branches?select=id')
  sql(`update public.branches set tax_cash_bps = 1600 where id = '${branch}'`)
  const [cat] = await api.post('categories', { tenant_id: tenant, name: 'BBQ' })
  await api.post('rpc/save_product', {
    p_product: {
      tenant_id: tenant,
      category_id: cat.id,
      name: 'Chicken Tikka',
      price_minor: 95000,
    },
  })

  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Set POS PIN' }).click()
  await page.getByLabel('New PIN').fill('482913')
  await page.getByLabel('Confirm PIN').fill('482913')
  await page.getByRole('button', { name: 'Save PIN' }).click()
  await expect(page.getByText('PIN saved')).toBeVisible()
  await page.goto('/pos')
  for (const d of '482913') await page.getByRole('button', { name: d, exact: true }).click()
  await page.getByLabel('Opening cash (float)').fill('5000')
  await page.getByRole('button', { name: 'Open shift' }).click()
  await page.getByRole('button', { name: 'Takeaway', exact: true }).click()
  await expect(page.getByRole('button', { name: 'New takeaway' })).toBeEnabled()
  // Let the service worker and the device cache settle.
  await page.waitForTimeout(2500)

  // --- The internet drops ------------------------------------------------------------------
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('status').filter({ hasText: "You're offline" })).toBeVisible()

  const sell = async (qty: number, tendered: string) => {
    await page.getByRole('button', { name: 'Takeaway', exact: true }).click()
    await page.getByRole('button', { name: 'New takeaway' }).click()
    await page.getByRole('button', { name: /^Chicken Tikka/ }).click()
    for (let i = 1; i < qty; i++) await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('button', { name: /Add to order/ }).click()
    await page.getByRole('button', { name: /Review/ }).click()
    await page.getByLabel('Customer name').fill('Hamza')
    await page.getByRole('button', { name: /Send & bill/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Offline sale')
    await page.getByLabel('Cash received').fill(tendered)
    await dialog.getByRole('button', { name: 'Complete sale' }).click()
    await expect(page.getByText('Sale saved on this device')).toBeVisible()
  }
  // 2 × 950 = 1,900 + 16% = 2,204
  await sell(2, '2500')
  await sell(1, '1102')
  await expect(page.getByTestId('offline-status')).toContainText('Offline · 2 saved')
  expect(sql(`select count(*) from public.bills where tenant_id = '${tenant}'`)).toBe('0')

  // --- Back online: both sync, once ---------------------------------------------------------
  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.getByText('2 offline sales synced')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('offline-status')).toHaveCount(0)

  const bills = sql(
    `select string_agg(status || ':' || paid_total_minor || ':' || (offline_ref is not null), ',' order by paid_total_minor)
     from public.bills where tenant_id = '${tenant}'`,
  )
  expect(bills).toBe('paid:110200:true,paid:220400:true')
  expect(
    sql(
      `select count(*) from public.orders where tenant_id = '${tenant}' and status = 'completed'`,
    ),
  ).toBe('2')

  await page.getByRole('button', { name: 'Bills today' }).click()
  await expect(page.getByRole('button', { name: /Hamza.*paid/ })).toHaveCount(2)
})
