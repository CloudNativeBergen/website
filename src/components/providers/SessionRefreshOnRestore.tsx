'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'

/**
 * Refreshes the client session when the page is restored from the browser's
 * back/forward cache (bfcache).
 *
 * On sign-in the browser performs a cross-document OAuth navigation and may
 * store the previous (signed-out) page in bfcache as a frozen snapshot where
 * `useSession()` is still `null`. Pressing Back restores that frozen tree
 * without re-rendering, so a session-derived header shows as signed-out until
 * a manual reload.
 *
 * NextAuth's default `refetchOnWindowFocus` listens on `visibilitychange`,
 * which a same-tab bfcache restore does NOT fire. A bfcache restore instead
 * fires `pageshow` with `event.persisted === true`. Handling that event and
 * calling `update()` re-fetches `/api/auth/session` and updates the client
 * session context, correcting the UI while preserving bfcache (we do not
 * disable it).
 *
 * Renders nothing; must be mounted inside a `SessionProvider`.
 */
export function SessionRefreshOnRestore() {
  const { update } = useSession()

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void update()
      }
    }

    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [update])

  return null
}
