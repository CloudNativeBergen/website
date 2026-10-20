import React from 'react'
import { render } from '@react-email/render'
import { SessionFeedbackSummaryTemplate } from '@/components/email/SessionFeedbackSummaryTemplate'
import { emailBrandColor } from '@/lib/branding/theme'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import type { Conference } from '@/lib/conference/types'
import type { FeedbackTotals } from '@/lib/feedback/totals'
import { formatConferenceDateLong } from '@/lib/time'
import {
  isTransientError,
  resolveEmailSender,
  retryWithBackoff,
} from './config'
import { resolveConferenceFrom } from './from'

export interface FeedbackSummaryEmail {
  to: string
  speakerName: string
  talkTitle: string
  totals: FeedbackTotals
  /** Visible comments: a count, never their text. */
  comments: number
  resultsUrl: string
  conference: Pick<
    Conference,
    | 'title'
    | 'organizer'
    | 'cfpEmail'
    | 'domains'
    | 'theme'
    | 'organization'
    | 'city'
    | 'country'
    | 'startDate'
    | 'socialLinks'
  >
}

/**
 * The Session Feedback summary email (speaker feedback spec §11.1), sent in
 * the conference's name as speaker mail (`cfpEmail`), through the tenant's
 * own Resend account when it has one. Throws when it is not sent: the caller
 * logs it, and never sends it again.
 */
export async function sendFeedbackSummaryEmail({
  to,
  speakerName,
  talkTitle,
  totals,
  comments,
  resultsUrl,
  conference,
}: FeedbackSummaryEmail): Promise<void> {
  const html = await render(
    React.createElement(SessionFeedbackSummaryTemplate, {
      speakerName,
      talkTitle,
      totals,
      comments,
      resultsUrl,
      eventName: conference.title,
      eventLocation: [conference.city, conference.country]
        .filter(Boolean)
        .join(', '),
      eventDate: conference.startDate
        ? formatConferenceDateLong(conference.startDate)
        : '',
      eventUrl: conferenceBaseUrl(conference),
      socialLinks: conference.socialLinks ?? [],
      brandColor: emailBrandColor(conference.theme),
    }),
  )
  const { client } = await resolveEmailSender(conference.organization?._ref)
  // Resend answers a refusal instead of throwing: thrown here, inside the
  // retry, with its status and name, so a rate limit or a 5xx backs off and
  // tries again while a permanent refusal (a bad address) does not.
  await retryWithBackoff(
    async () => {
      const { error } = await client.emails.send({
        from: resolveConferenceFrom(conference, {
          field: 'cfpEmail',
          localPart: 'cfp',
        }),
        to,
        subject: `Your Session Feedback for “${talkTitle}”`,
        html,
      })
      if (error) {
        const wrapped = new Error(
          `Resend refused the email: ${error.message}`,
        ) as Error & { status?: number; resendErrorName?: string }
        const status = (error as { statusCode?: unknown }).statusCode
        if (typeof status === 'number') wrapped.status = status
        if (typeof error.name === 'string') wrapped.resendErrorName = error.name
        throw wrapped
      }
    },
    undefined,
    isTransientError,
  )
}
