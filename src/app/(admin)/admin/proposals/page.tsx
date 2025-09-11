import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getProposals } from '@/lib/proposal/server'
import { ErrorDisplay } from '@/components/admin'
import { ProposalsPageClient } from '@/components/admin/ProposalsPageClient'
import { getAuthSession } from '@/lib/auth'

export default async function AdminProposals() {
  const session = await getAuthSession()

  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({ revalidate: 0 })

  if (conferenceError) {
    return (
      <ErrorDisplay
        title="Error Loading Conference"
        message={conferenceError.message}
      />
    )
  }

  const { proposals, proposalsError } = await getProposals({
    conferenceId: conference._id,
    returnAll: true,
    includeReviews: true,
    includePreviousAcceptedTalks: true,
  })

  if (proposalsError) {
    return (
      <ErrorDisplay
        title="Error Loading Proposals"
        message={proposalsError.message}
      />
    )
  }

  return (
    <ProposalsPageClient
      proposals={proposals}
      currentUserId={session?.speaker?._id}
      conference={conference}
    />
  )
}
