import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  createCoSpeakerInvitation,
  sendInvitationEmail,
} from '@/lib/cospeaker/server'
import { getProposalSanity as getProposal } from '@/lib/proposal/server'
import { findSpeakerByEmail } from '@/lib/speaker/sanity'
import { Speaker } from '@/lib/speaker/types'

interface InvitationRequest {
  inviteeEmail: string
  inviteeName: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ proposalId: string }> },
) {
  try {
    // Check for test mode
    const isTestMode =
      process.env.NODE_ENV === 'development' &&
      request.nextUrl.searchParams.get('test') === 'true'

    // Authenticate user (bypass in test mode)
    const session = await auth()
    
    // In test mode, create a mock session
    const mockSession = isTestMode ? {
      user: {
        email: 'test@example.com',
        name: 'Test User',
      }
    } : null

    if (!session?.user?.email && !mockSession) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      )
    }

    const userEmail = session?.user?.email || mockSession?.user?.email || ''
    const userName = session?.user?.name || mockSession?.user?.name || 'Unknown'

    const { proposalId } = await params
    const body = (await request.json()) as InvitationRequest
    const { inviteeEmail, inviteeName } = body

    // Validate input
    if (!inviteeEmail || !inviteeName) {
      return NextResponse.json(
        { error: 'Invitee email and name are required' },
        { status: 400 },
      )
    }

    // Get current speaker first (create test speaker in test mode)
    let currentSpeaker
    if (isTestMode) {
      currentSpeaker = {
        _id: 'test-speaker-id',
        name: 'Test Speaker',
        email: 'test@example.com',
      }
    } else {
      const { speaker } = await findSpeakerByEmail(userEmail)
      currentSpeaker = speaker
      
      if (!currentSpeaker) {
        return NextResponse.json(
          { error: 'Speaker profile not found' },
          { status: 404 },
        )
      }
    }

    // Get proposal to verify ownership and conference context
    const getProposalParams = {
      id: proposalId,
      isOrganizer: isTestMode ? true : false, // In test mode, allow access as organizer
      speakerId: isTestMode ? 'test-speaker-id' : currentSpeaker._id, // Always provide speakerId
    }
    
    const { proposal, proposalError } = await getProposal(getProposalParams)

    if (proposalError || !proposal) {
      return NextResponse.json(
        { error: 'Proposal not found or access denied' },
        { status: 404 },
      )
    }

    // Since we already filtered by speakerId in the query, if we got a result,
    // the current user has access to this proposal
    // Additional check: ensure they are the main speaker (first in the array)
    const mainSpeaker = proposal.speakers?.[0]

    // Type guard to check if it's a populated speaker
    const isSpeaker = (obj: unknown): obj is Speaker => {
      return obj !== null && typeof obj === 'object' && '_id' in obj
    }

    const mainSpeakerId = isSpeaker(mainSpeaker) ? mainSpeaker._id : null

    if (!mainSpeakerId || mainSpeakerId !== currentSpeaker._id) {
      return NextResponse.json(
        { error: 'Only the main speaker can invite co-speakers' },
        { status: 403 },
      )
    }

    // Create the invitation in Sanity
    const invitation = await createCoSpeakerInvitation({
      inviterEmail: userEmail,
      inviterName: userName,
      inviteeEmail,
      inviteeName,
      proposalId,
      proposalTitle: proposal.title,
    })

    if (!invitation) {
      return NextResponse.json(
        { error: 'Failed to create invitation' },
        { status: 500 },
      )
    }

    // Send the invitation email (skip in test mode)
    if (!isTestMode) {
      try {
        await sendInvitationEmail(invitation)
      } catch (emailError) {
        console.error('Failed to send invitation email:', emailError)
        // Continue even if email fails - the invitation is created
      }
    } else {
      console.log('[TEST MODE] Skipping email send for invitation:', invitation._id)
    }

    return NextResponse.json({
      success: true,
      invitation,
      message: `Invitation sent to ${inviteeName}`,
    })
  } catch (error) {
    console.error('Error creating co-speaker invitation:', error)
    return NextResponse.json(
      { error: 'Failed to create invitation' },
      { status: 500 },
    )
  }
}
