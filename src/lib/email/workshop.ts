import {
  resend,
  retryWithBackoff,
  createEmailError,
  type EmailResult,
} from './config'
import type { Conference } from '@/lib/conference/types'
import type { WorkshopSignupExisting } from '@/lib/workshop/types'

export interface WorkshopConfirmationEmailRequest {
  userEmail: string
  userName: string
  status?: string
  conference?: Conference
  workshopTitle: string
  workshopDate?: string
  workshopTime?: string
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
        ? `Workshop <noreply@${conference.domains[0]}>`
        : 'Workshop <noreply@cloudnativebergen.no>'

    const subject = `Workshop Confirmation: ${workshopTitle}`

    const timeInfo =
      workshopDate && workshopTime
        ? `\n\nDate: ${workshopDate}\nTime: ${workshopTime}`
        : ''

    const html = `
      <h2>Workshop Confirmation</h2>
      <p>Hi ${userName},</p>
      <p>Your registration for <strong>${workshopTitle}</strong> has been confirmed!</p>
      ${timeInfo ? `<p>${timeInfo.replace(/\n/g, '<br>')}</p>` : ''}
      <p>Status: <strong>${status === 'confirmed' ? 'Confirmed' : 'Waitlist'}</strong></p>
      <p>We look forward to seeing you at the workshop!</p>
      ${conference?.organizer ? `<p>Best regards,<br>${conference.organizer}</p>` : '<p>Best regards,<br>The Workshop Team</p>'}
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