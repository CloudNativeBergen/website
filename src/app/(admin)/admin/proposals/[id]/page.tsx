import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeftIcon, ClockIcon, UserIcon } from '@heroicons/react/20/solid'
import { getProposal } from '@/lib/proposal/sanity'
import { ProposalDetail, ErrorDisplay, AdminReviewPanel } from '@/components/admin'
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
      <div className="flex h-full min-h-screen">
        {/* Main Content Area */}
        <div className="flex-1 min-w-0">
          <div className="max-w-4xl mx-auto p-0">
            {/* Header with Navigation and Metadata */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <Link
                  href="/admin/proposals"
                  className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <ChevronLeftIcon className="mr-2 h-4 w-4" />
                  Back to Proposals
                </Link>

                {/* Quick Actions */}
                <div className="flex items-center space-x-3">
                  <div className="text-sm text-gray-500 flex items-center">
                    <ClockIcon className="mr-1 h-4 w-4" />
                    Last updated: {new Date(proposal._updatedAt || proposal._createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {/* Admin Metadata Bar */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-6">
                    <div className="flex items-center text-gray-600">
                      <UserIcon className="mr-1 h-4 w-4" />
                      <span className="font-medium">ID:</span>
                      <code className="ml-1 text-xs bg-gray-100 px-1 py-0.5 rounded">{proposal._id}</code>
                    </div>
                    <div className="text-gray-600">
                      <span className="font-medium">Created:</span>
                      <span className="ml-1">{new Date(proposal._createdAt).toLocaleString()}</span>
                    </div>
                    {proposal.reviews && proposal.reviews.length > 0 && (
                      <div className="text-gray-600">
                        <span className="font-medium">Reviews:</span>
                        <span className="ml-1">{proposal.reviews.length}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-gray-500">
                    Admin View
                  </div>
                </div>
              </div>
            </div>

            {/* Proposal Detail Component */}
            <ProposalDetail proposal={proposal} />
          </div>
        </div>

        {/* Review Panel */}
        <AdminReviewPanel
          proposalId={proposal._id}
          initialReviews={proposal.reviews || []}
          currentUser={session?.speaker}
        />
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
