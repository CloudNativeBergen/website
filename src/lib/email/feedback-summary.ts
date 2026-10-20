import React from 'react'
import { render } from '@react-email/render'
import { SessionFeedbackSummaryTemplate } from '@/components/email/SessionFeedbackSummaryTemplate'
import { emailBrandColor } from '@/lib/branding/theme'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import type { Conference } from '@/lib/conference/types'
import type { FeedbackTotals } from '@/lib/feedback/totals'
import { formatConferenceDateLong } from '@/lib/time'
import { resolveEmailSender, retryWithBackoff } from './config'
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
  const result = await retryWithBackoff(() =>
    client.emails.send({
      from: resolveConferenceFrom(conference, {
        field: 'cfpEmail',
        localPart: 'cfp',
      }),
      to,
      subject: `Your Session Feedback for “${talkTitle}”`,
      html,
    }),
  )
  if (result.error) {
    throw new Error(`Resend refused the email: ${result.error.message}`)
  }
}
