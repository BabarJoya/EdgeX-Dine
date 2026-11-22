import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

// Cloud dev containers ship a pre-installed Chromium; CI installs its own.
const localChromium = '/opt/pw-browsers/chromium'
const executablePath = !process.env.CI && existsSync(localChromium) ? localChromium : undefined

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off',
    launchOptions: { executablePath },
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: /platform\.spec/,
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } },
    },
    {
      name: 'mobile',
      testIgnore: /platform\.spec/,
      use: { ...devices['Pixel 7'], launchOptions: { executablePath } },
    },
    // The platform test flips global settings (e.g. "approve new restaurants"),
    // so it runs alone after everything else instead of racing other sign-ups.
    {
      name: 'platform',
      testMatch: /platform\.spec/,
      dependencies: ['desktop', 'mobile'],
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
