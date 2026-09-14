'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { isAnalyticsExcludedPath } from '@/lib/posthog/config'
import { notifyEligibleRoute } from '@/lib/posthog/runtime'

/**
 * Tells the client entry when the app is on a route PostHog may run on. The
 * entry initialises immediately on a public page; opened on an excluded route
 * (admin, speaker portal) it waits for this signal, which fires on every
 * client-side navigation onto a public path. Renders nothing.
 */
export function AnalyticsRouteGate() {
  const pathname = usePathname()
  useEffect(() => {
    if (pathname && !isAnalyticsExcludedPath(pathname)) {
      notifyEligibleRoute(window)
    }
  }, [pathname])
  return null
}
