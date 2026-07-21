'use client'

import { useEffect } from 'react'

/**
 * sessionStorage key marking that this app SESSION's launch has already been
 * evaluated. In a standalone PWA, sessionStorage is empty on every cold launch
 * and persists across in-app navigations — exactly the "fire once per genuine
 * launch, never on later navigations" semantics we want.
 */
const LAUNCH_REDIRECT_HANDLED_KEY = 'cndn:launch-redirect-handled'

/**
 * iOS `start_url` fallback.
 *
 * The manifest sets `start_url: /launch` (a Route Handler that 307-redirects by
 * role — see `src/app/launch/route.ts`), but iOS does NOT reliably honor
 * `start_url`: "Add to Home Screen" launches the installed app at the URL the
 * user added it from (typically the marketing front page `/`), not `/launch`,
 * and a reinstall does not fix it. So the role-aware launcher never runs and the
 * app opens on the wrong page.
 *
 * This client-side fallback runs ONCE per app session (guarded by a fresh
 * sessionStorage key) and, only when the app is running installed/standalone and
 * the launch landed on the front page, does a FULL navigation to `/launch` so the
 * server redirect logic runs and role-routes correctly.
 *
 * Why the ordering:
 *   1. Set the session guard on the very first mount, unconditionally, so we
 *      evaluate the launch EXACTLY once per session and never re-fire on a later
 *      in-app navigation back to `/`.
 *   2. Bail if not standalone — a normal browser visitor on `/` must never be
 *      redirected away from the marketing page.
 *   3. Bail if the launch page isn't `/` — if iOS DID honor `start_url`, or a
 *      notification cold-opened a deep link, the pathname won't be `/` and we
 *      leave it alone.
 *
 * `window.location.replace` (not the Next router): `/launch` is a server Route
 * Handler returning a 307, so a full navigation is required to run it; `replace`
 * (not `assign`) so the front page isn't left in history. No redirect loop is
 * possible — `/launch` always resolves to `/admin`, `/cfp/list`, or `/program`,
 * never back to `/`.
 *
 * Renders nothing. Mounted once app-wide (see SessionProviderWrapper).
 */
export function StandaloneLaunchRedirect() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Fresh-launch guard FIRST, unconditionally: only ever act on the first page
    // of a session (a genuine launch), never on later in-app navigations to `/`.
    try {
      if (window.sessionStorage.getItem(LAUNCH_REDIRECT_HANDLED_KEY) !== null) {
        return
      }
      window.sessionStorage.setItem(LAUNCH_REDIRECT_HANDLED_KEY, '1')
    } catch {
      // sessionStorage unavailable (private mode / disabled): fall through and
      // evaluate the launch this once; without the guard we can't dedupe, but
      // the standalone + pathname checks below still bound when we act.
    }

    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (window.navigator as { standalone?: boolean }).standalone === true

    // A normal browser visitor must never be redirected.
    if (!standalone) return

    // Only rescue the case where the launch landed on the front page.
    if (window.location.pathname !== '/') return

    window.location.replace('/launch')
  }, [])

  return null
}
