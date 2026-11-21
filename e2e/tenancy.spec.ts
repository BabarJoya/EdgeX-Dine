import { expect, test, type Page } from '@playwright/test'

// Full Phase 1 journey against the real (local) Supabase backend.
test.describe.configure({ mode: 'serial' })
test.skip(({ isMobile }) => isMobile, 'Journey runs once, on desktop')

const run = Date.now().toString(36)
const owner = { name: 'Ali Khan', email: `ali.${run}@test.edgex.pk`, password: 'S3cure-pass!' }
const waiter = {
  name: 'Wasim Ahmed',
  email: `wasim.${run}@test.edgex.pk`,
  password: 'S3cure-pass!',
}
const restaurant = `Karachi Grill ${run}`
let inviteLink = ''

async function signUp(page: Page, who: typeof owner) {
  await page.getByLabel('Your name').fill(who.name)
  if (await page.getByLabel('Email').isEditable()) await page.getByLabel('Email').fill(who.email)
  await page.getByLabel('Password').fill(who.password)
  await page.getByRole('button', { name: 'Create account' }).click()
}

async function nav(page: Page, name: string) {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name, exact: true })
    .click()
}

test('owner signs up and creates a restaurant', async ({ page }) => {
  await page.goto('/signup')
  await signUp(page, owner)
  await expect(page.getByRole('heading', { name: 'Set up your restaurant' })).toBeVisible()

  await page.getByLabel('Restaurant name').fill(restaurant)
  await expect(page.getByLabel('Menu web address')).toHaveValue(`karachi-grill-${run}`)
  await expect(page.getByLabel('Available')).toBeVisible()
  await page.getByLabel('First branch').fill('Clifton')
  await page.getByLabel('City').fill('Karachi')
  await page.getByRole('button', { name: 'Create restaurant' }).click()

  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Switch restaurant' })).toContainText(restaurant)
})

test('owner adds a branch, then hits the plan limit', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(owner.email)
  await page.getByLabel('Password').fill(owner.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('tab', { name: 'Branches' }).click()

  await page.getByRole('button', { name: 'Add branch' }).click()
  await page.getByLabel('Branch name').fill('DHA Phase 6')
  await page.getByLabel('City').fill('Karachi')
  await page.getByRole('button', { name: 'Save branch' }).click()
  await expect(page.getByRole('cell', { name: /DHA Phase 6/ })).toBeVisible()

  // Trial (Professional) allows 2 branches; the database rejects a third.
  await page.getByRole('button', { name: 'Add branch' }).click()
  await page.getByLabel('Branch name').fill('Gulshan')
  await page.getByRole('button', { name: 'Save branch' }).click()
  await expect(page.getByRole('alert')).toContainText('Your plan allows 2 branch(es)')
})

test('owner invites a waiter to one branch', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(owner.email)
  await page.getByLabel('Password').fill(owner.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await nav(page, 'Staff')

  await page.getByRole('button', { name: 'Invite staff' }).click()
  await page.getByLabel('Email').fill(waiter.email)
  await page.getByLabel('Role', { exact: true }).selectOption({ label: 'Waiter' })
  await page.getByRole('button', { name: 'Create invitation' }).click()
  await expect(page.getByRole('heading', { name: 'Invitation created' })).toBeVisible()
  inviteLink = (await page.locator('.font-mono.break-all').textContent()) ?? ''
  expect(inviteLink).toMatch(/\/invite\/[0-9a-f]{48}$/)
  await page.keyboard.press('Escape')

  await page.getByRole('tab', { name: /Invitations/ }).click()
  await expect(page.getByRole('cell', { name: waiter.email })).toBeVisible()
})

test('waiter accepts the invite and only sees what a waiter may see', async ({ page }) => {
  await page.goto(new URL(inviteLink).pathname)
  await expect(page.getByRole('heading', { name: `Join ${restaurant}` })).toBeVisible()
  await page.getByRole('link', { name: 'Create account' }).click()
  await expect(page.getByLabel('Email')).toHaveValue(waiter.email)
  await signUp(page, waiter)

  await page.getByRole('button', { name: `Join ${restaurant}` }).click()
  await expect(page).toHaveURL(/\/app$/)

  const menu = page.getByRole('navigation', { name: 'Main' })
  await expect(menu.getByRole('link', { name: 'Orders' })).toBeVisible()
  await expect(menu.getByRole('link', { name: 'Tables' })).toBeVisible()
  await expect(menu.getByRole('link', { name: 'Staff' })).toHaveCount(0)
  await expect(menu.getByRole('link', { name: 'Reports' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0)

  // Branch-limited: only Clifton, no "All branches".
  await expect(page.getByRole('button', { name: 'Switch branch' })).toContainText('Clifton')

  // Typing the URL directly is blocked too.
  await page.goto('/app/settings')
  await expect(page.getByText("You don't have access to this page")).toBeVisible()
})

test('owner sees the waiter and can change role permissions', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(owner.email)
  await page.getByLabel('Password').fill(owner.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await nav(page, 'Staff')
  await expect(page.getByRole('cell', { name: new RegExp(waiter.name) })).toBeVisible()

  await page.getByRole('tab', { name: 'Roles & permissions' }).click()
  await page.getByRole('button', { name: /^Waiter/ }).click()
  await page.getByLabel(/View reports/).check()
  await page.getByRole('button', { name: 'Save permissions' }).click()
  await expect(page.getByText('Waiter permissions saved')).toBeVisible()
})

test('a forwarded invite link cannot be used by someone else', async ({ page }) => {
  await page.goto(new URL(inviteLink).pathname)
  await expect(page.getByRole('heading', { name: 'Invitation not valid' })).toBeVisible()
})
