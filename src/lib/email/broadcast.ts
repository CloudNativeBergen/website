import {
  resend,
  retryWithBackoff,
  delay,
  EMAIL_CONFIG,
} from '@/lib/email/config'
import { Conference } from '@/lib/conference/types'
import { PortableTextBlock } from '@portabletext/types'
import {
  getOrCreateConferenceAudience,
  getOrCreateConferenceAudienceByType,
  AudienceType,
} from '@/lib/email/audience'
import {
  renderEmailTemplate,
  convertPortableTextToHTML,
  createEmailSuccessResponse,
  createEmailErrorResponse,
} from './route-helpers'

export interface BroadcastEmailRequest {
  conference: Conference
  subject: string
  messagePortableText: PortableTextBlock[]
  audienceType?: AudienceType
  fromEmail?: string
  additionalContent?: string
}

export interface BroadcastEmailResponse {
  success: boolean
  broadcastId: string
  audienceId: string
  sent: boolean
}

export async function sendBroadcastEmail({
  conference,
  subject,
  messagePortableText,
  audienceType = 'speakers',
  fromEmail,
  additionalContent = '',
}: BroadcastEmailRequest): Promise<Response> {
  try {
    const { audienceId } =
      audienceType === 'speakers'
        ? await getOrCreateConferenceAudience(conference)
        : await getOrCreateConferenceAudienceByType(conference, audienceType)

    if (!audienceId) {
      return createEmailErrorResponse('Failed to prepare email audience')
    }

    const { htmlContent, error: htmlError } =
      await convertPortableTextToHTML(messagePortableText)
    if (htmlError) {
      return htmlError
    }

    const finalHtmlContent = htmlContent! + additionalContent

    const determineFromEmail = (): string => {
      if (fromEmail) return fromEmail

      if (audienceType === 'speakers' && conference.cfp_email) {
        return `${conference.organizer} <${conference.cfp_email}>`
      }

      if (conference.contact_email) {
        return `${conference.organizer} <${conference.contact_email}>`
      }

      throw new Error(
        'No appropriate email address configured for this audience type',
      )
    }

    let resolvedFromEmail: string
    try {
      resolvedFromEmail = determineFromEmail()
    } catch (error) {
      return createEmailErrorResponse(
        error instanceof Error ? error.message : 'Email configuration error',
        400,
      )
    }

    const emailHtml = await renderEmailTemplate({
      conference,
      subject,
      htmlContent: finalHtmlContent,
    })

    const broadcastResponse = await retryWithBackoff(async () => {
      return await resend.broadcasts.create({
        name: subject,
        audienceId,
        from: resolvedFromEmail,
        subject,
        html: emailHtml,
      })
    })

    if (broadcastResponse.error) {
      return createEmailErrorResponse('Failed to create broadcast email')
    }

    await delay(EMAIL_CONFIG.RATE_LIMIT_DELAY)

    const sendResponse = await retryWithBackoff(async () => {
      return await resend.broadcasts.send(broadcastResponse.data!.id)
    })

    if (sendResponse.error) {
      return createEmailErrorResponse('Failed to send broadcast email')
    }

    return createEmailSuccessResponse({
      broadcastId: broadcastResponse.data!.id,
      audienceId,
      sent: true,
    })
  } catch (error) {
    console.error('Broadcast email error:', error)
    return createEmailErrorResponse('Internal server error')
  }
}

export interface IndividualEmailRequest {
  conference: Conference
  subject: string
  messagePortableText: PortableTextBlock[]
  primaryRecipient: string
  ccRecipients?: string[]
  additionalContent?: string
  fromEmail?: string
}

export async function sendIndividualEmail({
  conference,
  subject,
  messagePortableText,
  primaryRecipient,
  ccRecipients = [],
  additionalContent = '',
  fromEmail,
}: IndividualEmailRequest): Promise<Response> {
  try {
    const { htmlContent, error: htmlError } =
      await convertPortableTextToHTML(messagePortableText)
    if (htmlError) {
      return htmlError
    }

    const finalHtmlContent = htmlContent! + additionalContent

    const resolvedFromEmail =
      fromEmail ||
      (conference.contact_email
        ? `${conference.organizer} <${conference.contact_email}>`
        : undefined)

    if (!resolvedFromEmail) {
      return createEmailErrorResponse(
        'Conference contact email is not configured',
        400,
      )
    }

    const emailHtml = await renderEmailTemplate({
      conference,
      subject,
      htmlContent: finalHtmlContent,
      unsubscribeUrl: undefined,
    })

    const emailResponse = await retryWithBackoff(async () => {
      return await resend.emails.send({
        from: resolvedFromEmail,
        to: [primaryRecipient],
        ...(ccRecipients.length > 0 && { cc: ccRecipients }),
        subject,
        html: emailHtml,
      })
    })

    if (emailResponse.error) {
      console.error('Email sending failed:', emailResponse.error)
      return createEmailErrorResponse('Failed to send email')
    }

    await delay(EMAIL_CONFIG.RATE_LIMIT_DELAY)

    return createEmailSuccessResponse({
      emailId: emailResponse.data!.id,
      recipientCount: 1 + ccRecipients.length,
      primaryRecipient,
      ccRecipients,
    })
  } catch (error) {
    console.error('Individual email error:', error)
    return createEmailErrorResponse('Internal server error')
  }
}
