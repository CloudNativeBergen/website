import { createHash } from 'node:crypto'
import type { Resend } from 'resend'
import React from 'react'
import { render } from '@react-email/render'
import { SessionFeedbackSummaryTemplate } from '@/components/email/SessionFeedbackSummaryTemplate'
import { emailBrandColor } from '@/lib/branding/theme'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import type { Conference } from '@/lib/conference/types'
import { summaryTitle } from '@/lib/feedback/summary-copy'
import type { FeedbackTotals } from '@/lib/feedback/totals'
import { formatConferenceDateLong } from '@/lib/time'
import {
  EMAIL_CONFIG,
  isTransientError,
  resolveEmailSender,
  retryWithBackoff,
} from './config'
import { resolveConferenceFrom } from './from'

/** What the summary email reads of the talk's conference. */
export type FeedbackSummaryConference = Pick<
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

/**
 * The account and the From a conference's summaries go out through. `key`
 * names the pair, so a run can stop using one that fails (a revoked key, an
 * unverified domain) without stopping the others.
 */
export interface FeedbackSummarySender {
  key: string
  client: Pick<Resend, 'emails'>
  from: string
}

/**
 * Resolved BEFORE a talk is claimed: a tenant whose credentials cannot be
 * determined (`resolveEmailSender` rejects rather than guessing) then leaves
 * its talks unclaimed for the next run, instead of claiming them and failing
 * every email.
 */
export async function resolveFeedbackSummarySender(
  conference: FeedbackSummaryConference,
): Promise<FeedbackSummarySender> {
  const orgId = conference.organization?._ref ?? null
  const { client, platform } = await resolveEmailSender(orgId)
  const from = resolveConferenceFrom(conference, {
    field: 'cfpEmail',
    localPart: 'cfp',
  })
  // The ACTUAL account: an org without its own sends through the shared
  // platform client, and a failure of that account is every such org's.
  const account = platform ? 'platform' : (orgId ?? 'platform')
  return { key: `${account}|${from}`, client, from }
}

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
  conference: FeedbackSummaryConference
  sender: FeedbackSummarySender
}

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
 * Resend is still processing an earlier attempt under the same key (409
 * `concurrent_idempotent_requests`): typically one that timed out here but
 * went through. Whether the email went out is unknown, likely yes.
 */
export const isOutcomeUnknown = (error: unknown): boolean =>
  (error as { resendErrorName?: string } | null)?.resendErrorName ===
  'concurrent_idempotent_requests'

/** Worth retrying: a transient failure, or an outcome still unknown. */
const mayStillDeliver = (error: unknown) =>
  isTransientError(error) || isOutcomeUnknown(error)

/**
 * Resend refused this one email for its request (a malformed or rejected
 * recipient: 422 `validation_error` / `invalid_parameter`), not for anything
 * about the sender. A 403 `validation_error` (an unverified domain), a bad
 * From, a key or quota error, an outage: the sender's, and every other email
 * through it would fail the same way.
 */
export function isRecipientRefusal(error: unknown): boolean {
  const e = error as { status?: unknown; resendErrorName?: unknown } | null
  return (
    e?.status === 422 &&
    (e.resendErrorName === 'validation_error' ||
      e.resendErrorName === 'invalid_parameter')
  )
}

/** How long one attempt may take before it counts as a timeout and is retried. */
const SEND_TIMEOUT_MS = 10_000

/**
 * The longest one summary email can take, from the pause before it to its
 * last attempt giving up: every attempt timing out, with the backoff
 * `retryWithBackoff` waits between them (doubling from the rate-limit
 * delay). Derived from the constants the send uses, so a run can check that
 * a talk's emails fit its time before claiming it.
 */
export const FEEDBACK_SUMMARY_EMAIL_WORST_CASE_MS = (() => {
  const attempts = EMAIL_CONFIG.MAX_RETRIES
  let backoff = 0
  for (let i = 0; i < attempts - 1; i++) {
    backoff += EMAIL_CONFIG.RATE_LIMIT_DELAY * 2 ** i
  }
  return EMAIL_CONFIG.RATE_LIMIT_DELAY + attempts * SEND_TIMEOUT_MS + backoff
})()

function withTimeout<T>(attempt: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(new Error(`Resend send timed out after ${SEND_TIMEOUT_MS} ms`)),
      SEND_TIMEOUT_MS,
    )
  })
  return Promise.race([attempt, timeout]).finally(() => clearTimeout(timer))
}

/**
 * The Session Feedback summary email (speaker feedback spec §11.1), sent in
 * the conference's name as speaker mail (`cfpEmail`), through the sender the
 * caller resolved before claiming. Throws when it is not sent: the caller
 * logs it, and never sends it again.
 */
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
  sender,
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
  // Resend answers a refusal instead of throwing: thrown here, inside the
  // retry, with its status and name, so a rate limit or a 5xx backs off and
  // tries again while a permanent refusal (a bad address) does not. A hung
  // attempt times out and is retried under the same key.
  const idempotencyKey = feedbackSummaryIdempotencyKey(talkId, speakerId)
  await retryWithBackoff(
    async () => {
      const { error } = await withTimeout(
        sender.client.emails.send(
          { from: sender.from, to, subject: summaryTitle(talkTitle), html },
          { idempotencyKey },
        ),
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
