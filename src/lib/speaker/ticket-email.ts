import { SpeakerTicketEmailTemplate } from '@/components/email'
import {
  resolveEmailSender,
  retryWithBackoff,
  isTransientError,
} from '@/lib/email/config'
import type { Conference } from '@/lib/conference/types'
import { formatDate } from '@/lib/time'
import { emailBrandColor } from '@/lib/branding/theme'
import { PLATFORM_NAME } from '@/lib/branding/platform'

export interface SendSpeakerTicketEmailParams {
  speaker: { name: string; email: string }
  registrationUrl: string
  eventUrl: string
  conference: Pick<
    Conference,
    // `organization` is what resolves the tenant's own Resend account (#843);
    // a narrower projection would silently send on the platform's.
    | 'organization'
    | 'title'
    | 'city'
    | 'organizer'
    | 'contactEmail'
    | 'cfpEmail'
    | 'startDate'
    | 'socialLinks'
    | 'theme'
  >
}

/**
 * Emails a confirmed speaker their complimentary 100%-off ticket link and a
 * link to register. Mirrors the accept/reject notification flow: renders a
 * dedicated React template and sends via Resend with transient-failure retry.
 */
export async function sendSpeakerTicketEmail({
  speaker,
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

  const from = `${conference.organizer || PLATFORM_NAME} <${fromAddress}>`
  const subject = `🎟️ Your speaker ticket for ${conference.title}`

  const template = SpeakerTicketEmailTemplate({
    speakerName: speaker.name,
    registrationUrl,
    eventName: conference.title,
    eventLocation: conference.city,
    eventDate: formatDate(conference.startDate),
    eventUrl,
    socialLinks: conference.socialLinks,
    // THEMING L1: carry the tenant's brand primary into the mail accent.
    brandColor: emailBrandColor(conference.theme),
  })

  // Retry not just rate limits but any transient provider (5xx) or network
  // failure: the coupon is created before this send, so a blip here must not
  // permanently strand the speaker without their ticket email.
  const { client } = await resolveEmailSender(conference.organization?._ref)

  return retryWithBackoff(
    async () => {
      const { data, error } = await client.emails.send({
        from,
        to: [speaker.email],
        subject,
        react: template,
      })

      if (error) {
        // Preserve the provider's error name/status on the thrown error so the
        // retry predicate can tell a transient 5xx apart from a permanent 4xx.
        const wrapped = new Error(
          `Failed to send speaker ticket email: ${error.message}`,
        ) as Error & { status?: number; resendErrorName?: string }
        const status = (error as { statusCode?: number }).statusCode
        if (typeof status === 'number') {
          wrapped.status = status
        }
        if (typeof error.name === 'string') {
          wrapped.resendErrorName = error.name
        }
        throw wrapped
      }

      return data
    },
    undefined,
    isTransientError,
  )
}
