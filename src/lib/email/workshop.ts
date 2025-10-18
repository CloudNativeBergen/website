import {
  resend,
  retryWithBackoff,
  createEmailError,
  type EmailResult,
} from './config'
import type { Conference } from '@/lib/conference/types'

export interface WorkshopConfirmationEmailRequest {
  userEmail: string
  userName: string
  status?: string
  conference?: Conference
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
  workshopTitle,
  workshopDate,
  workshopTime,
}: WorkshopConfirmationEmailRequest): Promise<
  EmailResult<{ emailId: string }>
> {
  try {
    const fromEmail = conference?.contact_email
      ? `${conference.organizer} <${conference.contact_email}>`
      : conference?.domains?.[0]
        ? `${conference.organizer} <noreply@${conference.domains[0]}>`
        : 'Cloud Native Bergen <noreply@cloudnativebergen.no>'

    const subject = `Workshop Confirmation: ${workshopTitle}`

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
                    <h2 style="margin: 0 0 20px 0; font-size: 28px; font-weight: 700; color: #1D4ED8;">Workshop Confirmation</h2>
                    <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 24px; color: #334155;">Hi ${userName},</p>
                    <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #334155;">Your registration for <strong>${workshopTitle}</strong> has been confirmed!</p>

                    ${
                      workshopDate && workshopTime
                        ? `
                    <div style="background-color: #E0F2FE; border-left: 4px solid #1D4ED8; padding: 16px; margin: 0 0 24px 0;">
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

                    <p style="margin: 32px 0 16px 0; font-size: 14px; line-height: 20px; color: #334155;">If you have any questions, please contact us at <a href="mailto:contact@cloudnativebergen.dev" style="color: #1D4ED8; text-decoration: none;">contact@cloudnativebergen.dev</a>.</p>

                    <p style="margin: 24px 0 0 0; font-size: 16px; line-height: 24px; color: #334155;">Best regards,<br><strong>${conference?.organizer || 'Cloud Native Bergen'}</strong></p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 24px 40px; background-color: #F9FAFB; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
                    <p style="margin: 0; font-size: 12px; line-height: 18px; color: #64748B; text-align: center;">© ${new Date().getFullYear()} ${conference?.organizer || 'Cloud Native Bergen'}. All rights reserved.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `

    const emailResult = await retryWithBackoff(async () => {
      const result = await resend.emails.send({
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
    const fromEmail = conference.contact_email
      ? `${conference.organizer} <${conference.contact_email}>`
      : conference.domains?.[0]
        ? `${conference.organizer} <noreply@${conference.domains[0]}>`
        : 'Cloud Native Bergen <noreply@cloudnativebergen.no>'

    const workshopUrl = conference.domains?.[0]
      ? `https://${conference.domains[0]}/workshop`
      : 'https://cloudnativebergen.no/workshop'

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
                    <h2 style="margin: 0 0 20px 0; font-size: 28px; font-weight: 700; color: #1D4ED8;">Welcome to ${conference.title}!</h2>
                    <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 24px; color: #334155;">Hi ${userName},</p>
                    <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #334155;">Thank you for purchasing your <strong>${ticketCategory}</strong> ticket!</p>

                    <h3 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: #1D4ED8;">Workshop Registration Now Available</h3>
                    <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #334155;">Your ticket includes access to workshops. You can now sign up for available workshop sessions.</p>

                    <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #334155;">How to register for workshops:</p>
                    <ol style="margin: 0 0 24px 0; padding-left: 24px;">
                      <li style="margin: 0 0 8px 0; font-size: 16px; line-height: 24px; color: #334155;">Visit the workshop signup page: <a href="${workshopUrl}" style="color: #1D4ED8; text-decoration: none;">${workshopUrl}</a></li>
                      <li style="margin: 0 0 8px 0; font-size: 16px; line-height: 24px; color: #334155;">Sign in with the email address associated with your ticket: <strong>${userEmail}</strong></li>
                      <li style="margin: 0 0 8px 0; font-size: 16px; line-height: 24px; color: #334155;">Browse available workshops and select the ones you&apos;d like to attend</li>
                      <li style="margin: 0 0 8px 0; font-size: 16px; line-height: 24px; color: #334155;">Complete your registration</li>
                    </ol>

                    <div style="background-color: #E0F2FE; border-left: 4px solid #1D4ED8; padding: 16px; margin: 0 0 24px 0;">
                      <p style="margin: 0; font-size: 16px; line-height: 24px; color: #334155;"><strong>Important:</strong> Workshops have limited capacity and are first-come, first-served. We recommend signing up as soon as possible to secure your spot!</p>
                    </div>

                    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
                      <tr>
                        <td align="center">
                          <a href="${workshopUrl}" style="display: inline-block; background-color: #1D4ED8; color: #FFFFFF; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px;">Sign Up for Workshops</a>
                        </td>
                      </tr>
                    </table>

                    <p style="margin: 32px 0 16px 0; font-size: 14px; line-height: 20px; color: #334155;">If you have any questions or need assistance, please contact us at <a href="mailto:contact@cloudnativebergen.dev" style="color: #1D4ED8; text-decoration: none;">contact@cloudnativebergen.dev</a>.</p>

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

    const emailResult = await retryWithBackoff(async () => {
      const result = await resend.emails.send({
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
