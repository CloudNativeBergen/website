'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { api } from '@/lib/trpc/client'

/**
 * The Badging API surface we use, declared locally so we don't depend on the
 * ambient DOM lib exposing it (it isn't in every TS version's `Navigator`).
 * Both methods return a promise that CAN reject on unsupported/blocked
 * platforms, so every call site swallows rejection.
 */
interface NavigatorBadging {
  setAppBadge?: (contents?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

function badgingNavigator(): (Navigator & NavigatorBadging) | null {
  if (typeof navigator === 'undefined') return null
  if (!('setAppBadge' in navigator)) return null
  return navigator as Navigator & NavigatorBadging
}

/**
 * Keeps the PWA app-icon badge (Badging API) in sync with the signed-in
 * speaker's unread notification count.
 *
 * - Reads the SAME `notification.unreadCount` query the bell uses, so react-query
 *   dedupes it — no extra network. The query is gated on a signed-in session so
 *   signed-out public pages (where this still mounts, app-wide) never fire the
 *   protected request.
 * - `setAppBadge(count)` when count > 0, `clearAppBadge()` when 0.
 * - FEATURE-DETECTED: a no-op when the API is absent (iOS < 16.4, most desktop
 *   browsers). Never throws — the API can reject, and every call catches.
 * - The badge is a SIGNED-IN concept: it is cleared on sign-out and on unmount.
 *
 * Renders nothing. Mounted once app-wide (see SessionProviderWrapper) so it runs
 * on every authenticated page, alongside — not inside — the bell.
 */
export function AppBadgeSync() {
  const { data: session } = useSession()
  const isSignedIn = Boolean(session?.speaker)

  const { data } = api.notification.unreadCount.useQuery(undefined, {
    // Never fire the protected query for a signed-out visitor.
    enabled: isSignedIn,
    // Mirror the bell's cadence so the shared query key resolves to one poll.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  })

  useEffect(() => {
    const nav = badgingNavigator()
    if (!nav) return

    // Signed out → clear. (Also covers the moment a sign-out lands before the
    // gated query has any data.)
    if (!isSignedIn) {
      nav.clearAppBadge?.().catch(() => {})
      return
    }

    const count = data ?? 0
    const result = count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.()
    // The API returns a promise that can reject on unsupported platforms.
    Promise.resolve(result).catch(() => {})
  }, [isSignedIn, data])

  // Clear the badge when this component leaves the tree (full app teardown).
  useEffect(() => {
    return () => {
      const nav = badgingNavigator()
      nav?.clearAppBadge?.().catch(() => {})
    }
  }, [])

  return null
}
