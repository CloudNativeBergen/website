import { NextRequest, NextResponse } from 'next/server'
import { verifyInvitationToken } from '@/lib/cospeaker/server'
import { clientWrite } from '@/lib/sanity/client'
import { AppEnvironment } from '@/lib/environment'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const token = searchParams.get('token')
    const isTestMode = AppEnvironment.isTestModeFromUrl(request.url)

    if (!token) {
      return NextResponse.json(
        { error: 'Missing token parameter' },
        { status: 400 },
      )
    }

    // In test mode, create a mock token payload
    let payload
    if (isTestMode) {
      // Decode a simple test token format: "test-{invitationId}"
      if (token.startsWith('test-')) {
        payload = {
          invitationId: token.replace('test-', ''),
          inviteeEmail: 'test-invitee@example.com',
          proposalId: 'test-proposal-id',
          expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours from now
        }
      } else {
        return NextResponse.json(
          { error: 'Invalid test token format' },
          { status: 400 },
        )
      }
    } else {
      // Verify real token
      payload = verifyInvitationToken(token)
      if (!payload) {
        return NextResponse.json(
          { error: 'Invalid or expired token' },
          { status: 400 },
        )
      }
    }

    // Get full invitation details
    let invitation
    if (isTestMode) {
      // Return a mock invitation for testing
      invitation = {
        _id: payload.invitationId,
        _type: 'coSpeakerInvitation',
        inviterEmail: 'test@example.com',
        inviterName: 'Test Speaker',
        inviteeEmail: payload.inviteeEmail,
        inviteeName: 'Test Invitee',
        proposal: {
          _ref: payload.proposalId,
        },
        status: 'pending',
        expiresAt: new Date(payload.expiresAt).toISOString(),
        createdAt: new Date().toISOString(),
      }
    } else {
      invitation = await clientWrite.fetch(
        `*[_type == "coSpeakerInvitation" && _id == $invitationId][0]`,
        { invitationId: payload.invitationId },
      )

      if (!invitation) {
        return NextResponse.json(
          { error: 'Invitation not found' },
          { status: 404 },
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

    // Return invitation details
    return NextResponse.json({
      invitation: {
        ...invitation,
        isExpired: new Date(invitation.expiresAt) < new Date(),
      },
      payload,
    })
  } catch (error) {
    console.error('Error verifying invitation:', error)
    return NextResponse.json(
      { error: 'Failed to verify invitation' },
      { status: 500 },
    )
  }
}
