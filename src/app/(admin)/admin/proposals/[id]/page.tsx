import { notFound } from 'next/navigation'
import { ClockIcon } from '@heroicons/react/20/solid'
import { getProposal } from '@/lib/proposal/sanity'
import { ProposalDetail, ErrorDisplay, BackToProposalsButton, ProposalReviewPanel, AdminActionBar } from '@/components/admin'
import { auth } from '@/lib/auth'

interface ProposalDetailPageProps {
  params: Promise<{
    id: string
  }>
}

/**
 * Admin proposal detail page
 * Displays comprehensive proposal information for admin review
 * Includes metadata, review history, and admin actions
 */
export default async function ProposalDetailPage({ params }: ProposalDetailPageProps) {
  const { id } = await params
  const session = await auth()

  try {
    const { proposal, proposalError } = await getProposal({
      id,
      speakerId: '', // For admin view, we don't need to filter by speaker
      isOrganizer: true,
      includeReviews: true,
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
      <div className="flex flex-col lg:flex-row h-full min-h-screen">
        {/* Main Content Area */}
        <div className="flex-1 min-w-0">
          <div className="max-w-4xl mx-auto p-4 lg:p-0">
            {/* Header with Navigation and Metadata */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <BackToProposalsButton />

                {/* Quick Actions */}
                <div className="flex items-center space-x-3">
                  <div className="text-sm text-gray-500 flex items-center">
                    <ClockIcon className="mr-1 h-4 w-4" />
                    <span className="hidden sm:inline">Last updated: </span>
                    {new Date(proposal._updatedAt || proposal._createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
              {/* Enhanced Admin Action Bar */}
              <AdminActionBar proposal={proposal} />
            </div>

            <ProposalDetail proposal={proposal} />
          </div>
        </div>

        <div className="lg:block">
          <ProposalReviewPanel
            proposalId={proposal._id}
            initialReviews={proposal.reviews || []}
            currentUser={session?.speaker}
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
