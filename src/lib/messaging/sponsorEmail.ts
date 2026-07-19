import 'server-only'
import React from 'react'
import { resend, retryWithBackoff } from '@/lib/email/config'
import { SponsorMessageNotificationTemplate } from '@/components/email/SponsorMessageNotificationTemplate'
import type { Conference } from '@/lib/conference/types'
import { formatConferenceDateLong } from '@/lib/time'

/** One contact-person recipient of an organizer→sponsor message email. */
export interface SponsorMessageEmailRecipient {
  email: string
  name: string
}

/** How many recipient emails to have in flight at once (mirrors messaging email.ts). */
const EMAIL_CONCURRENCY = 3

/**
 * Send an ORGANIZER→SPONSOR new-message email to a single contact person from
 * the conference `sponsorEmail` from-address. Never throws — an email failure
 * must not fail the (already committed) message write.
 */
async function sendOne(
  recipient: SponsorMessageEmailRecipient,
  {
    authorName,
    subject,
    excerpt,
    portalUrl,
    conference,
  }: {
    authorName: string
    subject: string
    excerpt: string
    portalUrl: string
    conference: Conference
  },
): Promise<boolean> {
  try {
    await retryWithBackoff(async () => {
      const fromEmail = conference.sponsorEmail || conference.cfpEmail
      const fromName = conference.organizer || conference.title
      const result = await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: [recipient.email],
        subject: `New message about "${subject}"`,
        react: React.createElement(SponsorMessageNotificationTemplate, {
          recipientName: recipient.name,
          authorName,
          subject,
          excerpt,
          portalUrl,
          eventName: conference.title,
          eventLocation: `${conference.city}, ${conference.country}`,
          eventDate: conference.startDate
            ? formatConferenceDateLong(conference.startDate)
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
    console.error('Failed to send sponsor message email:', error)
    return false
  }
}

/**
 * Send organizer→sponsor new-message emails to every contact person with
 * BOUNDED CONCURRENCY (mirrors `sendMessageEmails`): at most
 * {@link EMAIL_CONCURRENCY} in-flight sends. `sendOne` never throws and
 * `retryWithBackoff` absorbs Resend 429s. Returns how many were delivered.
 */
export async function sendSponsorMessageEmails(
  recipients: SponsorMessageEmailRecipient[],
  context: {
    authorName: string
    subject: string
    excerpt: string
    portalUrl: string
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
  await Promise.allSettled(workers)
  return sent
}
