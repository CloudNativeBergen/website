import { NextAuthRequest, auth } from '@/lib/auth'
import { checkOrganizerAccess } from '@/lib/auth/admin'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { searchProposals } from '@/lib/proposal/server'
import {
  proposalListResponse,
  proposalListResponseError,
} from '@/lib/proposal/server'

export const dynamic = 'force-dynamic'

export const GET = auth(async (req: NextAuthRequest): Promise<Response> => {
  const accessError = checkOrganizerAccess(req)
  if (accessError) {
    return accessError
  }

  const { searchParams } = new URL(req.url)
  const query = searchParams.get('q')

  if (!query) {
    return proposalListResponseError(
      new Error('Missing search query'),
      'Search query is required',
      'client',
      400,
    )
  }

  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({ revalidate: 0 })

  if (conferenceError) {
    return proposalListResponseError(
      conferenceError,
      'Failed to fetch conference',
      'server',
      500,
    )
  }

  const { proposals, proposalsError } = await searchProposals({
    query,
    conferenceId: conference._id,
    includeReviews: true,
    includePreviousAcceptedTalks: true,
  })

  if (proposalsError) {
    return proposalListResponseError(
      proposalsError,
      'Failed to search proposals',
      'server',
      500,
    )
  }

  return proposalListResponse(proposals)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any
