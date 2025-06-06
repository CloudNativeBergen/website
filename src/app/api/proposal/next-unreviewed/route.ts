import { NextAuthRequest, auth } from '@/lib/auth'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { fetchNextUnreviewedProposal } from '@/lib/proposal/sanity'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export const GET = auth(async (req: NextAuthRequest) => {
  if (!req.auth || !req.auth.speaker || !req.auth.speaker._id) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const reviewerId = req.auth.speaker._id
  const currentProposalId = req.nextUrl.searchParams.get('currentProposalId') || undefined

  // Get the conference from the current domain
  const { conference, error: conferenceError } = await getConferenceForCurrentDomain()

  if (conferenceError || !conference) {
    return NextResponse.json(
      { error: conferenceError?.message || 'Conference not found' },
      { status: 404 }
    )
  }

  // Get the next unreviewed proposal
  const { nextProposal, error } = await fetchNextUnreviewedProposal({
    conferenceId: conference._id,
    reviewerId,
    currentProposalId
  })

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch next unreviewed proposal' },
      { status: 500 }
    )
  }

  return NextResponse.json({ nextProposal })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any
