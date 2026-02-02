import { Resend } from 'resend'
import { BadgeEmailTemplate } from '@/components/email/BadgeEmailTemplate'
import { updateBadgeEmailStatus } from '@/lib/badge/sanity'
import type { BadgeRecord } from '@/lib/badge/types'
import type { Conference } from '@/lib/conference/types'

const resend = new Resend(process.env.RESEND_API_KEY)

interface SendBadgeEmailParams {
  badge: BadgeRecord
  speakerEmail: string
  speakerName: string
  conferenceName: string
  conferenceYear: string
  conference: Conference
}

interface SendBadgeEmailResult {
  success: boolean
  error?: string
  emailId?: string
}

/**
 * Send a badge notification email to a speaker
 */
export async function sendBadgeEmail({
  badge,
  speakerEmail,
  speakerName,
  conferenceName,
  conferenceYear,
  conference,
}: SendBadgeEmailParams): Promise<SendBadgeEmailResult> {
  try {
    // Generate download URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const downloadUrl = `${baseUrl}/api/badge/${badge.badge_id}/download`

    // Generate email HTML
    const emailHtml = BadgeEmailTemplate({
      speakerName,
      conferenceName,
      conferenceYear,
      badgeType: badge.badge_type,
      downloadUrl,
    })

    // Determine from email using conference data
    const fromEmail = conference.contact_email
      ? `${conference.organizer} <${conference.contact_email}>`
      : conference.domains?.[0]
        ? `${conference.organizer} <contact@${conference.domains[0]}>`
        : 'Cloud Native Days <contact@cloudnativedays.org>'

    // Send email using Resend
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: speakerEmail,
      subject: `Your ${badge.badge_type} badge for ${conferenceName} ${conferenceYear}`,
      html: emailHtml,
    })

    if (error) {
      console.error('Error sending badge email:', error)
      return {
        success: false,
        error: error.message,
      }
    }

    // Update badge record with email sent status
    await updateBadgeEmailStatus(badge.badge_id, 'sent', data?.id)

    return {
      success: true,
      emailId: data?.id,
    }
  } catch (error) {
    console.error('Error sending badge email:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Send badge emails with retry logic
 */
export async function sendBadgeEmailWithRetry(
  params: SendBadgeEmailParams,
  maxRetries = 3,
): Promise<SendBadgeEmailResult> {
  let lastError: string | undefined

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await sendBadgeEmail(params)

    if (result.success) {
      return result
    }

    lastError = result.error

    // Wait before retrying (exponential backoff)
    if (attempt < maxRetries) {
      const delay = Math.pow(2, attempt) * 1000 // 2s, 4s, 8s
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  // Update badge record with failed status
  await updateBadgeEmailStatus(
    params.badge.badge_id,
    'failed',
    undefined,
    lastError,
  )

  return {
    success: false,
    error: lastError || 'Failed after multiple retries',
  }
}
