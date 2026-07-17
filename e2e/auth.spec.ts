import { test, expect } from '@playwright/test'
import { e2eSpeaker } from './utils/session'

/**
 * Login / session e2e (#451). Uses a minted real session cookie (see
 * auth.setup.ts) so these exercise the app's ACTUAL auth gate, not the
 * test-mode bypass.
 *
 * SCAFFOLD NOTE: authored without a runnable app in the dev sandbox. The
 * selectors below are best-effort against the current header/UserMenu; verify
 * and adjust when you first run this (see e2e/README.md). A protected route is
 * anything under /cfp/* (except bare /cfp), /admin/*, /cli/* (see src/proxy.ts).
 */

const PROTECTED = '/cfp/list'

test.describe('unauthenticated', () => {
  // Drop the authenticated storage state for this group.
  test.use({ storageState: { cookies: [], origins: [] } })

  test('redirects a protected route to sign-in', async ({ page }) => {
    await page.goto(PROTECTED)
    // proxy.ts sends unauthenticated users to /api/auth/signin, which resolves
    // to the custom /signin page. NB: don't assert the URL lacks the protected
    // path — the sign-in URL carries it back as a `callbackUrl` param. Assert
    // the landing PATHNAME is the sign-in page instead.
    await expect(page).toHaveURL(/signin/)
    expect(new URL(page.url()).pathname).not.toBe(PROTECTED)
  })
})

test.describe('authenticated (minted session cookie)', () => {
  test('reaches the speaker dashboard without a redirect', async ({ page }) => {
    await page.goto(PROTECTED)
    // On the dashboard (not bounced to sign-in).
    await expect(page).toHaveURL(new RegExp(`${PROTECTED}`))
    await expect(page).not.toHaveURL(/signin/)
  })

  test('shows the signed-in user menu (avatar)', async ({ page }) => {
    await page.goto(PROTECTED)
    // The UserMenu button is an avatar image with alt = the user's name.
    await expect(
      page.getByRole('img', { name: e2eSpeaker().name }).first(),
    ).toBeVisible()
  })

  test('persists the session across navigation between protected pages', async ({
    page,
  }) => {
    await page.goto(PROTECTED)
    await expect(page).toHaveURL(new RegExp(PROTECTED))
    await page.goto('/cfp/profile')
    // Still authenticated → not redirected to sign-in.
    await expect(page).not.toHaveURL(/signin/)
  })

  test('signing out de-authenticates and blocks the protected route', async ({
    page,
  }) => {
    await page.goto(PROTECTED)

    // Open the avatar menu, then click Sign Out. Selectors are best-effort:
    // the MenuButton's accessible name comes from the avatar img alt (the name).
    await page.getByRole('button', { name: e2eSpeaker().name }).click()
    await page
      .getByRole('menuitem', { name: /sign ?out/i })
      .or(page.getByRole('button', { name: /sign ?out/i }))
      .first()
      .click()

    // After sign-out the session cookie is cleared; the protected route must
    // now redirect back to sign-in.
    await page.goto(PROTECTED)
    await expect(page).toHaveURL(/signin/)
  })

  // The self-service provider-linking flow and its shared-browser abuse residual
  // (#451) need the link-intent cookie + a second-provider callback, which this
  // cookie-minting scaffold does not yet drive. Covered as a unit/abuse suite in
  // __tests__/lib/auth/auth-link-abuse.test.ts; port to e2e here next.
  test.skip('self-service provider linking + shared-browser abuse residual', () => {})
})
