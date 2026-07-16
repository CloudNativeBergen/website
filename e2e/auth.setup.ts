import { test as setup } from '@playwright/test'
import { mintSessionToken, SESSION_COOKIE_NAME } from './utils/session'

const AUTH_FILE = 'e2e/.auth/user.json'

/**
 * Setup project: mint a real session cookie and persist it as Playwright
 * storage state, so the authenticated specs start already signed in. Runs once
 * before the `chromium` project (see playwright.config.ts `dependencies`).
 */
setup('authenticate', async ({ browser }) => {
  const token = await mintSessionToken()

  const context = await browser.newContext()
  await context.addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      // Session cookie for the run; the JWT itself carries the real expiry.
      expires: -1,
    },
  ])

  await context.storageState({ path: AUTH_FILE })
  await context.close()
})
