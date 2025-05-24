import { NextAuthRequest, auth } from '@/lib/auth'
import { proposalListResponse, proposalListResponseError } from '@/lib/proposal/server'
import { getProposals } from '@/lib/proposal/sanity'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export const dynamic = 'force-dynamic'

export const GET = auth(async (req: NextAuthRequest) => {
  if (
    !req.auth ||
    !req.auth.user ||
    !req.auth.speaker ||
    !req.auth.speaker._id ||
    !req.auth.account ||
    !req.auth.speaker.is_organizer
  ) {
    return proposalListResponseError(
      new Error('Unauthorized'),
      'Unauthorized',
      'authentication',
      401,
    )
  }

  const { conference, error: conferenceError } = await getConferenceForCurrentDomain()

  if (conferenceError || !conference) {
    return proposalListResponseError(
      conferenceError,
      'Failed to fetch conference',
      'server',
      500,
    )
  }

  const { proposals, error: proposalsError } = await getProposals({
    speakerId: req.auth.speaker._id,
    conferenceId: conference?._id,
    returnAll: req.auth.speaker.is_organizer,
  })

  if (proposalsError) {
    return proposalListResponseError(
      proposalsError,
      'Failed to fetch proposals',
      'server',
      500
    )
  }

  return proposalListResponse(proposals)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any
