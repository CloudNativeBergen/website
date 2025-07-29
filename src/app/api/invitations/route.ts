import { NextRequest, NextResponse } from 'next/server'
import {
  getInvitationsForProposal,
  getInvitationsForProposals,
} from '@/lib/cospeaker/sanity'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const proposalId = searchParams.get('proposalId')
    const proposalIds = searchParams.get('proposalIds')

    // Single proposal ID
    if (proposalId) {
      const invitations = await getInvitationsForProposal(proposalId)
      return NextResponse.json({ invitations })
    }

    // Multiple proposal IDs (batch fetch)
    if (proposalIds) {
      const ids = proposalIds.split(',').filter(Boolean)
      const invitationsByProposal = await getInvitationsForProposals(ids)
      return NextResponse.json({ invitationsByProposal })
    }

    return NextResponse.json(
      { error: 'Either proposalId or proposalIds parameter is required' },
      { status: 400 },
    )
  } catch (error) {
    console.error('Error fetching invitations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch invitations' },
      { status: 500 },
    )
  }
}
