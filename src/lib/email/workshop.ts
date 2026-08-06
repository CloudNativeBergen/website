import { escapeHtml } from '@/lib/html/escape'
import { PLATFORM_NAME } from '@/lib/branding/platform'
import {
  resolveEmailSender,
  retryWithBackoff,
  createEmailError,
  type EmailResult,
} from './config'
import type { Conference } from '@/lib/conference/types'
import {
  conferenceBaseUrl,
  hasConferenceDomain,
} from '@/lib/conference/baseUrl'
import { resolveConferenceFrom, resolveConferenceContact } from './from'
import { emailBrandColor } from '@/lib/branding/theme'
import { resolveEmailBrandPalette } from '@/lib/branding/email'

export interface WorkshopConfirmationEmailRequest {
  userEmail: string
  userName: string
  status?: string
  conference?: Conference
  /**
   * The owning tenant, for call sites that have an org id but no conference
   * document (the admin `manualSignup` path). Takes precedence over
   * `conference.organization`; nullish ⇒ the shared platform account (#843).
   */
  orgId?: string | null
  workshopTitle: string
  workshopDate?: string
  workshopTime?: string
}

export interface WorkshopSignupInstructionsRequest {
  userEmail: string
  userName: string
  conference: Conference
  ticketCategory: string
}

export async function sendBasicWorkshopConfirmation({
  userEmail,
  userName,
  status = 'confirmed',
  conference,
  orgId,
  workshopTitle,
  workshopDate,
  workshopTime,
}: WorkshopConfirmationEmailRequest): Promise<
  EmailResult<{ emailId: string }>
