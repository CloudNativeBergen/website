import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getProposals } from '@/lib/proposal/sanity'
import { ProposalsList, ErrorDisplay } from '@/components/admin'

export default async function AdminProposals() {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain()

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
  })

  if (proposalsError) {
    return (
      <ErrorDisplay
        title="Error Loading Proposals"
        message={proposalsError.message}
      />
    )
  }

  return <ProposalsList proposals={proposals} />
}
