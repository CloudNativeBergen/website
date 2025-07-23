import { NextAuthRequest, auth } from '@/lib/auth'
import { checkOrganizerAccess } from '@/lib/auth/admin'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getSpeakers } from '@/lib/speaker/sanity'
import { BroadcastEmailTemplate } from '@/components/email'
import { render } from '@react-email/render'
import { portableTextToHTML } from '@/lib/email/portableTextToHTML'
import {
  getOrCreateConferenceAudience,
  syncConferenceAudience,
} from '@/lib/email/audience'
import { Status } from '@/lib/proposal/types'
import { Speaker } from '@/lib/speaker/types'
import { ProposalExisting } from '@/lib/proposal/types'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export const dynamic = 'force-dynamic'

export const POST = auth(async (req: NextAuthRequest) => {
  // Check organizer access
  const accessError = checkOrganizerAccess(req)
  if (accessError) {
    return accessError
  }

  try {
    const { subject, content } = await req.json()

    if (!subject || !content) {
      return Response.json(
        { error: 'Subject and content are required' },
        { status: 400 },
      )
    }

    // Get conference
    const { conference, error: conferenceError } =
      await getConferenceForCurrentDomain()

    if (conferenceError) {
      return Response.json({ error: conferenceError.message }, { status: 500 })
    }

    // Get or create the conference audience
    const { audienceId, error: audienceError } =
      await getOrCreateConferenceAudience(conference)

    if (!audienceId) {
      console.error('Failed to get/create audience:', audienceError)
      return Response.json(
        { error: 'Failed to prepare email audience' },
        { status: 500 },
      )
    }

    // Get only confirmed speakers (not just accepted)
    const { speakers, err } = await getSpeakers(conference._id, [
      Status.confirmed,
    ])

    if (err) {
      console.error('Failed to get speakers:', err)
      return Response.json(
        { error: 'Failed to fetch speakers' },
        { status: 500 },
      )
    }

    const eligibleSpeakers = speakers.filter(
      (speaker: Speaker & { proposals: ProposalExisting[] }) =>
        speaker.email &&
        speaker.proposals?.some(
          (proposal: ProposalExisting) => proposal.status === 'confirmed',
        ),
    )

    if (eligibleSpeakers.length === 0) {
      return Response.json(
        { error: 'No eligible speakers found' },
        { status: 400 },
      )
    }

    // Sync the audience with current speakers to ensure it's up to date
    const { syncedCount, error: syncError } = await syncConferenceAudience(
      conference,
      eligibleSpeakers,
    )

    if (syncError) {
      console.error('Failed to sync audience:', syncError)
      return Response.json(
        { error: 'Failed to sync audience' },
        { status: 500 },
      )
    }

    // Convert PortableText content to HTML
    const htmlContent = await portableTextToHTML(content)

    // Render the email template
    const emailHtml = await render(
      BroadcastEmailTemplate({
        subject,
        content: htmlContent,
        recipientName: '{{{FIRST_NAME|Speaker}}}', // Resend personalization token with fallback
      }),
    )

    // Send broadcast email
    const broadcastResponse = await resend.broadcasts.create({
      audienceId,
      from: 'Cloud Native Bergen <noreply@cloudnativebergen.dev>',
      subject,
      html: emailHtml,
    })

    if (broadcastResponse.error) {
      console.error('Failed to send broadcast:', broadcastResponse.error)
      return Response.json(
        { error: 'Failed to send broadcast email' },
        { status: 500 },
      )
    }

    return Response.json({
      success: true,
      recipientCount: syncedCount || eligibleSpeakers.length,
      broadcastId: broadcastResponse.data!.id,
      audienceId,
    })
  } catch (error) {
    console.error('Broadcast email error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
})
