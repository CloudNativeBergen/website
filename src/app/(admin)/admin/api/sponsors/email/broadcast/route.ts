import { NextAuthRequest, auth } from '@/lib/auth'
import { checkOrganizerAccess } from '@/lib/auth/admin'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { BroadcastTemplate } from '@/components/email/BroadcastTemplate'
import { render } from '@react-email/render'
import { portableTextToHTML } from '@/lib/email/portableTextToHTML'
import { isValidPortableText } from '@/lib/portabletext/validation'
import React from 'react'
import { getOrCreateConferenceAudienceByType } from '@/lib/email/audience'
import { Resend } from 'resend'
import { PortableTextBlock } from '@portabletext/types'

const resend = new Resend(process.env.RESEND_API_KEY)

export const dynamic = 'force-dynamic'

export const POST = auth(async (req: NextAuthRequest) => {
  // Check organizer access
  const accessError = checkOrganizerAccess(req)
  if (accessError) {
    return accessError
  }

  try {
    const { subject, message } = await req.json()

    if (!subject || !message) {
      return Response.json(
        { error: 'Subject and message are required' },
        { status: 400 },
      )
    }

    // Parse PortableText from JSON string
    let messagePortableText: PortableTextBlock[]
    try {
      const parsed = JSON.parse(message)

      // Validate that we received proper PortableText blocks
      if (!isValidPortableText(parsed)) {
        return Response.json(
          { error: 'Invalid message format. Expected PortableText blocks.' },
          { status: 400 },
        )
      }

      messagePortableText = parsed
    } catch {
      return Response.json(
        { error: 'Invalid JSON format in message' },
        { status: 400 },
      )
    }

    // Get conference
    const { conference, error: conferenceError } =
      await getConferenceForCurrentDomain()

    if (conferenceError) {
      return Response.json({ error: conferenceError.message }, { status: 500 })
    }

    if (!conference.contact_email) {
      return Response.json(
        { error: 'Conference contact email is not configured' },
        { status: 400 },
      )
    }

    // Get or create the conference audience for sponsors
    const { audienceId } = await getOrCreateConferenceAudienceByType(
      conference,
      'sponsors',
    )

    if (!audienceId) {
      return Response.json(
        { error: 'Failed to prepare email audience' },
        { status: 500 },
      )
    }

    // Convert PortableText content to HTML
    let htmlContent: string
    try {
      htmlContent = await portableTextToHTML(messagePortableText)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      return Response.json(
        { error: `Failed to convert message to HTML: ${errorMessage}` },
        { status: 500 },
      )
    }

    // Render the email template
    const emailHtml = await render(
      React.createElement(BroadcastTemplate, {
        subject,
        eventName: conference.title,
        eventLocation: `${conference.city}, ${conference.country}`,
        eventDate: new Date(conference.start_date).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        eventUrl: `https://${conference.domains[0]}`,
        socialLinks: conference.social_links || [],
        unsubscribeUrl: '{{{RESEND_UNSUBSCRIBE_URL}}}', // Resend unsubscribe token
        content: React.createElement('div', {
          dangerouslySetInnerHTML: { __html: htmlContent },
        }),
      }),
    )

    // Send broadcast email
    const broadcastResponse = await resend.broadcasts.create({
      name: subject, // Use subject as the broadcast name
      audienceId,
      from: conference.contact_email,
      subject,
      html: emailHtml,
    })

    if (broadcastResponse.error) {
      return Response.json(
        { error: 'Failed to create broadcast email' },
        { status: 500 },
      )
    }

    // Actually send the broadcast
    const sendResponse = await resend.broadcasts.send(
      broadcastResponse.data!.id,
    )

    if (sendResponse.error) {
      return Response.json(
        { error: 'Failed to send broadcast email' },
        { status: 500 },
      )
    }

    return Response.json({
      success: true,
      broadcastId: broadcastResponse.data!.id,
      audienceId,
      sent: true,
    })
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
})
