'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { isAnalyticsExcludedPath } from '@/lib/posthog/config'
import { applyConsentChoice, type ConsentChoice } from '@/lib/posthog/consent'
import {
  ANALYTICS_CONSENT_EVENT,
  getAnalyticsRuntime,
  notifyConsentChanged,
  onAnalyticsRuntime,
  type TenantAnalyticsRuntime,
} from '@/lib/posthog/runtime'

/**
 * The analytics consent bar (#1034): a slim bottom bar with one paragraph,
 * two equally weighted buttons and a link to the privacy page. No preferences
 * panel — there is exactly one optional category.
 *
 * Rendered by the root layout's `TenantAnalytics` only when the organization
 * has a PostHog token; it stays invisible until the client runtime reports
 * that the visitor has NOT yet chosen (`pending`), and never shows on the
 * excluded admin/speaker routes. Dismissing is not offered: a visitor who
 * ignores the bar stays in the pending, cookieless state, which is exactly
 * what Decline gives — so the bar is just two honest buttons.
 *
 * Never imports `posthog-js`: it talks to the instance through the window
 * runtime, see `@/lib/posthog/runtime`.
 */
export function AnalyticsConsentBar() {
  const pathname = usePathname()
  const [runtime, setRuntime] = useState<TenantAnalyticsRuntime | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    // Re-read on every consent change too: the privacy page's choice control
    // can answer on the visitor's behalf while this bar is still mounted.
    const refresh = () => {
      const rt = getAnalyticsRuntime(window)
      if (rt) setPending(rt.client.get_explicit_consent_status() === 'pending')
    }
    const unsubscribe = onAnalyticsRuntime(window, (rt) => {
      setRuntime(rt)
      setPending(rt.client.get_explicit_consent_status() === 'pending')
    })
    window.addEventListener(ANALYTICS_CONSENT_EVENT, refresh)
    return () => {
      unsubscribe()
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, refresh)
    }
  }, [])

  if (!runtime || !pending || isAnalyticsExcludedPath(pathname ?? '/')) {
    return null
  }

  const choose = (choice: ConsentChoice) => {
    applyConsentChoice(runtime.client, choice, {
      conference: runtime.config.conference,
      landingUtm: runtime.landingUtm,
    })
    setPending(false)
    notifyConsentChanged(window)
  }

  return (
    <div
      role="region"
      aria-label="Analytics cookie choice"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95 print:hidden"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-inter text-sm text-gray-700 dark:text-gray-300">
          We use PostHog analytics to see which pages and posts bring people
          here. Accept to let us recognise your browser across visits with a
          cookie. Decline and you are counted anonymously, with nothing stored
          on your device.{' '}
          <Link
            href="/privacy#cookies-tracking"
            className="whitespace-nowrap text-brand-cloud-blue underline underline-offset-2 hover:text-brand-slate-gray dark:text-blue-400"
          >
            Privacy policy
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => choose('decline')}
            className="font-inter min-h-11 flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue sm:flex-none dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => choose('accept')}
            className="font-inter min-h-11 flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue sm:flex-none dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}
