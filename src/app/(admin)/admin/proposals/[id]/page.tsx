import { notFound } from 'next/navigation'
import { formatDate } from '@/lib/time'
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
import { clientReadUncached } from '@/lib/sanity/client'
import { BackLink } from '@/components/BackButton'

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
    // ORG-SCOPE the organizer read to this tenant (B1, #642): a proposal from
    // another organization's conference must not be reachable by URL id even for a
    // signed-in organizer. A null org fails closed (proposal → notFound below).
    const { proposal, proposalError } = await getProposalSanity({
      id,
      speakerId: '',
      isOrganizer: true,
      organizerOrgId: conference?.organization?._ref ?? null,
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

    // Check if the proposal is in the schedule
    const scheduledIn = conference?._id
      ? await clientReadUncached.fetch<{ status: string }[]>(
          `*[_type == "schedule" && conference._ref == $conferenceId && $proposalId in tracks[].talks[].talk._ref]{ status }`,
          { conferenceId: conference._id, proposalId: id },
        )
      : []

    const isScheduledDraft = scheduledIn.some((s) => s.status === 'draft')
    const isScheduledOfficial = scheduledIn.some(
      (s) => s.status === 'official' || !s.status,
    )

    return (
      <div className="flex h-full min-h-screen flex-col lg:flex-row">
        <div className="min-w-0 flex-1">
          <div className="mx-auto max-w-4xl p-4">
            <div className="mb-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <BackLink fallbackUrl="/admin/proposals">
                    Back to Proposals
                  </BackLink>
                  {(isScheduledOfficial || isScheduledDraft) && (
                    <span
                      title={
                        isScheduledOfficial
                          ? 'This talk is currently on the public schedule.'
                          : 'This talk is placed in the draft schedule, but not yet published.'
                      }
                      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                        isScheduledOfficial
                          ? 'bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-900/30 dark:text-green-400 dark:ring-green-500/20'
                          : 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-400 dark:ring-amber-500/20'
                      }`}
                    >
                      {isScheduledOfficial
                        ? 'On Live Schedule'
                        : 'In Draft Schedule'}
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-3">
                  <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                    <ClockIcon className="mr-1 h-4 w-4" />
                    <span className="hidden sm:inline">Last updated: </span>
                    {formatDate(proposal._updatedAt || proposal._createdAt)}
                  </div>
                </div>
              </div>
              <AdminActionBar proposal={proposal} conference={conference} />
            </div>

            <ProposalDetail proposal={proposal} />

            <div className="mt-6 flex justify-center border-t border-gray-200 pt-6 dark:border-gray-700">
              <a
                href={`?messageId=conversation.proposal.${proposal._id}`}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-gray-800 dark:text-white dark:ring-gray-700 dark:hover:bg-gray-700"
              >
                View messages
              </a>
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
