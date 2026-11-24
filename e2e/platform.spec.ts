import { expect, test, type Browser, type Page } from '@playwright/test'
import { signUpOwner, sql } from './helpers.ts'

// Platform admin: suspend / reactivate, support conversation, plans,
// plan features, expiry → read-only, approval of new restaurants.
test.skip(({ isMobile }) => isMobile, 'Admin console is a desktop screen')
test.setTimeout(150_000)

const run = Date.now().toString(36)
const ownerEmail = `plat.owner.${run}@test.edgex.pk`
const adminEmail = `plat.admin.${run}@test.edgex.pk`
const restaurant = `Platform Grill ${run}`

async function newPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL })
  return ctx.newPage()
}

test('EdgeX admin manages restaurants, plans, support and approvals', async ({
  page: owner,
  browser,
}) => {
  await signUpOwner(owner, { email: ownerEmail, restaurant, slug: `plat-${run}` })

  // The EdgeX team member: a normal account promoted to platform admin.
  const admin = await newPage(browser)
  await admin.goto('/signup')
  await admin.getByLabel('Your name').fill('Pat EdgeX')
  await admin.getByLabel('Email').fill(adminEmail)
  await admin.getByLabel('Password').fill('S3cure-pass!')
  await admin.getByRole('button', { name: 'Create account' }).click()
  await expect(admin.getByRole('heading', { name: 'Set up your restaurant' })).toBeVisible()
  sql(`update public.profiles set is_platform_admin = true where email = '${adminEmail}'`)

  // Restaurant owners cannot open the console.
  await owner.goto('/admin')
  await expect(owner.getByText('Platform admins only')).toBeVisible()

  await admin.goto('/admin')
  await expect(admin.getByRole('heading', { name: 'Platform overview' })).toBeVisible()
  await expect(admin.getByText('Monthly recurring revenue')).toBeVisible()

  // --- Suspend ------------------------------------------------------------------
  await admin.getByRole('link', { name: 'Restaurants' }).click()
  await admin.getByLabel('Search restaurants').fill(run)
  await admin.getByRole('button', { name: 'Search' }).click()
  await admin.getByRole('cell', { name: new RegExp(restaurant) }).click()
  await admin.getByRole('button', { name: 'Suspend' }).click()
  await admin.getByLabel('Reason (kept in the history)').fill('Payment overdue')
  await admin.getByRole('dialog').getByRole('button', { name: 'Suspend' }).last().click()
  await expect(admin.getByText('Suspended', { exact: true }).first()).toBeVisible()

  await owner.goto('/app')
  await expect(owner.getByRole('heading', { name: 'This account is suspended' })).toBeVisible()
  await owner.getByRole('link', { name: 'Contact support' }).click()
  await owner.getByRole('button', { name: 'New request' }).click()
  await owner.getByLabel('Subject').fill('Why are we suspended?')
  await owner.getByLabel('Details').fill('We paid yesterday by bank transfer.')
  await owner.getByRole('button', { name: 'Send request' }).click()
  await expect(owner.getByText('Request sent')).toBeVisible()

  // --- Admin replies, records the payment (Starter), restaurant is back -----------
  await admin.getByRole('link', { name: 'Support' }).click()
  await admin.getByRole('button', { name: /Why are we suspended/ }).click()
  await admin.getByLabel('Reply').fill('Thanks, payment received. You are active again.')
  await admin.getByRole('button', { name: 'Send' }).click()

  await admin.getByRole('link', { name: 'Restaurants' }).click()
  await admin.getByLabel('Search restaurants').fill(run)
  await admin.getByRole('button', { name: 'Search' }).click()
  await admin.getByRole('cell', { name: new RegExp(restaurant) }).click()
  await admin.getByRole('button', { name: 'Reactivate' }).click()
  await admin.getByLabel('Reason (kept in the history)').fill('Paid')
  await admin.getByRole('dialog').getByRole('button', { name: 'Activate' }).click()
  await admin.getByRole('cell', { name: new RegExp(restaurant) }).click()
  await admin.getByLabel('Plan', { exact: true }).selectOption({ label: 'Starter' })
  await admin.getByLabel('Reference').fill('HBL-4471')
  await admin.getByRole('button', { name: /Record payment/ }).click()
  await expect(admin.getByText('Payment recorded, plan active')).toBeVisible()

  await owner.goto('/app/support')
  await expect(owner.getByText('Thanks, payment received.')).toBeVisible()
  await expect(owner.getByText('EdgeX support', { exact: false }).first()).toBeVisible()

  // Starter has no kitchen display.
  await owner.goto('/kds')
  await expect(owner.getByText("The kitchen display isn't in your plan")).toBeVisible()
  await owner.goto('/app/settings?tab=plan')
  await expect(owner.getByText('Payment history')).toBeVisible()
  await expect(owner.getByText('HBL-4471')).toBeVisible()

  // --- Plan expires → read-only banner ---------------------------------------------
  sql(`update public.subscriptions set current_period_end = now() - interval '10 days'
       where tenant_id = (select id from public.tenants where name = '${restaurant}')`)
  await owner.goto('/app/menu')
  await expect(owner.getByText('Your plan has ended.')).toBeVisible()
  await expect(owner.getByRole('button', { name: 'New item' })).toHaveCount(0)

  // --- Approval for new restaurants -------------------------------------------------
  await admin.getByRole('link', { name: 'Settings' }).click()
  await admin.getByRole('switch', { name: 'Require approval' }).click()
  await admin.getByRole('button', { name: 'Save settings' }).click()
  await expect(admin.getByText('Settings saved')).toBeVisible()

  const fresh = await newPage(browser)
  await signUpOwner(fresh, {
    email: `plat.new.${run}@test.edgex.pk`,
    restaurant: `Fresh Cafe ${run}`,
    slug: `fresh-${run}`,
  }).catch(() => {})
  await expect(
    fresh.getByRole('heading', { name: 'Your restaurant is being reviewed' }),
  ).toBeVisible()

  await admin.getByRole('link', { name: 'Restaurants' }).click()
  await admin.getByLabel('Search restaurants').fill(`fresh-${run}`)
  await admin.getByRole('button', { name: 'Search' }).click()
  await expect(admin.getByText('Awaiting approval')).toBeVisible()
  await admin.getByRole('cell', { name: new RegExp(`Fresh Cafe ${run}`) }).click()
  await admin.getByRole('button', { name: 'Approve' }).click()
  await admin.getByLabel('Reason (kept in the history)').fill('Verified by phone')
  await admin.getByRole('dialog').getByRole('button', { name: 'Activate' }).click()

  await fresh.reload()
  await expect(fresh.getByRole('heading', { name: 'Overview' })).toBeVisible()

  // Leave the platform setting as it was for other tests.
  sql(`update public.platform_settings set require_approval = false`)

  // --- Account closure: suspend, then delete permanently ---------------------------
  await admin.getByRole('cell', { name: new RegExp(`Fresh Cafe ${run}`) }).click()
  await admin.getByRole('button', { name: 'Suspend' }).click()
  await admin.getByLabel('Reason (kept in the history)').fill('Owner closed the account')
  await admin.getByRole('dialog').getByRole('button', { name: 'Suspend' }).last().click()
  await admin.getByRole('cell', { name: new RegExp(`Fresh Cafe ${run}`) }).click()
  await admin.getByRole('button', { name: 'Delete restaurant…' }).click()
  const confirm = admin.getByRole('button', { name: 'Delete permanently' })
  await expect(confirm).toBeDisabled()
  await admin.getByLabel(`Type fresh-${run} to confirm`).fill(`fresh-${run}`)
  await confirm.click()
  await expect(admin.getByText(`Fresh Cafe ${run} deleted`)).toBeVisible()
  expect(sql(`select count(*) from public.tenants where slug = 'fresh-${run}'`)).toBe('0')
})
