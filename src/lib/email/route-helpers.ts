import { BroadcastTemplate } from '@/components/email/BroadcastTemplate'
import { portableTextToHTML } from '@/lib/email/portableTextToHTML'
import React from 'react'
import { PortableTextBlock } from '@portabletext/types'
import { Conference } from '@/lib/conference/types'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import { formatConferenceDateLong } from '@/lib/time'
import { emailBrandColor } from '@/lib/branding/theme'

export interface EmailTemplateOptions {
  conference: Conference
  subject: string
  htmlContent: string
  unsubscribeUrl?: string
  additionalTemplateProps?: Record<string, unknown>
}

/**
 * THREAD ONCE. This is the shared choke point for the broadcast-shaped senders
 * (audience broadcast, individual broadcast, sponsor-CRM bulk and individual —
 * see `lib/email/broadcast.ts` and `server/routers/sponsor.ts`). It already
 * receives the whole `Conference`, so resolving the brand colour HERE brands
 * every one of them without touching a single call site.
 *
 * `additionalTemplateProps` is spread last, so a caller can still override
 * `brandColor` deliberately.
 */
export function renderEmailTemplate({
  conference,
  subject,
  htmlContent,
  unsubscribeUrl = '{{{RESEND_UNSUBSCRIBE_URL}}}',
  additionalTemplateProps = {},
}: EmailTemplateOptions): React.ReactElement {
  return React.createElement(BroadcastTemplate, {
    subject,
    eventName: conference.title,
    eventLocation: `${conference.city}, ${conference.country}`,
    eventDate: formatConferenceDateLong(conference.startDate),
    eventUrl: conferenceBaseUrl(conference),
    socialLinks: conference.socialLinks || [],
    unsubscribeUrl,
    brandColor: emailBrandColor(conference.theme),
    content: React.createElement('div', {
      dangerouslySetInnerHTML: { __html: htmlContent },
    }),
    ...additionalTemplateProps,
  })
}

/**
 * The body half of the same choke point: `renderEmailTemplate` brands the
 * CHROME, this brands the rich-text BODY. Pass the same conference to both, or
 * the shell follows the tenant while the copy inside it stays house blue.
 */
export async function convertPortableTextToHTML(
  messagePortableText: PortableTextBlock[],
  conference?: Pick<Conference, 'theme'>,
): Promise<{
  htmlContent?: string
  error?: Response
}> {
  try {
    const htmlContent = await portableTextToHTML(
      messagePortableText,
      emailBrandColor(conference?.theme),
    )
    return { htmlContent }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      error: Response.json(
        { error: `Failed to convert message to HTML: ${errorMessage}` },
        { status: 500 },
      ),
    }
  }
}

export function createEmailSuccessResponse(data: Record<string, unknown>) {
  return Response.json({
    success: true,
    ...data,
  })
}

export function createEmailErrorResponse(
  message: string,
  status: number = 500,
) {
  return Response.json({ error: message }, { status })
}
