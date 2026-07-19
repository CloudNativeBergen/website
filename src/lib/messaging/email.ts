import 'server-only'
import React from 'react'
import { resend, retryWithBackoff } from '@/lib/email/config'
import { MessageNotificationTemplate } from '@/components/email/MessageNotificationTemplate'
import type { Conference } from '@/lib/conference/types'
import { formatDate } from '@/lib/time'

/** One email recipient for a new-message notification. */
export interface MessageEmailRecipient {
  email: string
  name: string
  /** Absolute deep link into the thread for THIS recipient's surface. */
  replyUrl: string
  /**
   * Whether THIS recipient is an organizer. Drives the audience-correct body
   * copy (organizers reach the speaker + fellow organizers; speakers reach the
   * organizers) so the wording matches the per-recipient `replyUrl` surface.
   */
  isOrganizer: boolean
}

/**
 * Send the new-message email to a single recipient. Never throws — an email
 * failure must not fail the (already committed) message write.
 */
async function sendOne(
  recipient: MessageEmailRecipient,
  {
    authorName,
    subject,
    excerpt,
    conference,
  }: {
    authorName: string
    subject: string
    excerpt: string
    conference: Conference
  },
): Promise<boolean> {
  try {
    await retryWithBackoff(async () => {
      const result = await resend.emails.send({
        from: `${conference.organizer} <${conference.cfpEmail}>`,
        to: [recipient.email],
        subject: `New message about "${subject}"`,
        react: React.createElement(MessageNotificationTemplate, {
          recipientName: recipient.name,
          authorName,
          subject,
          excerpt,
          replyUrl: recipient.replyUrl,
          // Audience-correct copy for THIS recipient (matches their replyUrl).
          isOrganizer: recipient.isOrganizer,
          // Settings live on the cfp profile for BOTH audiences; anchor at the
          // notification section so the link matches the in-app gear (A9).
          preferencesUrl: conference.domains?.[0]
            ? `https://${conference.domains[0]}/cfp/profile#notification-settings`
            : undefined,
          eventName: conference.title,
          eventLocation: `${conference.city}, ${conference.country}`,
          eventDate: conference.startDate
            ? formatDate(conference.startDate)
            : '',
          eventUrl: conference.domains?.[0]
            ? `https://${conference.domains[0]}`
            : '',
          socialLinks: conference.socialLinks || [],
        }),
      })
      if (result.error) {
        throw new Error(`Failed to send email: ${result.error.message}`)
      }
      return result
    })
    return true
  } catch (error) {
    console.error('Failed to send message notification email:', error)
    return false
  }
}

/** How many recipient emails to have in flight at once (A8). */
const EMAIL_CONCURRENCY = 3

/**
 * Send new-message emails to several recipients with BOUNDED CONCURRENCY (A8):
 * a fixed pool of at most {@link EMAIL_CONCURRENCY} in-flight sends instead of a
 * serial loop with a per-recipient delay, so a large recipient set no longer
 * turns into a multi-second Send-button hang. `sendOne` never throws and
 * `retryWithBackoff` absorbs Resend rate-limits (429), so no artificial spacing
 * is needed. Per-recipient failures are logged inside `sendOne`; this function
 * never throws and returns how many were delivered.
 */
export async function sendMessageEmails(
  recipients: MessageEmailRecipient[],
  context: {
    authorName: string
    subject: string
    excerpt: string
    conference: Conference
  },
): Promise<number> {
  let sent = 0
  let cursor = 0

  async function worker(): Promise<void> {
    while (cursor < recipients.length) {
      const index = cursor++
      const ok = await sendOne(recipients[index], context)
      if (ok) sent++
    }
  }

  const workers = Array.from(
    { length: Math.min(EMAIL_CONCURRENCY, recipients.length) },
    () => worker(),
  )
  // `sendOne` is never-fail, but allSettled guarantees one worker's rejection
  // can never abandon the others (never-fail contract).
  await Promise.allSettled(workers)
  return sent
}
