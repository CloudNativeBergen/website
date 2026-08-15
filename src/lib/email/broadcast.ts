import {
  resolveEmailSender,
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

export async function sendBroadcastEmail({
  conference,
  subject,
  messagePortableText,
  audienceType = 'speakers',
  fromEmail,
  additionalContent = '',
}: BroadcastEmailRequest): Promise<Response> {
  try {
    // The broadcast MUST be created on the account holding `audienceId` — see
    // the account-scoping note in `@/lib/email/audience`. So the client comes
    // back with the audience rather than being resolved a second time here.
    const {
      audienceId,
      client,
      error: audienceError,
    } = audienceType === 'speakers'
      ? await getOrCreateConferenceAudience(conference)
      : await getOrCreateConferenceAudienceByType(conference, audienceType)

    if (!audienceId) {
      console.error('[Broadcast] Failed to get/create audience:', {
        audienceType,
        conferenceName: conference.title,
        error: audienceError?.message,
      })
      // The MESSAGE is surfaced, not just logged. This is an organizer-only
      // endpoint, and the reason matters to whoever is standing in front of it:
      // a truncated audience list (#893) is refused here on purpose, and an
      // operator who is only told "failed" cannot tell that from a rate limit.
      return createEmailErrorResponse(
        audienceError?.message
          ? `Failed to prepare email audience: ${audienceError.message}`
          : 'Failed to prepare email audience',
      )
    }

    const { htmlContent, error: htmlError } = await convertPortableTextToHTML(
      messagePortableText,
      conference,
    )
    if (htmlError) {
      return htmlError
    }

    const finalHtmlContent = htmlContent! + additionalContent

    const determineFromEmail = (): string => {
      if (fromEmail) return fromEmail

      if (audienceType === 'sponsors' && conference.sponsorEmail) {
        return `${conference.organizer} <${conference.sponsorEmail}>`
      }

      if (audienceType === 'speakers' && conference.cfpEmail) {
        return `${conference.organizer} <${conference.cfpEmail}>`
      }

      if (conference.contactEmail) {
        return `${conference.organizer} <${conference.contactEmail}>`
      }

      throw new Error(
        'No appropriate email address configured for this audience type',
      )
    }

    let resolvedFromEmail: string
    try {
      resolvedFromEmail = determineFromEmail()
    } catch (error) {
      console.error('[Broadcast] Email configuration error:', {
        audienceType,
        hasCfpEmail: !!conference.cfpEmail,
        hasContactEmail: !!conference.contactEmail,
        error: error instanceof Error ? error.message : String(error),
      })
      return createEmailErrorResponse(
        error instanceof Error ? error.message : 'Email configuration error',
        400,
      )
    }

    const emailReact = renderEmailTemplate({
      conference,
      subject,
      htmlContent: finalHtmlContent,
    })

    const broadcastResponse = await retryWithBackoff(async () => {
      return await client.broadcasts.create({
        name: subject,
        audienceId,
        from: resolvedFromEmail,
        subject,
        react: emailReact,
      })
    })

    if (broadcastResponse.error) {
      console.error('[Broadcast] Failed to create broadcast:', {
        error: broadcastResponse.error.message,
        audienceId,
        audienceType,
        subject,
      })
      return createEmailErrorResponse('Failed to create broadcast email')
    }

    await delay(EMAIL_CONFIG.RATE_LIMIT_DELAY)

    const sendResponse = await retryWithBackoff(async () => {
      return await client.broadcasts.send(broadcastResponse.data!.id)
    })

    if (sendResponse.error) {
      console.error('[Broadcast] Failed to send broadcast:', {
        error: sendResponse.error.message,
        broadcastId: broadcastResponse.data!.id,
        audienceId,
        audienceType,
      })
      return createEmailErrorResponse('Failed to send broadcast email')
    }

    return createEmailSuccessResponse({
      broadcastId: broadcastResponse.data!.id,
      audienceId,
      sent: true,
    })
  } catch (error) {
    console.error('[Broadcast] Unexpected error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      audienceType,
      conferenceName: conference.title,
    })
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
    const { htmlContent, error: htmlError } = await convertPortableTextToHTML(
      messagePortableText,
      conference,
    )
    if (htmlError) {
      return htmlError
    }

    const finalHtmlContent = htmlContent! + additionalContent

    const resolvedFromEmail =
      fromEmail ||
      (conference.contactEmail
        ? `${conference.organizer} <${conference.contactEmail}>`
        : undefined)

    if (!resolvedFromEmail) {
      return createEmailErrorResponse(
        'Conference contact email is not configured',
        400,
      )
    }

    const emailReact = renderEmailTemplate({
      conference,
      subject,
      htmlContent: finalHtmlContent,
      unsubscribeUrl: undefined,
    })

    const { client } = await resolveEmailSender(conference.organization?._ref)

    const emailResponse = await retryWithBackoff(async () => {
      return await client.emails.send({
        from: resolvedFromEmail,
        to: [primaryRecipient],
        ...(ccRecipients.length > 0 && { cc: ccRecipients }),
        subject,
        react: emailReact,
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
