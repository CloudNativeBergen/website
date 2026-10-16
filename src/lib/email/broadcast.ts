import { retryWithBackoff, delay, EMAIL_CONFIG } from '@/lib/email/config'
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
      if (fromEmail) return fromEmail.trim()

      const organizer = conference.organizer?.trim() || conference.title.trim()

      if (audienceType === 'sponsors' && conference.sponsorEmail?.trim()) {
        return `${organizer} <${conference.sponsorEmail.trim()}>`
      }

      if (audienceType === 'speakers' && conference.cfpEmail?.trim()) {
        return `${organizer} <${conference.cfpEmail.trim()}>`
      }

      if (conference.contactEmail?.trim()) {
        return `${organizer} <${conference.contactEmail.trim()}>`
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

    const trimmedSubject = subject.trim()
    const subjectChars = Array.from(trimmedSubject)
    const broadcastName =
      subjectChars.length > 50
        ? `${subjectChars.slice(0, 47).join('').trimEnd()}...`
        : trimmedSubject

    const emailReact = renderEmailTemplate({
      conference,
      subject: trimmedSubject,
      htmlContent: finalHtmlContent,
    })

    const broadcastResponse = await retryWithBackoff(async () => {
      return await client.broadcasts.create({
        name: broadcastName,
        audienceId,
        from: resolvedFromEmail,
        subject: trimmedSubject,
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
      return createEmailErrorResponse(
        broadcastResponse.error.message
          ? `Failed to create broadcast email: ${broadcastResponse.error.message}`
          : 'Failed to create broadcast email',
      )
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
      return createEmailErrorResponse(
        sendResponse.error.message
          ? `Failed to send broadcast email: ${sendResponse.error.message}`
          : 'Failed to send broadcast email',
      )
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
    return createEmailErrorResponse(
      error instanceof Error && error.message
        ? `Failed to send broadcast email: ${error.message}`
        : 'Internal server error',
    )
  }
}
