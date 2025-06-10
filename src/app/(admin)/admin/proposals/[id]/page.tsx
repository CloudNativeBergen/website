import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeftIcon, ClockIcon, UserIcon } from '@heroicons/react/20/solid'
import { getProposal } from '@/lib/proposal/sanity'
import { ProposalDetail, ErrorDisplay } from '@/components/admin'

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
      <div className="min-h-full">
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
              {/* TODO: Add quick action buttons for approve/reject */}
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

        {/* Admin Notes Section */}
        {proposal.reviews && proposal.reviews.length > 0 && (
          <div className="mt-8">
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Review History</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Internal reviews and feedback from organizers
                </p>
              </div>
              <div className="px-6 py-4">
                <div className="space-y-4">
                  {proposal.reviews.map((review, index) => (
                    <div key={index} className="border-l-4 border-blue-400 pl-4">
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">Review #{index + 1}</span>
                        {/* TODO: Add review details when review structure is available */}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
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
