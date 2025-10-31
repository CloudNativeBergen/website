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
  contact_email?: string
  cfp_email?: string
  city?: string
  country?: string
  start_date?: string
  domains?: string[]
  organizer?: string
  social_links?: Array<{
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

    const fromEmail = conference.contact_email || conference.cfp_email
    if (!fromEmail) {
      return {
        error: createEmailError(
          'Conference contact email is not configured',
          400,
        ),
      }
    }

    const eventName = conference.title
    const eventLocation = `${conference.city || 'Bergen'}, ${conference.country || 'Norway'}`
    const eventDate = conference.start_date
      ? formatConferenceDateLong(conference.start_date)
      : 'TBD'
    const eventUrl = `https://${conference.domains?.[0] || 'cloudnativebergen.no'}`
    const socialLinks = conference.social_links?.map((link) => link.url) || []

    const result = await retryWithBackoff(async () => {
      const response = await resend.emails.send({
        from: `${conference.organizer || 'Cloud Native Bergen'} <${fromEmail}>`,
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