> {
  try {
    const fromEmail = resolveConferenceFrom(conference)

    const contactEmail = resolveConferenceContact(conference)

    const subject = `Workshop Confirmation: ${workshopTitle}`

    const brand = resolveEmailBrandPalette(emailBrandColor(conference?.theme))

    const statusText = status === 'confirmed' ? 'Confirmed' : 'Waitlist'
    const statusColor = status === 'confirmed' ? '#059669' : '#D97706'

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #F9FAFB; color: #334155;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9FAFB; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #FFFFFF; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="margin: 0 0 20px 0; font-size: 28px; font-weight: 700; color: ${brand.accent};">Workshop Confirmation</h2>
                    <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 24px; color: #334155;">Hi ${userName},</p>
                    <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #334155;">Your registration for <strong>${workshopTitle}</strong> has been confirmed!</p>

                    ${
                      workshopDate && workshopTime
                        ? `
                    <div style="background-color: ${brand.cardBackground}; border-left: 4px solid ${brand.accent}; padding: 16px; margin: 0 0 24px 0;">
                      <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #334155;">Workshop Details:</p>
                      <p style="margin: 0; font-size: 16px; line-height: 24px; color: #334155;">
                        <strong>Date:</strong> ${workshopDate}<br>
                        <strong>Time:</strong> ${workshopTime}
                      </p>
                    </div>
                    `
                        : ''
                    }

                    <div style="background-color: ${status === 'confirmed' ? '#ECFDF5' : '#FEF3C7'}; border-left: 4px solid ${statusColor}; padding: 16px; margin: 0 0 24px 0;">
                      <p style="margin: 0; font-size: 16px; line-height: 24px; color: #334155;">
                        <strong>Status:</strong> <span style="color: ${statusColor};">${statusText}</span>
                      </p>
                      ${status === 'waitlist' ? `<p style="margin: 8px 0 0 0; font-size: 14px; line-height: 20px; color: #334155;">You&apos;re on the waitlist. We&apos;ll notify you if a spot becomes available.</p>` : ''}
                    </div>

                    <p style="margin: 24px 0 16px 0; font-size: 16px; line-height: 24px; color: #334155;">We look forward to seeing you at the workshop!</p>

                    <p style="margin: 32px 0 16px 0; font-size: 14px; line-height: 20px; color: #334155;">If you have any questions, please contact us at <a href="mailto:${contactEmail}" style="color: ${brand.accent}; text-decoration: none;">${contactEmail}</a>.</p>

                    <p style="margin: 24px 0 0 0; font-size: 16px; line-height: 24px; color: #334155;">Best regards,<br><strong>${conference?.organizer || PLATFORM_NAME}</strong></p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 24px 40px; background-color: #F9FAFB; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
                    <p style="margin: 0; font-size: 12px; line-height: 18px; color: #64748B; text-align: center;">© ${new Date().getFullYear()} ${conference?.organizer || PLATFORM_NAME}. All rights reserved.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `

    const { client } = await resolveEmailSender(
      orgId ?? conference?.organization?._ref,
    )

    const emailResult = await retryWithBackoff(async () => {
      const result = await client.emails.send({
        from: fromEmail,
        to: [userEmail],
        subject,
        html,
      })

      if (result.error) {
        throw new Error(`Failed to send email: ${result.error.message}`)
      }

      return result
    })

    return {
      data: {
        emailId: emailResult.data?.id || '',
      },
    }
  } catch (error) {
    console.error('Error sending workshop confirmation email:', error)
    return {
      error: createEmailError('Failed to send confirmation email', 500),
    }
  }
}

export async function sendWorkshopSignupInstructions({
  userEmail,
  userName,
  conference,
  ticketCategory,
}: WorkshopSignupInstructionsRequest): Promise<
  EmailResult<{ emailId: string }>
> {
  try {
    const fromEmail = resolveConferenceFrom(conference)

    const contactEmail = resolveConferenceContact(conference)

    const brand = resolveEmailBrandPalette(emailBrandColor(conference?.theme))

    const workshopUrl = hasConferenceDomain(conference)
      ? `${conferenceBaseUrl(conference)}/workshop`
      : ''

    const subject = `Workshop Signup Available - ${conference.title}`

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #F9FAFB; color: #334155;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9FAFB; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #FFFFFF; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="margin: 0 0 20px 0; font-size: 28px; font-weight: 700; color: ${brand.accent};">Welcome to ${conference.title}!</h2>
                    <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 24px; color: #334155;">Hi ${userName},</p>
                    <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #334155;">Thank you for purchasing your <strong>${ticketCategory}</strong> ticket!</p>

                    <h3 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: ${brand.accent};">Workshop Registration Now Available</h3>
                    <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #334155;">Your ticket includes access to workshops. You can now sign up for available workshop sessions.</p>

                    <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #334155;">How to register for workshops:</p>
                    <ol style="margin: 0 0 24px 0; padding-left: 24px;">
                      ${workshopUrl ? `<li style="margin: 0 0 8px 0; font-size: 16px; line-height: 24px; color: #334155;">Visit the workshop signup page: <a href="${workshopUrl}" style="color: ${brand.accent}; text-decoration: none;">${workshopUrl}</a></li>` : ''}
                      <li style="margin: 0 0 8px 0; font-size: 16px; line-height: 24px; color: #334155;">Sign in with the email address associated with your ticket: <strong>${userEmail}</strong></li>
                      <li style="margin: 0 0 8px 0; font-size: 16px; line-height: 24px; color: #334155;">Browse available workshops and select the ones you&apos;d like to attend</li>
                      <li style="margin: 0 0 8px 0; font-size: 16px; line-height: 24px; color: #334155;">Complete your registration</li>
                    </ol>

                    <div style="background-color: ${brand.cardBackground}; border-left: 4px solid ${brand.accent}; padding: 16px; margin: 0 0 24px 0;">
                      <p style="margin: 0; font-size: 16px; line-height: 24px; color: #334155;"><strong>Important:</strong> Workshops have limited capacity and are first-come, first-served. We recommend signing up as soon as possible to secure your spot!</p>
                    </div>

                    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
                      <tr>
                        <td align="center">
                          ${workshopUrl ? `<a href="${workshopUrl}" style="display: inline-block; background-color: ${brand.accent}; color: #FFFFFF; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px;">Sign Up for Workshops</a>` : ''}
                        </td>
                      </tr>
                    </table>

                    <p style="margin: 32px 0 16px 0; font-size: 14px; line-height: 20px; color: #334155;">If you have any questions or need assistance, please contact us at <a href="mailto:${contactEmail}" style="color: ${brand.accent}; text-decoration: none;">${contactEmail}</a>.</p>

                    <p style="margin: 24px 0 0 0; font-size: 16px; line-height: 24px; color: #334155;">See you at the conference!</p>
                    <p style="margin: 8px 0 0 0; font-size: 16px; line-height: 24px; color: #334155;">Best regards,<br><strong>${conference.organizer}</strong></p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 24px 40px; background-color: #F9FAFB; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
                    <p style="margin: 0; font-size: 12px; line-height: 18px; color: #64748B; text-align: center;">© ${new Date().getFullYear()} ${conference.organizer}. All rights reserved.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `

    const { client } = await resolveEmailSender(conference?.organization?._ref)

    const emailResult = await retryWithBackoff(async () => {
      const result = await client.emails.send({
        from: fromEmail,
        to: [userEmail],
        subject,
        html,
      })

      if (result.error) {
        throw new Error(`Failed to send email: ${result.error.message}`)
      }

      return result
    })

    return {
      data: {
        emailId: emailResult.data?.id || '',
      },
    }
  } catch (error) {
    console.error('Error sending workshop signup instructions email:', error)
    return {
      error: createEmailError(
        'Failed to send workshop signup instructions',
        500,
      ),
    }
  }
}

