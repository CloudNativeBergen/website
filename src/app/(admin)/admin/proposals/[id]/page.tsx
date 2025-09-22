import { notFound } from 'next/navigation'
import { ClockIcon } from '@heroicons/react/20/solid'
import { getProposalSanity } from '@/lib/proposal/server'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  ProposalDetail,
  ErrorDisplay,
  BackToProposalsButton,
  ProposalReviewPanel,
  AdminActionBar,
} from '@/components/admin'
import { getAuthSession } from '@/lib/auth'

interface ProposalDetailPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function ProposalDetailPage({
  params,
}: ProposalDetailPageProps) {
  const { id } = await params
  const session = await getAuthSession()

  try {
    const { conference, domain } = await getConferenceForCurrentDomain({
      revalidate: 0,
    })
    const { proposal, proposalError } = await getProposalSanity({
      id,
      speakerId: '',
      isOrganizer: true,
      includeReviews: true,
      includePreviousAcceptedTalks: true,
      includeSubmittedTalks: true,
    })

    if (proposalError) {
      return (
        <ErrorDisplay
          title="Error Loading Proposal"
          message={proposalError.message}
          backLink={{ href: '/admin/proposals', label: 'Back to Proposals' }}
        />
      )
    }

    if (!proposal) {
      notFound()
    }

    return (
      <div className="flex h-full min-h-screen flex-col lg:flex-row">
        <div className="min-w-0 flex-1">
          <div className="mx-auto max-w-4xl p-4 lg:p-0">
            <div className="mb-8">
              <div className="mb-4 flex items-center justify-between">
                <BackToProposalsButton />

                <div className="flex items-center space-x-3">
                  <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                    <ClockIcon className="mr-1 h-4 w-4" />
                    <span className="hidden sm:inline">Last updated: </span>
                    {new Date(
                      proposal._updatedAt || proposal._createdAt,
                    ).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <AdminActionBar
                proposal={proposal}
                domain={domain}
                fromEmail={conference.cfp_email}
              />
            </div>

            <ProposalDetail proposal={proposal} />
          </div>
        </div>

        <div className="lg:block">
          <ProposalReviewPanel
            proposalId={proposal._id}
            initialReviews={proposal.reviews || []}
            currentUser={session?.speaker}
            domain={domain}
          />
        </div>
      </div>
    )
  } catch (error) {
    console.error('Error loading proposal:', error)

    return (
      <ErrorDisplay
        title="Unexpected Error"
        message="Unable to load proposal details. Please try again later."
        backLink={{ href: '/admin/proposals', label: 'Back to Proposals' }}
      />
    )
  }
}
