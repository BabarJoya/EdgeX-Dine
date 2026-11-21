import { expect, test } from '@playwright/test'

// Builds a real menu against local Supabase (database + storage).
test.describe.configure({ mode: 'serial' })
test.skip(({ isMobile }) => isMobile, 'Journey runs once, on desktop')

const run = Date.now().toString(36)
const owner = { email: `menu.${run}@test.edgex.pk`, password: 'S3cure-pass!' }
const photo = 'public/icons/icon-512.png'

test.beforeEach(async ({ page }, info) => {
  if (info.title.startsWith('owner sets up')) return
  await page.goto('/login')
  await page.getByLabel('Email').fill(owner.email)
  await page.getByLabel('Password').fill(owner.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/app$/)
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Menu', exact: true })
    .click()
})

test('owner sets up a restaurant', async ({ page }) => {
  await page.goto('/signup')
  await page.getByLabel('Your name').fill('Menu Owner')
  await page.getByLabel('Email').fill(owner.email)
  await page.getByLabel('Password').fill(owner.password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByLabel('Restaurant name').fill(`Tikka House ${run}`)
  await page.getByRole('button', { name: 'Create restaurant' }).click()
  await expect(page).toHaveURL(/\/app$/)
})

test('categories, a station and an add-on group', async ({ page }) => {
  await expect(page.getByText('Start with a category')).toBeVisible()
  await page.getByRole('button', { name: 'Add category' }).click()
  await page.getByLabel('Name', { exact: true }).fill('BBQ')
  await page.getByLabel('Name in Urdu').fill('باربی کیو')
  await page.getByRole('button', { name: 'Save category' }).click()
  await expect(page.getByRole('button', { name: /^BBQ/ })).toBeVisible()

  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByLabel('Name', { exact: true }).fill('Tikka')
  await page.getByLabel('Inside').selectOption({ label: 'BBQ' })
  await page.getByRole('button', { name: 'Save category' }).click()
  await expect(page.getByRole('button', { name: /^Tikka/ })).toBeVisible()

  await page.getByRole('tab', { name: /Kitchen stations/ }).click()
  await page.getByLabel('New station name').fill('Grill')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Grill', { exact: true })).toBeVisible()

  await page.getByRole('tab', { name: /Add-ons/ }).click()
  await page.getByRole('button', { name: 'New add-on group' }).click()
  await page.getByLabel('Group name').fill('Sauce')
  await page.getByLabel('Maximum choices').fill('2')
  await page.getByLabel('Option 1 name').fill('Raita')
  await page.getByRole('button', { name: 'Add option' }).click()
  await page.getByLabel('Option 2 name').fill('Garlic mayo')
  await page.getByLabel('Option 2 price').fill('70')
  await page.getByRole('button', { name: 'Save group' }).click()
  await expect(page.getByText('Optional, up to 2')).toBeVisible()
  await expect(page.getByText('+Rs 70')).toBeVisible()
})

test('a full menu item with sizes, add-ons, station and photo', async ({ page }) => {
  await page.getByRole('button', { name: /^Tikka/ }).click()
  await page.getByRole('button', { name: 'New item' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Chicken Tikka')
  await page.getByLabel('Name in Urdu').fill('چکن تکہ')
  await expect(page.getByLabel('Category')).toHaveValue(/.+/)
  await page.locator('input[type=file]').setInputFiles(photo)
  await expect(page.getByRole('button', { name: 'Change photo' })).toBeVisible()

  await page.getByLabel('This item comes in different sizes or portions').check()
  await page.getByLabel('Size 1 price').fill('450')
  await page.getByLabel('Size 2 price').fill('850')
  await page.getByLabel(/^Sauce/).check()
  await page.getByLabel('Kitchen station', { exact: true }).selectOption({ label: 'Grill' })
  await page.getByRole('button', { name: 'Spicy' }).click()
  await page.getByRole('button', { name: 'Save item' }).click()

  const row = page.getByRole('button', { name: /^Chicken Tikka/ })
  await expect(row).toBeVisible()
  await expect(page.getByText('from Rs 450')).toBeVisible()
  await expect(row).toContainText('Grill')
  await expect(row).toContainText('1 add-on group')
  await expect(page.locator('img[src*="menu-images"]')).toHaveCount(1)
})

test('editing keeps sizes and updates prices', async ({ page }) => {
  await page.getByRole('button', { name: /^Chicken Tikka/ }).click()
  await expect(page.getByLabel('Size 2 price')).toHaveValue('850')
  await page.getByLabel('Size 1 price').fill('500')
  await page.getByRole('button', { name: 'Save item' }).click()
  await expect(page.getByText('from Rs 500')).toBeVisible()
})

test('sold out toggle persists and search works', async ({ page }) => {
  await page.getByRole('switch', { name: 'Chicken Tikka available' }).click()
  await expect(page.getByText('1 sold out')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('switch', { name: 'Chicken Tikka available' })).toHaveAttribute(
    'aria-checked',
    'false',
  )

  await page.getByLabel('Search menu').fill('tikka')
  await expect(page.getByRole('button', { name: /^Chicken Tikka/ })).toBeVisible()
  await page.getByLabel('Search menu').fill('biryani')
  await expect(page.getByText('No items match your search')).toBeVisible()
})

test('a category with items cannot be deleted', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit Tikka' }).click({ force: true })
  await expect(page.getByRole('button', { name: 'Delete' })).toBeDisabled()
})