export interface WorkshopAnnouncementEmailRequest {
  userEmail: string
  userName: string
  conference?: Conference
  workshopTitle: string
  /** Display name of the owner/organizer who wrote the announcement. */
  authorName: string
  /** Raw announcement text (owner-authored). MUST be HTML-escaped before embed. */
  body: string
}

/**
 * Send ONE announcement email to ONE confirmed workshop participant. This is the
 * attendee-facing counterpart to `sendBasicWorkshopConfirmation` (raw-HTML,
 * Resend, retry-with-backoff) — deliberately NOT the speaker-audience messaging
 * BaseEmailTemplate, since recipients are workshop attendees. Returns an
 * `EmailResult` and never throws; the caller fans out with bounded concurrency
 * and tolerates per-recipient failures.
 */
export async function sendWorkshopAnnouncementEmail({
  userEmail,
  userName,
  conference,
  workshopTitle,
  authorName,
  body,
}: WorkshopAnnouncementEmailRequest): Promise<
  EmailResult<{ emailId: string }>
> {
  try {
    const fromEmail = resolveConferenceFrom(conference)

    const contactEmail = resolveConferenceContact(conference)

    const brand = resolveEmailBrandPalette(emailBrandColor(conference?.theme))

    const subject = `Workshop Update: ${workshopTitle}`
    const safeBody = escapeHtml(body).replace(/\r?\n/g, '<br>')

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #F9FAFB; color: #334155;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9FAFB; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #FFFFFF; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="margin: 0 0 8px 0; font-size: 28px; font-weight: 700; color: ${brand.accent};">Workshop Update</h2>
                    <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #64748B;">${escapeHtml(workshopTitle)}</p>
                    <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 24px; color: #334155;">Hi ${escapeHtml(userName)},</p>
                    <div style="background-color: #F1F5F9; border-left: 4px solid ${brand.accent}; padding: 16px 20px; margin: 0 0 24px 0; border-radius: 4px;">
                      <p style="margin: 0; font-size: 16px; line-height: 24px; color: #334155;">${safeBody}</p>
                    </div>
                    <p style="margin: 24px 0 0 0; font-size: 14px; line-height: 20px; color: #64748B;">— ${escapeHtml(authorName)}</p>
                    <p style="margin: 24px 0 16px 0; font-size: 14px; line-height: 20px; color: #334155;">If you have any questions, please contact us at <a href="mailto:${contactEmail}" style="color: ${brand.accent}; text-decoration: none;">${contactEmail}</a>.</p>
                    <p style="margin: 16px 0 0 0; font-size: 16px; line-height: 24px; color: #334155;">Best regards,<br><strong>${escapeHtml(conference?.organizer || PLATFORM_NAME)}</strong></p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 24px 40px; background-color: #F9FAFB; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
                    <p style="margin: 0; font-size: 12px; line-height: 18px; color: #64748B; text-align: center;">© ${new Date().getFullYear()} ${escapeHtml(conference?.organizer || PLATFORM_NAME)}. You are receiving this because you are a confirmed participant of this workshop.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `

    const { client } = await resolveEmailSender(conference?.organization?._ref)

    const emailResult = await retryWithBackoff(async () => {
      const result = await client.emails.send({
        from: fromEmail,
        to: [userEmail],
        subject,
        html,
      })

      if (result.error) {
        throw new Error(`Failed to send email: ${result.error.message}`)
      }

      return result
    })

    return {
      data: {
        emailId: emailResult.data?.id || '',
      },
    }
  } catch (error) {
    console.error('Error sending workshop announcement email:', error)
    return {
      error: createEmailError('Failed to send announcement email', 500),
    }
  }
}
