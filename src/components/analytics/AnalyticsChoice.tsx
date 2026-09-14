'use client'

import { useEffect, useState } from 'react'
import {
  applyConsentChoice,
  type ConsentChoice,
  type ConsentStatus,
} from '@/lib/posthog/consent'
import {
  ANALYTICS_CONSENT_EVENT,
  getAnalyticsRuntime,
  notifyConsentChanged,
  onAnalyticsRuntime,
  type TenantAnalyticsRuntime,
} from '@/lib/posthog/runtime'

const LABEL: Record<ConsentStatus, string> = {
  granted: 'accepted',
  denied: 'declined',
  pending: 'not chosen yet (counted anonymously)',
}

/**
 * The "Your analytics choice: … [change]" control in the privacy page's
 * cookies section (#1034 item 4). The one place a visitor changes an earlier
 * Accept/Decline; the footer's "Cookie settings" link points here.
 *
 * Rendered only on sites the organization has switched to PostHog (the server
 * page decides). Reads the live status from the window runtime and re-reads
 * it whenever the consent bar or this control applies a choice.
 */
export function AnalyticsChoice() {
  const [runtime, setRuntime] = useState<TenantAnalyticsRuntime | null>(null)
  const [status, setStatus] = useState<ConsentStatus | null>(null)

  useEffect(() => {
    const refresh = () => {
      const rt = getAnalyticsRuntime(window)
      if (rt) setStatus(rt.client.get_explicit_consent_status())
    }
    const unsubscribe = onAnalyticsRuntime(window, (rt) => {
      setRuntime(rt)
      setStatus(rt.client.get_explicit_consent_status())
    })
    window.addEventListener(ANALYTICS_CONSENT_EVENT, refresh)
    return () => {
      unsubscribe()
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, refresh)
    }
  }, [])

  const choose = (choice: ConsentChoice) => {
    if (!runtime) return
    applyConsentChoice(runtime.client, choice, {
      conference: runtime.config.conference,
      landingUtm: runtime.landingUtm,
    })
    notifyConsentChanged(window)
  }

  // No runtime: analytics is blocked in this browser (or scripts are off), so
  // there is nothing to choose — say so rather than render dead buttons.
  if (!runtime || !status) {
    return (
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        <strong>Your analytics choice:</strong> analytics is not running in this
        browser, so there is nothing to change.
      </p>
    )
  }

  const alternative: ConsentChoice = status === 'granted' ? 'decline' : 'accept'

  return (
    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
      <strong>Your analytics choice:</strong> {LABEL[status]}.{' '}
      <button
        type="button"
        onClick={() => choose(alternative)}
        className="text-brand-cloud-blue underline underline-offset-2 hover:text-brand-slate-gray dark:text-blue-400"
      >
        {alternative === 'accept' ? 'Accept the cookie' : 'Decline the cookie'}
      </button>
    </p>
  )
}
