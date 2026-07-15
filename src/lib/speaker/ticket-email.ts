import { SpeakerTicketEmailTemplate } from '@/components/email'
import { resend, retryWithBackoff } from '@/lib/email/config'
import type { Conference } from '@/lib/conference/types'
import { formatDate } from '@/lib/time'

export interface SendSpeakerTicketEmailParams {
  speaker: { name: string; email: string }
  discountCode: string
  registrationUrl: string
  eventUrl: string
  conference: Pick<
    Conference,
    | 'title'
    | 'city'
    | 'organizer'
    | 'contactEmail'
    | 'cfpEmail'
    | 'startDate'
    | 'socialLinks'
  >
}

/**
 * Emails a confirmed speaker their complimentary 100%-off ticket code and a
 * link to register. Mirrors the accept/reject notification flow: renders a
 * dedicated React template and sends via Resend with transient-failure retry.
 */
export async function sendSpeakerTicketEmail({
  speaker,
  discountCode,
  registrationUrl,
  eventUrl,
  conference,
}: SendSpeakerTicketEmailParams) {
  const fromAddress = conference.cfpEmail || conference.contactEmail
  if (!fromAddress) {
    throw new Error(
      'Conference has no sender email configured (cfpEmail/contactEmail)',
    )
  }

  const from = `${conference.organizer || 'Cloud Native Days'} <${fromAddress}>`
  const subject = `🎟️ Your speaker ticket for ${conference.title}`

  const template = SpeakerTicketEmailTemplate({
    speakerName: speaker.name,
    discountCode,
    registrationUrl,
    eventName: conference.title,
    eventLocation: conference.city,
    eventDate: formatDate(conference.startDate),
    eventUrl,
    socialLinks: conference.socialLinks,
  })

  return retryWithBackoff(async () => {
    const { data, error } = await resend.emails.send({
      from,
      to: [speaker.email],
      subject,
      react: template,
    })

    if (error) {
      throw new Error(`Failed to send speaker ticket email: ${error.message}`)
    }

    return data
  })
}
