import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
export const API = env.VITE_SUPABASE_URL
export const ANON = env.VITE_SUPABASE_ANON_KEY

/** Sign up a new owner and create a restaurant through the real UI. */
export async function signUpOwner(
  page: Page,
  opts: { email: string; restaurant: string; slug: string },
) {
  await page.goto('/signup')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Email').fill(opts.email)
  await page.getByLabel('Password').fill('S3cure-pass!')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByLabel('Restaurant name').fill(opts.restaurant)
  await page.getByLabel('Menu web address').fill(opts.slug)
  await page.getByRole('button', { name: 'Create restaurant' }).click()
  await expect(page).toHaveURL(/\/app$/)
}

async function call(path: string, init: RequestInit) {
  const r = await fetch(`${API}/rest/v1/${path}`, init)
  const text = await r.text()
  const json = text ? JSON.parse(text) : null
  if (!r.ok) throw new Error(`${path}: ${text}`)
  return json
}

/** REST helper acting as the signed-in user in `page` (RLS applies). */
export async function asUser(page: Page) {
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
    get: (path: string) => call(path, { headers }),
    post: (path: string, body: unknown) =>
      call(path, { method: 'POST', headers, body: JSON.stringify(body) }),
  }
}

/** Anonymous guest calls (what a phone scanning a QR code can do). */
export const asGuest = {
  rpc: (fn: string, body: unknown) =>
    call(`rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
}

/**
 * Direct SQL on the local test database, for setup the app deliberately
 * cannot do (e.g. making someone a platform admin).
 */
export function sql(query: string) {
  const url = process.env.TEST_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
  return execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-qtAc', query], {
    encoding: 'utf8',
  }).trim()
}
