import {
  resolveEmailSender,
  retryWithBackoff,
  EmailResult,
  createEmailError,
} from './config'
import { VolunteerWithConference } from '@/lib/volunteer/types'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import { formatConferenceDateLong } from '@/lib/time'
import { VolunteerApprovalTemplate } from '@/components/email/VolunteerApprovalTemplate'
import { emailBrandColor, type ConferenceTheme } from '@/lib/branding/theme'

interface ConferenceForEmail {
  /**
   * The owning tenant. This local projection used to omit it, which is exactly
   * why the volunteer mail went out on the PLATFORM's Resend account no matter
   * whose conference it was (#843) — the org could not reach the send.
   */
  organization?: { _ref?: string } | null
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
  /**
   * The tenant's brand theme. This local projection type used to omit it
   * entirely, so the volunteer email could not be branded even in principle —
   * the colour had no way to reach the template.
   */
  theme?: ConferenceTheme | null
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
    const eventUrl = conferenceBaseUrl(conference)
    const socialLinks = conference.socialLinks?.map((link) => link.url) || []

    const { client } = await resolveEmailSender(conference.organization?._ref)

    const result = await retryWithBackoff(async () => {
      const response = await client.emails.send({
        from: `${conference.organizer || conference.title} <${fromEmail}>`,
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
          brandColor: emailBrandColor(conference.theme),
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
