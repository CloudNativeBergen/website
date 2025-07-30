import { NextRequest, NextResponse } from 'next/server'
import {
  verifyInvitationToken,
  updateInvitationStatus,
} from '@/lib/cospeaker/server'
import { clientWrite } from '@/lib/sanity/client'
import { createReferenceWithKey } from '@/lib/sanity/helpers'
import { getOrCreateSpeaker, findSpeakerByEmail } from '@/lib/speaker/sanity'
import { sendEmail } from '@/lib/cospeaker/server'
import { auth } from '@/lib/auth'
import { CoSpeakerResponseTemplate } from '@/components/email/CoSpeakerResponseTemplate'
import { AppEnvironment } from '@/lib/environment'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { formatDate } from '@/lib/time'
import { getTotalSpeakerLimit } from '@/lib/cospeaker/constants'
import { v4 as randomUUID } from 'uuid'
import type { User } from 'next-auth'

interface RespondRequest {
  token: string
  action: 'accept' | 'decline'
}

export async function POST(request: NextRequest) {
  try {
    // Check for test mode
    const isTestMode = AppEnvironment.isTestModeFromUrl(request.url)

    const session = await auth()
    if (!isTestMode && !session?.user?.email) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      )
    }

    const body = (await request.json()) as RespondRequest
    const { token, action } = body

    if (!token || !['accept', 'decline'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid request parameters' },
        { status: 400 },
      )
    }

    // Verify token
    const payload = verifyInvitationToken(token)
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 400 },
      )
    }

    // Verify email matches (skip in test mode) - case insensitive comparison
    if (
      !isTestMode &&
      session?.user?.email &&
      payload.inviteeEmail.toLowerCase() !== session.user.email.toLowerCase()
    ) {
      return NextResponse.json(
        { error: 'This invitation is for a different email address' },
        { status: 403 },
      )
    }

    // Get invitation details
    const invitation = await clientWrite.fetch(
      `*[_type == "coSpeakerInvitation" && _id == $invitationId][0]{
        _id,
        status,
        proposal->{
          _id,
          title
        },
        invitedBy->{
          name,
          email
        },
        invitedName,
        invitedEmail,
        expiresAt
      }`,
      { invitationId: payload.invitationId },
    )

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invitation not found' },
        { status: 404 },
      )
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json(
        {
          error: 'Invitation has already been responded to',
          status: invitation.status,
        },
        { status: 400 },
      )
    }

    // Get proposal details
    const proposal = await clientWrite.fetch(
      `*[_type == "talk" && _id == $proposalId][0]{
        _id,
        title,
        format,
        speakers[]->{
          _id,
          name,
          email,
          "image": image.asset->url
        },
        conference->{_id}
      }`,
      { proposalId: invitation.proposal._id },
    )

    if (!proposal) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
    }

    let updatedProposal = null
    let acceptedSpeakerId: string | null = null

    if (action === 'accept') {
      // Check speaker limits before accepting
      const maxSpeakers = getTotalSpeakerLimit(proposal.format)
      const currentSpeakerCount = proposal.speakers?.length || 0

      if (currentSpeakerCount >= maxSpeakers) {
        return NextResponse.json(
          {
            error: `This ${proposal.format.replace('_', ' ')} format allows a maximum of ${maxSpeakers} speakers. The proposal already has ${currentSpeakerCount} speaker(s).`,
          },
          { status: 400 },
        )
      }
      // Get or create speaker profile
      if (isTestMode) {
        // In test mode, we need to use findSpeakerByEmail or create a new speaker
        const testEmail = payload.inviteeEmail
        const { speaker: existingSpeaker } = await findSpeakerByEmail(testEmail)

        if (existingSpeaker?._id) {
          acceptedSpeakerId = existingSpeaker._id
        } else {
          // Create a minimal speaker for testing
          const newSpeaker = await clientWrite.create({
            _type: 'speaker',
            _id: randomUUID(),
            email: testEmail,
            name: invitation.invitedName || AppEnvironment.testUser.name,
            providers: [],
            slug: {
              _type: 'slug',
              current: (invitation.invitedName || 'test-user')
                .toLowerCase()
                .replace(/\s+/g, '-')
                .slice(0, 96),
            },
          })

          acceptedSpeakerId = newSpeaker._id
        }
      } else {
        // In production, use the authenticated account
        const account = session?.account
        if (!account) {
          return NextResponse.json(
            { error: 'Account information not found in session' },
            { status: 500 },
          )
        }

        const user: User = {
          email: session.user.email,
          name: session.user.name,
          image: session.user.picture,
        }

        const result = await getOrCreateSpeaker(user, account)

        if (result.err || !result.speaker) {
          return NextResponse.json(
            { error: 'Failed to get or create speaker profile' },
            { status: 500 },
          )
        }

        acceptedSpeakerId = result.speaker._id
      }

      // Add speaker to the speakers array of the proposal
      const currentSpeakers = proposal.speakers || []
      const speakerRefs = currentSpeakers.map((s: { _id: string }) =>
        createReferenceWithKey(s._id, 'speaker'),
      )

      // Check if the speaker is already in the list
      const alreadyAdded = speakerRefs.some(
        (ref: { _ref: string }) => ref._ref === acceptedSpeakerId,
      )

      if (!alreadyAdded) {
        // Add new speaker reference using the helper function
        speakerRefs.push(createReferenceWithKey(acceptedSpeakerId!, 'speaker'))

        updatedProposal = await clientWrite
          .patch(proposal._id)
          .set({ speakers: speakerRefs })
          .commit()
      } else {
        // Speaker is already in the list, just fetch the proposal again
        updatedProposal = proposal
      }
    }

    // Update invitation status
    const updatedInvitation = await updateInvitationStatus(
      invitation._id,
      action === 'accept' ? 'accepted' : 'declined',
      acceptedSpeakerId || undefined,
    )

    // Send notification email to inviter (only if we have their email)
    if (invitation.invitedBy?.email) {
      try {
        // Fetch conference data for the current domain
        const { conference, error: conferenceError } =
          await getConferenceForCurrentDomain()
        if (conferenceError || !conference) {
          console.error('Error fetching conference data:', conferenceError)
        }

        // Use conference data for event details
        const eventName = conference?.title || 'Cloud Native Bergen'
        const eventLocation = conference?.city
          ? `${conference.city}, ${conference.country || 'Norway'}`
          : 'Bergen, Norway'
        const eventDate = conference?.start_date
          ? formatDate(conference.start_date)
          : 'TBD'
        const eventUrl =
          conference && conference.domains?.[0]
            ? `https://${conference.domains[0]}`
            : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

        const emailResult = await sendEmail({
          to: invitation.invitedBy.email,
          subject: `Co-speaker invitation ${action === 'accept' ? 'accepted' : 'declined'}: ${invitation.proposal?.title}`,
          component: CoSpeakerResponseTemplate,
          props: {
            inviterName: invitation.invitedBy?.name || 'Unknown',
            respondentName:
              invitation.invitedName ||
              (isTestMode
                ? AppEnvironment.testUser.name
                : session?.user?.name) ||
              'Co-speaker',
            respondentEmail: invitation.invitedEmail,
            proposalTitle: invitation.proposal?.title || 'Unknown Proposal',
            proposalUrl: `${eventUrl}/cfp/list`,
            eventName,
            eventLocation,
            eventDate,
            eventUrl,
            accepted: action === 'accept',
          },
        })

        if (!emailResult.success) {
          console.error('Failed to send notification email:', emailResult.error)
        }
      } catch (emailError) {
        console.error('Error sending notification email:', emailError)
        // Continue processing even if email fails
      }
    }

    return NextResponse.json({
      success: true,
      action,
      invitation: updatedInvitation,
      proposal: updatedProposal,
    })
  } catch (error) {
    console.error('Error responding to invitation:', error)
    return NextResponse.json(
      { error: 'Failed to process invitation response' },
      { status: 500 },
    )
  }
}
