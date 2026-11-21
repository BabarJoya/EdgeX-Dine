import { readFileSync } from 'node:fs'
import { devices, expect, test, type Page } from '@playwright/test'

// Full QR ordering flow: owner (desktop) and guest (phone) side by side.
test.skip(({ isMobile }) => isMobile, 'Runs once; uses its own phone context for the guest')
test.setTimeout(120_000)

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const API = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
const run = Date.now().toString(36)
const slug = `grill-${run}`

/** REST helper using the signed-in owner's session (RLS applies). */
async function rest(page: Page) {
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.includes('auth-token'))!
    return JSON.parse(localStorage.getItem(key)!).access_token as string
  })
  const headers = {
    apikey: ANON,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
  return {
    get: async (path: string) => (await fetch(`${API}/rest/v1/${path}`, { headers })).json(),
    post: async (path: string, body: unknown) => {
      const r = await fetch(`${API}/rest/v1/${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      const json = await r.json()
      if (!r.ok) throw new Error(JSON.stringify(json))
      return json
    },
  }
}

test('guest orders from a table QR and staff handle it live', async ({ page, browser }) => {
  // --- Owner: restaurant + menu ------------------------------------------------
  await page.goto('/signup')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Email').fill(`order.${run}@test.edgex.pk`)
  await page.getByLabel('Password').fill('S3cure-pass!')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByLabel('Restaurant name').fill(`Grill ${run}`)
  await page.getByLabel('Menu web address').fill(slug)
  await page.getByRole('button', { name: 'Create restaurant' }).click()
  await expect(page).toHaveURL(/\/app$/)

  const api = await rest(page)
  const [{ id: tenant }] = await api.get('tenants?select=id')
  const [cat] = await api.post('categories', {
    tenant_id: tenant,
    name: 'BBQ',
    translations: { ur: { name: 'باربی کیو' } },
  })
  const group = await api.post('rpc/save_modifier_group', {
    p_group: { tenant_id: tenant, name: 'Sauce', min_select: 1, max_select: 1 },
    p_modifiers: [
      { name: 'Raita', price_minor: 0 },
      { name: 'Mayo', price_minor: 7000 },
    ],
  })
  await api.post('rpc/save_product', {
    p_product: {
      tenant_id: tenant,
      category_id: cat.id,
      name: 'Chicken Tikka',
      translations: { ur: { name: 'چکن تکہ' } },
    },
    p_variants: [
      { name: 'Quarter', price_minor: 45000, is_default: true },
      { name: 'Half', price_minor: 85000 },
    ],
    p_group_ids: [group],
  })
  await api.post('rpc/save_product', {
    p_product: { tenant_id: tenant, category_id: cat.id, name: 'Lassi', price_minor: 20000 },
  })

  // --- Owner: tables ------------------------------------------------------------
  await page.goto('/app/tables')
  await page.getByRole('button', { name: 'Add tables' }).click()
  await page.getByLabel('How many').fill('4')
  await page.getByRole('button', { name: 'Add 4 tables' }).click()
  for (const t of ['T1', 'T2', 'T3', 'T4'])
    await expect(page.getByRole('button', { name: new RegExp(`^Table ${t},`) })).toBeVisible()

  const [t1] = await api.get('tables?select=qr_token&label=eq.T1')
  const guestUrl = `/m/${slug}?t=${t1.qr_token}`

  // --- Guest on a phone ------------------------------------------------------------
  const phone = await browser.newContext({
    ...devices['Pixel 7'],
    baseURL: test.info().project.use.baseURL,
  })
  const guest = await phone.newPage()
  await guest.goto(guestUrl)
  await expect(guest.getByRole('heading', { name: `Grill ${run}` })).toBeVisible()
  await expect(guest.getByText('Table T1')).toBeVisible()

  await guest.getByRole('button', { name: /Chicken Tikka/ }).click()
  const add = guest.getByRole('button', { name: /Add to order/ })
  await expect(add).toBeDisabled() // sauce is required
  await guest.getByLabel(/^Half/).check()
  await guest.getByLabel('Mayo').check()
  await expect(add).toContainText('Rs 920')
  await add.click()
  await guest.getByRole('button', { name: /^Lassi/ }).click()
  await guest.getByRole('button', { name: /Add to order/ }).click()
  await guest.getByRole('button', { name: /View order · 2 items/ }).click()
  await guest.getByLabel('Note for the kitchen').fill('Extra napkins')
  await guest.getByRole('button', { name: /Place order/ }).click()
  await expect(guest.getByText('Order #1 sent to the kitchen')).toBeVisible()
  await expect(guest.getByTestId('order-status')).toHaveText('Sent')

  // --- Staff sees it live and accepts ----------------------------------------------
  await page.goto('/app/orders')
  const card = page.getByTestId('order-1')
  await expect(card).toBeVisible()
  await expect(card).toContainText('Table T1')
  await expect(card).toContainText('Mayo')
  await expect(card).toContainText('Rs 1,120') // (850 + 70) + 200, priced by the database
  await card.getByRole('button', { name: 'Accept' }).click()
  await expect(guest.getByTestId('order-status')).toHaveText('Accepted', { timeout: 10_000 })

  // --- Guest asks for water; staff responds ---------------------------------------
  await guest.getByRole('button', { name: 'Need anything?' }).click()
  await guest.getByRole('button', { name: 'Water' }).click()
  await expect(guest.getByText('Your waiter has been notified')).toBeVisible()
  await expect(page.getByText('Table T1 · Water')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'On my way' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText('Table T1 · Water')).toHaveCount(0)

  // --- Close the table: blocked until served -----------------------------------------
  await page.goto('/app/tables')
  await page.getByRole('button', { name: /^Table T1, Occupied/ }).click()
  await page.getByRole('button', { name: 'Close table' }).click()
  await expect(page.getByRole('alert')).toContainText('Serve or cancel the open orders first')
  await page.keyboard.press('Escape')

  await page.goto('/app/orders')
  await page.getByTestId('order-1').getByRole('button', { name: 'Start preparing' }).click()
  await page.getByTestId('order-1').getByRole('button', { name: 'Mark ready' }).click()
  await expect(guest.getByTestId('order-status')).toHaveText('Ready', { timeout: 10_000 })
  await page.getByTestId('order-1').getByRole('button', { name: 'Mark served' }).click()

  await page.goto('/app/tables')
  await page.getByRole('button', { name: /^Table T1, Occupied/ }).click()
  await page.getByRole('button', { name: 'Close table' }).click()
  await expect(page.getByText('Table T1 closed')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /^Table T1, Cleaning/ })).toBeVisible()
  await expect(guest.getByText('This table has been closed')).toBeVisible({ timeout: 10_000 })

  // --- Urdu menu, browse-only and invalid QR ---------------------------------------
  await guest.goto(guestUrl)
  await guest.getByRole('button', { name: 'اردو' }).click()
  await expect(guest.getByText('چکن تکہ')).toBeVisible()
  await guest.getByRole('button', { name: 'English' }).click()
  await guest.goto(`/m/${slug}`)
  await expect(guest.getByText('To order, scan the QR code on your table.')).toBeVisible()
  await guest.goto(`/m/${slug}?t=forged-token`)
  await expect(guest.getByText('This QR code is not valid')).toBeVisible()
  await phone.close()

  // --- Printable cards ----------------------------------------------------------------
  const [{ id: branch }] = await api.get('branches?select=id')
  await page.goto(`/print/qr?branch=${branch}`)
  await expect(page.getByRole('img', { name: /QR code for table/ })).toHaveCount(4)
})
