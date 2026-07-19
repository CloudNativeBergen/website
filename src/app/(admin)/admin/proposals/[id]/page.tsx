import { notFound } from 'next/navigation'
import { ClockIcon } from '@heroicons/react/20/solid'
import { getProposalSanity } from '@/lib/proposal/server'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  ProposalDetail,
  ErrorDisplay,
  ProposalReviewPanel,
  AdminActionBar,
  ProposalPublishedContent,
  AudienceFeedbackPanel,
} from '@/components/admin'
import { BackLink } from '@/components/BackButton'
import { ProposalMessagesSection } from '@/components/messaging'
import { getAuthSession } from '@/lib/auth'
import { getProposalVideoUrl } from '@/lib/proposal/video'

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
      topics: true,
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
          <div className="mx-auto max-w-4xl p-4">
            <div className="mb-5">
              <div className="mb-3 flex items-center justify-between">
                <BackLink fallbackUrl="/admin/proposals">
                  Back to Proposals
                </BackLink>

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
              <AdminActionBar proposal={proposal} conference={conference} />
            </div>

            <ProposalDetail proposal={proposal} />

            <div className="mt-6">
              <ProposalMessagesSection
                proposalId={proposal._id}
                audience="organizer"
              />
            </div>
          </div>
        </div>

        <div className="w-full lg:w-96 lg:shrink-0">
          {/* Review scoring comes first: on mobile this column stacks below
              the proposal, so a reviewer reaches scoring without scrolling
              past the post-conference published content and audience feedback.
              Source order (not CSS order) so keyboard/screen-reader order
              matches the visual order. */}
          <div className="space-y-4 p-4">
            <ProposalReviewPanel
              proposalId={proposal._id}
              initialReviews={proposal.reviews || []}
              currentUser={session?.speaker}
              domain={domain}
            />
            <ProposalPublishedContent
              proposalId={proposal._id}
              currentVideoUrl={getProposalVideoUrl(proposal)}
              currentAttachments={proposal.attachments}
              status={proposal.status}
              conferenceEndDate={conference.endDate}
            />
            <AudienceFeedbackPanel
              proposalId={proposal._id}
              currentFeedback={proposal.audienceFeedback}
              status={proposal.status}
              conferenceStartDate={conference.startDate}
            />
          </div>
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
