import { expect, test } from '@playwright/test'
import { asGuest, asUser, signUpOwner } from './helpers.ts'

// Direct thermal printing from the kitchen display, with a simulated
// Web Serial printer that records the ESC/POS bytes it receives.
test.skip(({ isMobile }) => isMobile, 'Kitchen display runs on a tablet / PC')
test.setTimeout(90_000)

const run = Date.now().toString(36)

test('kitchen display prints new tickets automatically on a serial printer', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __printed: number[] }
    w.__printed = []
    const port = {
      writable: null as WritableStream<Uint8Array> | null,
      async open() {
        port.writable = new WritableStream({ write: (chunk) => void w.__printed.push(...chunk) })
      },
      getInfo: () => ({}),
    }
    Object.defineProperty(navigator, 'serial', {
      value: { requestPort: async () => port, getPorts: async () => [port] },
    })
  })
  const printed = async () =>
    String.fromCharCode(
      ...(await page.evaluate(() => (window as unknown as { __printed: number[] }).__printed)),
    )

  await signUpOwner(page, {
    email: `print.${run}@test.edgex.pk`,
    restaurant: `Print Grill ${run}`,
    slug: `printgrill-${run}`,
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
  const [t1] = await api.post('tables', { tenant_id: tenant, branch_id: branch, label: 'T7' })

  await page.goto('/kds')
  await page.getByRole('button', { name: 'Printer setup' }).click()
  await page.getByRole('button', { name: 'Connect serial / Bluetooth' }).click()
  await expect(page.getByTestId('printer-status')).toContainText('Serial printer')
  await page.getByLabel('Paper width').selectOption({ label: '58 mm' })
  await page.getByRole('switch', { name: 'Auto-print kitchen tickets' }).click()
  await page.getByRole('button', { name: 'Print test page' }).click()
  await expect.poll(printed).toContain('Printer test')
  expect(await printed()).toContain('58 mm')
  await page.keyboard.press('Escape')

  // A guest orders → the ticket prints by itself.
  await asGuest.rpc('place_guest_order', {
    p_table_token: t1.qr_token,
    p_items: [{ product_id: tikka, quantity: 2, notes: 'less spicy' }],
  })
  await expect.poll(printed, { timeout: 20_000 }).toContain('TABLE T7')
  const out = await printed()
  expect(out).toContain('Chicken Tikka')
  expect(out).toContain('NOTE: less spicy')
  expect(out).toContain('\x1dVB\x00') // paper cut

  // The choice survives a reload (no prompt needed again).
  await page.reload()
  await expect(page.getByRole('button', { name: 'Printer setup' })).toContainText('Serial printer')
})
