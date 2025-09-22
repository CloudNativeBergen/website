import { NextRequest, NextResponse } from 'next/server'
import {
  verifyInvitationToken,
  updateInvitationStatus,
} from '@/lib/cospeaker/server'
import { getInvitationByToken } from '@/lib/cospeaker/sanity'
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

    const invitation = await getInvitationByToken(token)

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invalid token or invitation not found' },
        { status: 404 },
      )
    }

    if (!isTestMode) {
      const payload = verifyInvitationToken(token)
      if (!payload) {
        return NextResponse.json(
          { error: 'Invalid or expired token' },
          { status: 400 },
        )
      }

      if (
        payload.invitationId !== invitation._id ||
        payload.invitedEmail !== invitation.invitedEmail
      ) {
        return NextResponse.json(
          { error: 'Token does not match invitation data' },
          { status: 400 },
        )
      }
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

    const isExpired = new Date(invitation.expiresAt) < new Date()
    if (isExpired) {
      return NextResponse.json(
        { error: 'Invitation has expired' },
        { status: 400 },
      )
    }

    const proposalId =
      typeof invitation.proposal === 'object' && '_id' in invitation.proposal
        ? invitation.proposal._id
        : typeof invitation.proposal === 'object' &&
            '_ref' in invitation.proposal
          ? invitation.proposal._ref
          : null

    if (!proposalId) {
      return NextResponse.json(
        { error: 'Proposal reference not found' },
        { status: 400 },
      )
    }

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
      { proposalId },
    )

    if (!proposal) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
    }

    let updatedProposal = null
    let acceptedSpeakerId: string | null = null

    if (action === 'accept') {
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

      if (isTestMode) {
        const testEmail = invitation.invitedEmail
        const { speaker: existingSpeaker } = await findSpeakerByEmail(testEmail)

        if (existingSpeaker?._id) {
          acceptedSpeakerId = existingSpeaker._id
        } else {
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

      const currentSpeakers = proposal.speakers || []
      const speakerRefs = currentSpeakers.map((s: { _id: string }) =>
        createReferenceWithKey(s._id, 'speaker'),
      )

      const alreadyAdded = speakerRefs.some(
        (ref: { _ref: string }) => ref._ref === acceptedSpeakerId,
      )

      if (!alreadyAdded) {
        speakerRefs.push(createReferenceWithKey(acceptedSpeakerId!, 'speaker'))

        updatedProposal = await clientWrite
          .patch(proposal._id)
          .set({ speakers: speakerRefs })
          .commit()
      } else {
        updatedProposal = proposal
      }
    }

    const updatedInvitation = await updateInvitationStatus(
      invitation._id,
      action === 'accept' ? 'accepted' : 'declined',
      acceptedSpeakerId || undefined,
    )

    const inviterEmail =
      typeof invitation.invitedBy === 'object' &&
      'email' in invitation.invitedBy
        ? invitation.invitedBy.email
        : null
    const inviterName =
      typeof invitation.invitedBy === 'object' && 'name' in invitation.invitedBy
        ? invitation.invitedBy.name
        : 'Unknown'
    const proposalTitle =
      typeof invitation.proposal === 'object' && 'title' in invitation.proposal
        ? invitation.proposal.title
        : proposal?.title || 'Unknown Proposal'

    if (inviterEmail) {
      try {
        const { conference, error: conferenceError } =
          await getConferenceForCurrentDomain()
        if (conferenceError || !conference) {
          console.error('Error fetching conference data:', conferenceError)
        }

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
          to: inviterEmail,
          subject: `Co-speaker invitation ${action === 'accept' ? 'accepted' : 'declined'}: ${proposalTitle}`,
          from: `${conference.organizer} <${conference.cfp_email}>`,
          component: CoSpeakerResponseTemplate,
          props: {
            inviterName,
            respondentName:
              invitation.invitedName ||
              (isTestMode
                ? AppEnvironment.testUser.name
                : session?.user?.name) ||
              'Co-speaker',
            respondentEmail: invitation.invitedEmail,
            proposalTitle,
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
