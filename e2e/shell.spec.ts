import { expect, test } from '@playwright/test'

test('signed-out visitors are sent to sign in, then back where they were going', async ({
  page,
}) => {
  await page.goto('/app/staff')
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fstaff$/)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('wrong password shows a clear error', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('nobody@example.com')
  await page.getByLabel('Password').fill('wrong-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Wrong email or password.')).toBeVisible()
})

test('guest QR menu is public and has no staff navigation', async ({ page }) => {
  await page.goto('/m/demo-restaurant')
  await expect(page.getByText('demo-restaurant')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
})

test('public pages have no horizontal scroll at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  for (const path of ['/login', '/signup', '/forgot-password', '/m/demo']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, path).toBeLessThanOrEqual(0)
  }
})

test('unknown routes show the 404 page', async ({ page }) => {
  await page.goto('/does-not-exist')
  await expect(page.getByText("This page doesn't exist")).toBeVisible()
})
