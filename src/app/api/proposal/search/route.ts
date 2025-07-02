import { NextRequest } from 'next/server'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { searchProposals } from '@/lib/proposal/sanity'
import {
  proposalListResponse,
  proposalListResponseError,
} from '@/lib/proposal/server'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await auth()

  if (!session?.speaker?.is_organizer) {
    return proposalListResponseError(
      new Error('Unauthorized'),
      'Access denied',
      'client',
      403,
    )
  }

  const { searchParams } = new URL(request.url)
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
    await getConferenceForCurrentDomain()

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
}
