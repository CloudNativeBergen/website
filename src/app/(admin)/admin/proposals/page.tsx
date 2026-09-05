import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getProposals } from '@/lib/proposal/server'
import { ErrorDisplay } from '@/components/admin'
import { ProposalsPageClient } from '@/components/admin/ProposalsPageClient'
import { InviteReviewersPrompt } from '@/components/admin/InviteReviewersPrompt'
import { getAuthSession } from '@/lib/auth'

export default async function AdminProposals() {
  const session = await getAuthSession()

  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({ topics: true })

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
    <>
      {/* platform#49 phase 2: first proposal in, still a one-person committee.
          Both counts are SERVER-derived from reads this page already makes —
          `organizers` stays as raw refs without the expansion (see
          @/lib/conference/sections), and only the length is read. */}
      <InviteReviewersPrompt
        organizerCount={conference.organizers?.length ?? 0}
        proposalCount={proposals.length}
      />
      <ProposalsPageClient
        proposals={proposals}
        currentUserId={session?.speaker?._id}
        conference={conference}
      />
    </>
  )
}
