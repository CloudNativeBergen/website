import 'server-only'
import React from 'react'
import {
  resend,
  retryWithBackoff,
  delay,
  EMAIL_CONFIG,
} from '@/lib/email/config'
import { MessageNotificationTemplate } from '@/components/email/MessageNotificationTemplate'
import type { Conference } from '@/lib/conference/types'
import { formatDate } from '@/lib/time'

/** One email recipient for a new-message notification. */
export interface MessageEmailRecipient {
  email: string
  name: string
  /** Absolute deep link into the thread for THIS recipient's surface. */
  replyUrl: string
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

/**
 * Send new-message emails to several recipients, sequentially with the shared
 * rate-limit delay between sends (mirrors the other email senders). Never
 * throws; returns how many were delivered.
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
  for (let i = 0; i < recipients.length; i++) {
    if (i > 0) await delay(EMAIL_CONFIG.RATE_LIMIT_DELAY)
    const ok = await sendOne(recipients[i], context)
    if (ok) sent++
  }
  return sent
}
