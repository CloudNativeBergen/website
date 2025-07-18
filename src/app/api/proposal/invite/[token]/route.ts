import { NextRequest, NextResponse } from 'next/server'
import { auth, NextAuthRequest } from '@/lib/auth'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { Proposal, CoSpeakerInvitation, CoSpeakerInvitationStatus } from '@/lib/proposal/types'
import { findSpeakerByEmail, getOrCreateSpeaker } from '@/lib/speaker/sanity'
import { v4 as randomUUID } from 'uuid'
import { groq } from 'next-sanity'

// GET /api/proposal/invite/[token] - Get invitation details
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params

    // Find the proposal with this invitation token
    const proposal = await (clientReadUncached as any).fetch(
      groq`*[_type == "talk" && $token in coSpeakerInvitations[].token][0] {
        _id,
        title,
        speaker-> {
          _id,
          name,
          email
        },
        coSpeakerInvitations[token == $token][0]
      }`,
      { token },
      { cache: 'no-store' }
    )

    if (!proposal || !proposal.coSpeakerInvitations) {
      return NextResponse.json(
        { error: 'Invalid invitation token' },
        { status: 404 }
      )
    }

    const invitation = proposal.coSpeakerInvitations as CoSpeakerInvitation

    // Check if invitation is expired
    if (new Date(invitation.expiresAt) < new Date() && invitation.status === 'pending') {
      // Update status to expired
      await clientWrite
        .patch(proposal._id)
        .set({
          [`coSpeakerInvitations[token == "${token}"].status`]: 'expired'
        })
        .commit()

      invitation.status = CoSpeakerInvitationStatus.expired
    }

    return NextResponse.json({
      proposalId: proposal._id,
      proposalTitle: proposal.title,
      primarySpeaker: {
        name: proposal.speaker.name,
        email: proposal.speaker.email
      },
      invitedEmail: invitation.email,
      status: invitation.status,
      expiresAt: invitation.expiresAt
    })
  } catch (error) {
    console.error('Error fetching invitation:', error)
    return NextResponse.json(
      { error: 'Failed to fetch invitation' },
      { status: 500 }
    )
  }
}

// POST /api/proposal/invite/[token] - Accept or reject invitation
export const POST = auth(
  async (
    req: NextAuthRequest,
    { params }: { params: Record<string, string | string[] | undefined> }
  ) => {
    try {
      if (!req.auth?.user?.email) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        )
      }

      const { token } = params as { token: string }
      const { action } = await req.json()

      if (!['accept', 'reject'].includes(action)) {
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        )
      }

      // Find the proposal with this invitation token
      const proposal = await (clientReadUncached as any).fetch(
        groq`*[_type == "talk" && $token in coSpeakerInvitations[].token][0] {
          _id,
          title,
          speaker-> {
            _id,
            name,
            email
          },
          coSpeakers[]-> {
            _id,
            email
          },
          coSpeakerInvitations[token == $token][0]
        }`,
        { token },
        { cache: 'no-store' }
      )

      if (!proposal || !proposal.coSpeakerInvitations) {
        return NextResponse.json(
          { error: 'Invalid invitation token' },
          { status: 404 }
        )
      }

      const invitation = proposal.coSpeakerInvitations as CoSpeakerInvitation

      // Verify the session email matches the invited email
      if (req.auth.user.email.toLowerCase() !== invitation.email.toLowerCase()) {
        return NextResponse.json(
          { error: 'Email mismatch' },
          { status: 403 }
        )
      }

      // Check if invitation is expired
      if (new Date(invitation.expiresAt) < new Date()) {
        return NextResponse.json(
          { error: 'Invitation has expired' },
          { status: 400 }
        )
      }

      // Check if invitation is still pending
      if (invitation.status !== 'pending') {
        return NextResponse.json(
          { error: `Invitation has already been ${invitation.status}` },
          { status: 400 }
        )
      }

      if (action === 'accept') {
        // Get or create speaker
        const { speaker: existingSpeaker } = await findSpeakerByEmail(invitation.email)
        
        let speaker = existingSpeaker
        if (!speaker?._id) {
          // Create new speaker
          const speakerId = randomUUID()
          const slugValue = (invitation.name || invitation.email.split('@')[0]).toLowerCase().replace(/\s+/g, '-').slice(0, 96)
          const speakerData = {
            _id: speakerId,
            _type: 'speaker',
            email: invitation.email,
            name: invitation.name || invitation.email.split('@')[0], // Use name from invitation or derive from email
            slug: {
              _type: 'slug',
              current: slugValue
            }
          }
          
          const createdSpeaker = await clientWrite.create(speakerData)
          speaker = {
            ...createdSpeaker,
            slug: slugValue
          } as any
        }

        // Add speaker as co-speaker and update invitation status
        const existingCoSpeakers = proposal.coSpeakers || []
        const coSpeakerRefs = existingCoSpeakers.map((s: any) => ({
          _type: 'reference',
          _ref: s._id
        }))

        // Add the new co-speaker if not already present
        if (!existingCoSpeakers.some((s: any) => s._id === speaker._id)) {
          coSpeakerRefs.push({
            _type: 'reference',
            _ref: speaker._id
          })
        }

        await clientWrite
          .patch(proposal._id)
          .set({
            coSpeakers: coSpeakerRefs,
            [`coSpeakerInvitations[token == "${token}"].status`]: 'accepted',
            [`coSpeakerInvitations[token == "${token}"].respondedAt`]: new Date().toISOString()
          })
          .commit()

        return NextResponse.json({
          success: true,
          message: 'Invitation accepted',
          speakerId: speaker._id
        })
      } else {
        // Reject invitation
        await clientWrite
          .patch(proposal._id)
          .set({
            [`coSpeakerInvitations[token == "${token}"].status`]: 'rejected',
            [`coSpeakerInvitations[token == "${token}"].respondedAt`]: new Date().toISOString()
          })
          .commit()

        return NextResponse.json({
          success: true,
          message: 'Invitation rejected'
        })
      }
    } catch (error) {
      console.error('Error processing invitation:', error)
      return NextResponse.json(
        { error: 'Failed to process invitation' },
        { status: 500 }
      )
    }
  }
) as any // Type assertion needed due to Next.js Auth middleware typing