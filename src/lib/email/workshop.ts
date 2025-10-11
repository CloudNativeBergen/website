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

export async function sendWorkshopSignupInstructions({
  userEmail,
  userName,
  conference,
  ticketCategory,
}: WorkshopSignupInstructionsRequest): Promise<EmailResult<{ emailId: string }>> {
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
      <h2>Welcome to ${conference.title}!</h2>
      <p>Hi ${userName},</p>
      <p>Thank you for purchasing your <strong>${ticketCategory}</strong> ticket!</p>

      <h3>Workshop Registration Now Available</h3>
      <p>Your ticket includes access to workshops. You can now sign up for available workshop sessions.</p>

      <p><strong>How to register for workshops:</strong></p>
      <ol>
        <li>Visit the workshop signup page: <a href="${workshopUrl}">${workshopUrl}</a></li>
        <li>Sign in with the email address associated with your ticket: <strong>${userEmail}</strong></li>
        <li>Browse available workshops and select the ones you&apos;d like to attend</li>
        <li>Complete your registration</li>
      </ol>

      <p><strong>Important:</strong> Workshops have limited capacity and are first-come, first-served. We recommend signing up as soon as possible to secure your spot!</p>

      <p style="margin-top: 30px;">
        <a href="${workshopUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Sign Up for Workshops
        </a>
      </p>

      <p style="margin-top: 30px;">If you have any questions or need assistance, please contact us at <a href="mailto:contact@cloudnativebergen.dev">contact@cloudnativebergen.dev</a>.</p>

      <p>See you at the conference!</p>
      <p>Best regards,<br>${conference.organizer}</p>
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
      error: createEmailError('Failed to send workshop signup instructions', 500),
    }
  }
}