'use client'

import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { dropFeedbackVitals, redactFeedbackCode } from '@/lib/feedback'
import { isScreenModePath, isScreenModeUrl } from '@/lib/photo-wall/screen'

/**
 * Vercel Analytics with the Feedback Code redacted from `/f/` URLs, and Speed
 * Insights sending nothing from them (speaker feedback spec §7.1); neither
 * sends anything from the Photo Wall's Screen Mode, `/wall/screen` (Photo
 * Wall spec §9.2: a venue screen polling for days is not a visit). A client
 * wrapper because `beforeSend` is a function, which the Server Component
 * root layout cannot pass to a client component.
 */
export function VercelInsights() {
  return (
    <>
      <Analytics
        beforeSend={(event) =>
          isScreenModeUrl(event.url) ? null : redactFeedbackCode(event)
        }
      />
      <SpeedInsights
        beforeSend={(event) =>
          // The route too: it is built from the raw path (see `dropFeedbackVitals`).
          isScreenModeUrl(event.url) || isScreenModePath(event.route)
            ? null
            : dropFeedbackVitals(event)
        }
      />
    </>
  )
}
