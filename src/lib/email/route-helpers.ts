import { NextAuthRequest } from '@/lib/auth'
import { checkOrganizerAccess } from '@/lib/auth/admin'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { BroadcastTemplate } from '@/components/email/BroadcastTemplate'
import { portableTextToHTML } from '@/lib/email/portableTextToHTML'
import { isValidPortableText } from '@/lib/portabletext/validation'
import React from 'react'
import { PortableTextBlock } from '@portabletext/types'
import { Conference } from '@/lib/conference/types'
import { formatConferenceDateLong } from '@/lib/time'

export interface EmailRouteContext {
  conference: Conference
  messagePortableText: PortableTextBlock[]
  subject: string
}

export function validateOrganizerAccess(req: NextAuthRequest): Response | null {
  const accessError = checkOrganizerAccess(req)
  return accessError || null
}

export function parsePortableTextMessage(message: string): {
  messagePortableText?: PortableTextBlock[]
  error?: Response
} {
  try {
    const parsed = JSON.parse(message)

    if (!isValidPortableText(parsed)) {
      return {
        error: Response.json(
          { error: 'Invalid message format. Expected PortableText blocks.' },
          { status: 400 },
        ),
      }
    }

    return { messagePortableText: parsed }
  } catch {
    return {
      error: Response.json(
        { error: 'Invalid JSON format in message' },
        { status: 400 },
      ),
    }
  }
}

export async function getEmailRouteConference(options?: {
  sponsors?: boolean
  sponsorContact?: boolean
}): Promise<{
  conference?: Conference
  error?: Response
}> {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain(options)

  if (conferenceError) {
    return {
      error: Response.json({ error: conferenceError.message }, { status: 500 }),
    }
  }

  return { conference }
}

export function validateRequiredFields(
  fields: Record<string, unknown>,
  requiredFields: string[],
): Response | null {
  const missingFields = requiredFields.filter(
    (field) =>
      !fields[field] ||
      (typeof fields[field] === 'string' && !fields[field].toString().trim()),
  )

  if (missingFields.length > 0) {
    return Response.json(
      {
        error: `Missing required fields: ${missingFields.join(', ')}`,
      },
      { status: 400 },
    )
  }

  return null
}

export async function setupEmailRoute(
  req: NextAuthRequest,
  requestData: { subject: string; message: string },
  conferenceOptions?: { sponsors?: boolean; sponsorContact?: boolean },
): Promise<{
  context?: EmailRouteContext
  error?: Response
}> {
  const accessError = validateOrganizerAccess(req)
  if (accessError) {
    return { error: accessError }
  }

  const validationError = validateRequiredFields(requestData, [
    'subject',
    'message',
  ])
  if (validationError) {
    return { error: validationError }
  }

  const { messagePortableText, error: parseError } = parsePortableTextMessage(
    requestData.message,
  )
  if (parseError) {
    return { error: parseError }
  }

  const { conference, error: conferenceError } =
    await getEmailRouteConference(conferenceOptions)
  if (conferenceError) {
    return { error: conferenceError }
  }

  return {
    context: {
      conference: conference!,
      messagePortableText: messagePortableText!,
      subject: requestData.subject,
    },
  }
}

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
    eventDate: formatConferenceDateLong(conference.start_date),
    eventUrl: `https://${conference.domains[0]}`,
    socialLinks: conference.social_links || [],
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
