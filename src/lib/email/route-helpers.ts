import { BroadcastTemplate } from '@/components/email/BroadcastTemplate'
import { portableTextToHTML } from '@/lib/email/portableTextToHTML'
import React from 'react'
import { PortableTextBlock } from '@portabletext/types'
import { Conference } from '@/lib/conference/types'
import { formatConferenceDateLong } from '@/lib/time'

export interface EmailTemplateOptions {
  conference: Conference
  subject: string
  htmlContent: string
  unsubscribeUrl?: string
  additionalTemplateProps?: Record<string, unknown>
}

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
    eventUrl: `https://${conference.domains[0]}`,
    socialLinks: conference.socialLinks || [],
    unsubscribeUrl,
    content: React.createElement('div', {
      dangerouslySetInnerHTML: { __html: htmlContent },
    }),
    ...additionalTemplateProps,
  })
}

export async function convertPortableTextToHTML(
  messagePortableText: PortableTextBlock[],
): Promise<{
  htmlContent?: string
  error?: Response
}> {
  try {
    const htmlContent = await portableTextToHTML(messagePortableText)
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
