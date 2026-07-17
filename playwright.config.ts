import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

// Load the app's env so the auth setup can mint a session token with the SAME
// AUTH_SECRET the running app uses to decode it.
dotenv.config({ path: ['.env.local', '.env'] })

/**
 * Playwright e2e config for the Next.js app (distinct from the Storybook
 * test-runner). Boots `next dev` and drives real browser auth flows using a
 * minted session cookie (see e2e/auth.setup.ts). SCAFFOLD — authored without a
 * runnable app in the dev sandbox; run + verify in an environment where the app
 * boots (deps installed, AUTH_SECRET + Sanity config present). See e2e/README.md.
 */
export default defineConfig({
  testDir: './e2e',
  // Never pick up the Storybook test-runner specs or the vitest suite.
  testMatch: /.*\.(setup|spec)\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    // Mints the authenticated storage state consumed by the authed specs.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      // Only run *.spec.ts here — without this, the top-level testMatch would
      // also run auth.setup.ts as a chromium test (re-minting on every worker).
      testMatch: /.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  // Boots the app for the run. Uses an existing dev server if one is already up.
  webServer: {
    command: 'pnpm dev',
    url: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
