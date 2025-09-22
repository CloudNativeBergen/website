import { NextAuthRequest, auth } from '@/lib/auth'
import { checkOrganizerAccess } from '@/lib/auth/admin'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { fetchNextUnreviewedProposal } from '@/lib/proposal/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export const GET = auth(async (req: NextAuthRequest) => {
  const accessError = checkOrganizerAccess(req)
  if (accessError) {
    return accessError
  }

  const reviewerId = req.auth!.speaker._id
  const currentProposalId =
    req.nextUrl.searchParams.get('currentProposalId') || undefined

  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({ revalidate: 0 })

  if (conferenceError || !conference) {
    return NextResponse.json(
      { error: conferenceError?.message || 'Conference not found' },
      { status: 404 },
    )
  }

  const { nextProposal, error } = await fetchNextUnreviewedProposal({
    conferenceId: conference._id,
    reviewerId,
    currentProposalId,
  })

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch next unreviewed proposal' },
      { status: 500 },
    )
  }

  return NextResponse.json({ nextProposal })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any
