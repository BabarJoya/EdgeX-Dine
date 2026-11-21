import { expect, test } from '@playwright/test'

test('root redirects to the dashboard overview', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
})

test('sidebar navigation reaches every back-office module', async ({ page, isMobile }) => {
  await page.goto('/app')
  for (const name of ['Orders', 'Tables', 'Menu', 'Staff', 'Reports']) {
    if (isMobile) await page.getByRole('button', { name: 'Open navigation' }).click()
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name }).click()
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  }
})

test('theme can be switched to dark and persists across reloads', async ({ page }) => {
  await page.goto('/app')
  await page.getByRole('button', { name: 'Change theme' }).click()
  await page.getByRole('menuitemradio', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
})

test('guest QR menu renders without the staff sidebar', async ({ page }) => {
  await page.goto('/m/demo-restaurant')
  await expect(page.getByText('demo-restaurant')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
})

test('page has no horizontal scroll at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  for (const path of ['/app', '/design', '/login', '/m/demo']) {
    await page.goto(path)
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
