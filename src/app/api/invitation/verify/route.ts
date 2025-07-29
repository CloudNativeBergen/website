import { NextRequest, NextResponse } from 'next/server'
import { verifyInvitationToken } from '@/lib/cospeaker/server'
import { clientWrite } from '@/lib/sanity/client'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json(
        { error: 'Missing token parameter' },
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

    // Get full invitation details
    const invitation = await clientWrite.fetch(
      `*[_type == "coSpeakerInvitation" && _id == $invitationId][0]`,
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
