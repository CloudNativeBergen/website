import { NextAuthRequest, auth } from '@/lib/auth'
import { getProposalSanity as getProposal } from '@/lib/proposal/server'
import {
  createCoSpeakerInvitation,
  sendInvitationEmail,
} from '@/lib/cospeaker/server'
import { getTotalSpeakerLimit } from '@/lib/cospeaker/constants'
import { NextResponse } from 'next/server'
import { clientWrite } from '@/lib/sanity/client'
import { AppEnvironment } from '@/lib/environment'

export const dynamic = 'force-dynamic'

export const POST = auth(
  async (
    req: NextAuthRequest,
    context: { params: Record<string, string | string[] | undefined> },
  ) => {
    // This needs to be awaited – do not remove
    // https://stackoverflow.com/questions/79145063/params-should-be-awaited-nextjs15
    const { proposalId } = await context.params

    const mockAuth = AppEnvironment.createMockAuthFromRequest(req)
    if (mockAuth) {
      req.auth = mockAuth
    }

    if (
      !req.auth ||
      !req.auth.user ||
      !req.auth.speaker ||
      !req.auth.speaker._id ||
      !req.auth.account
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      const { inviteeEmail, inviteeName } = await req.json()

      if (!inviteeEmail || !inviteeName) {
        return NextResponse.json(
          { error: 'Missing required fields: inviteeEmail and inviteeName' },
          { status: 400 },
        )
      }

      if (inviteeEmail.toLowerCase() === req.auth.user.email!.toLowerCase()) {
        return NextResponse.json(
          { error: 'You cannot invite yourself as a co-speaker' },
          { status: 400 },
        )
      }

      const isTestMode = AppEnvironment.getTestModeFromRequest(req)
      const { proposal, proposalError } = await getProposal({
        id: proposalId as string,
        speakerId: isTestMode
          ? AppEnvironment.testUser.speakerId
          : req.auth.speaker._id,
        isOrganizer: isTestMode,
      })

      if (proposalError || !proposal) {
        return NextResponse.json(
          { error: 'Proposal not found or unauthorized' },
          { status: 404 },
        )
      }

      const maxSpeakers = getTotalSpeakerLimit(proposal.format)
      const currentSpeakerCount = proposal.speakers?.length || 0

      const pendingInvitations = await clientWrite.fetch(
        `count(*[_type == "coSpeakerInvitation" && proposal._ref == $proposalId && status == "pending"])`,
        { proposalId },
      )

      const totalPotentialSpeakers =
        currentSpeakerCount + pendingInvitations + 1

      if (totalPotentialSpeakers > maxSpeakers) {
        return NextResponse.json(
          {
            error: `This ${proposal.format.replace('_', ' ')} format allows a maximum of ${maxSpeakers} speakers. You currently have ${currentSpeakerCount} speaker(s) and ${pendingInvitations} pending invitation(s).`,
          },
          { status: 400 },
        )
      }

      const invitation = await createCoSpeakerInvitation({
        invitedByEmail: req.auth.user.email!,
        invitedByName: req.auth.speaker.name,
        invitedEmail: inviteeEmail,
        invitedName: inviteeName,
        proposalId: proposalId as string,
        proposalTitle: proposal.title,
        invitedBySpeakerId: req.auth.speaker._id,
      })

      if (!invitation) {
        return NextResponse.json(
          { error: 'Failed to create invitation' },
          { status: 500 },
        )
      }

      if (!isTestMode) {
        const emailSent = await sendInvitationEmail(invitation)

        if (!emailSent) {
          console.error('Failed to send invitation email for:', invitation._id)
        }
      } else {
        console.log(
          '[TEST MODE] Skipping email send for invitation:',
          invitation._id,
        )
      }

      return NextResponse.json({ invitation }, { status: 200 })
    } catch (error) {
      console.error('[POST /api/invitation/[proposalId]] Error:', error)
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      )
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as any

export const DELETE = auth(
  async (
    req: NextAuthRequest,
    context: { params: Record<string, string | string[] | undefined> },
  ) => {
    const { proposalId } = await context.params

    const mockAuth = AppEnvironment.createMockAuthFromRequest(req)
    if (mockAuth) {
      req.auth = mockAuth
    }

    if (
      !req.auth ||
      !req.auth.user ||
      !req.auth.speaker ||
      !req.auth.speaker._id ||
      !req.auth.account
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      const { invitationId } = await req.json()

      if (!invitationId) {
        return NextResponse.json(
          { error: 'Missing required field: invitationId' },
          { status: 400 },
        )
      }

      const isTestMode = AppEnvironment.getTestModeFromRequest(req)
      const { proposal, proposalError } = await getProposal({
        id: proposalId as string,
        speakerId: isTestMode
          ? AppEnvironment.testUser.speakerId
          : req.auth.speaker._id,
        isOrganizer: isTestMode,
      })

      if (proposalError || !proposal) {
        return NextResponse.json(
          { error: 'Proposal not found or unauthorized' },
          { status: 404 },
        )
      }

      const invitation = await clientWrite.fetch(
        `*[_type == "coSpeakerInvitation" && _id == $invitationId && proposal._ref == $proposalId][0]`,
        { invitationId, proposalId },
      )

      if (!invitation) {
        return NextResponse.json(
          { error: 'Invitation not found or unauthorized' },
          { status: 404 },
        )
      }

      if (invitation.status !== 'pending') {
        return NextResponse.json(
          { error: 'Can only cancel pending invitations' },
          { status: 400 },
        )
      }

      await clientWrite
        .patch(invitationId)
        .set({
          status: 'canceled',
          canceledAt: new Date().toISOString(),
        })
        .commit()

      return NextResponse.json(
        { message: 'Invitation canceled successfully' },
        { status: 200 },
      )
    } catch (error) {
      console.error('[DELETE /api/invitation/[proposalId]] Error:', error)
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      )
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as any
