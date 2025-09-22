import { NextRequest, NextResponse } from 'next/server'
import { verifyInvitationToken } from '@/lib/cospeaker/server'
import { getInvitationByToken } from '@/lib/cospeaker/sanity'
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
          { error: 'Invalid or expired token signature' },
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
    if (isExpired && invitation.status === 'pending') {
      return NextResponse.json(
        {
          error: 'Invitation has expired',
          isExpired: true,
        },
        { status: 400 },
      )
    }

    return NextResponse.json({
      invitation: {
        ...invitation,
        isExpired,
      },
    })
  } catch (error) {
    console.error('Error verifying invitation:', error)
    return NextResponse.json(
      { error: 'Failed to verify invitation' },
      { status: 500 },
    )
  }
}
