'use client'

import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { redactFeedbackCode } from '@/lib/feedback'

/**
 * Vercel Analytics and Speed Insights with the Feedback Code redacted from
 * `/f/` URLs (speaker feedback spec §7.1). A client wrapper because
 * `beforeSend` is a function, which the Server Component root layout cannot
 * pass to a client component.
 */
export function VercelInsights() {
  return (
    <>
      <Analytics beforeSend={redactFeedbackCode} />
      <SpeedInsights beforeSend={redactFeedbackCode} />
    </>
  )
}
