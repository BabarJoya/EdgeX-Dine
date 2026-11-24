import { expect, test } from '@playwright/test'
import { asUser, signUpOwner } from './helpers.ts'

// Reservations: branch rules, a guest books online, staff confirm and
// assign a table, the guest sees it confirmed and cancels; a phone booking
// is seated and shows on the floor plan.
test.skip(({ isMobile }) => isMobile, 'Back office on desktop; the guest uses a phone context')
test.setTimeout(120_000)

const run = Date.now().toString(36)
const slug = `bookgrill-${run}`
// Tomorrow in the restaurant's time zone.
const tomorrow = (() => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date())
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
})()

test('guest books a table; staff confirm, seat and see it on the floor', async ({
  page,
  browser,
}) => {
  await signUpOwner(page, {
    email: `book.${run}@test.edgex.pk`,
    restaurant: `Book Grill ${run}`,
    slug,
  })
  const api = await asUser(page)
  const [{ id: tenant }] = await api.get('tenants?select=id')
  const [{ id: branch }] = await api.get('branches?select=id')
  await api.post('tables', { tenant_id: tenant, branch_id: branch, label: 'T5', seats: 4 })

  await page.goto('/app/settings?tab=reservations')
  await page.getByRole('switch', { name: 'Take online bookings' }).click()
  await page.getByLabel('Guests per time slot').fill('10')
  await page.getByLabel('Largest party online').fill('8')
  await page.getByRole('button', { name: 'Save reservation settings' }).click()
  await expect(page.getByText('Reservation settings saved')).toBeVisible()
  await expect(page.getByTestId('booking-link')).toHaveText(new RegExp(`/book/${slug}$`))

  // --- Guest books on a phone ---------------------------------------------------------------
  const phoneCtx = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 390, height: 844 },
  })
  const guest = await phoneCtx.newPage()
  await guest.goto(`/book/${slug}`)
  await guest.getByLabel('Date').fill(tomorrow)
  await guest.getByLabel('Guests').selectOption('4')
  await guest.getByRole('radio', { name: '7:00 PM' }).click()
  await guest.getByLabel('Your name').fill('Hamza')
  await guest.getByLabel('Mobile number').fill('0300 1234567')
  await guest.getByLabel(/Anything we should know/).fill('Birthday')
  await guest.getByRole('button', { name: 'Request booking' }).click()
  await expect(guest.getByTestId('booking-status')).toHaveText(
    'Waiting for the restaurant to confirm',
  )
  await expect(guest.getByText('7:00 PM')).toBeVisible()

  // --- Staff confirm and assign a table ----------------------------------------------------------
  await page.goto('/app/reservations')
  await page.getByRole('button', { name: 'Next day' }).click()
  const hamza = page.getByTestId('booking-Hamza')
  await expect(hamza).toContainText('4 guests')
  await expect(hamza).toContainText('Birthday')
  await hamza.getByRole('button', { name: 'Confirm' }).click()
  await expect(hamza).toContainText('Confirmed')
  await hamza.getByRole('button', { name: 'Hamza' }).click()
  await page.getByLabel('Table').selectOption({ label: 'T5 (4 seats)' })
  await page.getByRole('button', { name: 'Save booking' }).click()
  await expect(hamza).toContainText('Table T5')

  await guest.reload()
  await expect(guest.getByTestId('booking-status')).toHaveText('Confirmed — see you soon!')

  // --- A booking taken by phone for right now, seated → floor plan ---------------------------------
  const nowLocal = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date())
  await page.getByRole('button', { name: 'Today' }).click()
  await page.getByRole('button', { name: 'New booking' }).click()
  await page.getByLabel('Time').fill(nowLocal)
  await page.getByLabel('Guest name').fill('Sana')
  await page.getByLabel('Guests', { exact: true }).fill('2')
  await page.getByLabel('Table').selectOption({ label: 'T5 (4 seats)' })
  await page.getByRole('button', { name: 'Add booking' }).click()
  const sana = page.getByTestId('booking-Sana')
  await sana.getByRole('button', { name: 'Seat' }).click()
  await expect(sana).toContainText('Seated')
  await page.goto('/app/tables')
  await expect(page.getByRole('button', { name: /Table T5/ })).toContainText('Seated')

  // --- The guest cancels ---------------------------------------------------------------------------
  await guest.getByRole('button', { name: 'Cancel booking' }).click()
  await expect(guest.getByTestId('booking-status')).toHaveText('This booking was cancelled')
  await page.goto('/app/reservations')
  await page.getByRole('button', { name: 'Next day' }).click()
  await expect(page.getByTestId('booking-Hamza')).toContainText('Cancelled by guest')
})
