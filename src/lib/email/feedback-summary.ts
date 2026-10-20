import { createHash } from 'node:crypto'
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
  /** With `speakerId`, the email's idempotency key: one email per pair. */
  talkId: string
  speakerId: string
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
/** Resend keeps a key for 24 hours and takes at most 256 characters. */
const MAX_KEY_LENGTH = 256

/**
 * One key per talk and speaker: a retry after a reply that was lost (the
 * first attempt may have been accepted) is then not delivered twice. Resend
 * remembers a key for 24 hours, which covers every retry of one run; later
 * runs never send for the talk again, because it is claimed. Hashed when the
 * ids would not fit.
 */
export function feedbackSummaryIdempotencyKey(
  talkId: string,
  speakerId: string,
): string {
  const key = `feedback-summary/${talkId}/${speakerId}`
  if (key.length <= MAX_KEY_LENGTH) return key
  const digest = createHash('sha256')
    .update(JSON.stringify([talkId, speakerId]))
    .digest('hex')
  return `feedback-summary/${digest}`
}

/**
 * Worth retrying: a transient failure, or Resend still processing an earlier
 * attempt under the same key (409 `concurrent_idempotent_requests`).
 */
const mayStillDeliver = (error: unknown) =>
  isTransientError(error) ||
  (error as { resendErrorName?: string } | null)?.resendErrorName ===
    'concurrent_idempotent_requests'

export async function sendFeedbackSummaryEmail({
  talkId,
  speakerId,
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
  const idempotencyKey = feedbackSummaryIdempotencyKey(talkId, speakerId)
  await retryWithBackoff(
    async () => {
      const { error } = await client.emails.send(
        {
          from: resolveConferenceFrom(conference, {
            field: 'cfpEmail',
            localPart: 'cfp',
          }),
          to,
          subject: `Your Session Feedback for “${talkTitle}”`,
          html,
        },
        { idempotencyKey },
      )
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
    mayStillDeliver,
  )
}
