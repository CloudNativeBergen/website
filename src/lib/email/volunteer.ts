import {
  resend,
  retryWithBackoff,
  EmailResult,
  createEmailError,
} from './config'
import { VolunteerWithConference } from '@/lib/volunteer/types'
import { formatConferenceDateLong } from '@/lib/time'
import { VolunteerApprovalTemplate } from '@/components/email/VolunteerApprovalTemplate'

interface ConferenceForEmail {
  title: string
  contactEmail?: string
  cfpEmail?: string
  city?: string
  country?: string
  startDate?: string
  domains?: string[]
  organizer?: string
  socialLinks?: Array<{
    platform: string
    url: string
  }>
}

export async function sendVolunteerApprovalEmail(
  volunteer: VolunteerWithConference,
  conference: ConferenceForEmail,
  subject: string,
  message: string,
): Promise<EmailResult<{ emailId: string }>> {
  try {
    if (!volunteer.email) {
      return {
        error: createEmailError('Volunteer email address is missing', 400),
      }
    }

    const fromEmail = conference.contactEmail || conference.cfpEmail
    if (!fromEmail) {
      return {
        error: createEmailError(
          'Conference contact email is not configured',
          400,
        ),
      }
    }

    const eventName = conference.title
    const eventLocation =
      conference.city && conference.country
        ? `${conference.city}, ${conference.country}`
        : 'Location TBA'
    const eventDate = conference.startDate
      ? formatConferenceDateLong(conference.startDate)
      : 'TBD'
    const eventUrl = `https://${conference.domains?.[0] || 'cloudnativebergen.no'}`
    const socialLinks = conference.socialLinks?.map((link) => link.url) || []

    const result = await retryWithBackoff(async () => {
      const response = await resend.emails.send({
        from: `${conference.organizer || 'Cloud Native Days'} <${fromEmail}>`,
        to: volunteer.email!,
        subject,
        react: VolunteerApprovalTemplate({
          volunteerName: volunteer.name,
          eventName,
          eventLocation,
          eventDate,
          eventUrl,
          message,
          socialLinks,
        }) as React.ReactElement,
      })

      if (response.error) {
        throw new Error(`Failed to send email: ${response.error.message}`)
      }

      return response
    })

    return {
      data: { emailId: result.data?.id || '' },
    }
  } catch (error) {
    return {
      error: createEmailError(
        error instanceof Error ? error.message : 'Failed to send email',
        500,
      ),
    }
  }
}
