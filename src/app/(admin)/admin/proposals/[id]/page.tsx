import { Suspense } from 'react'
import { clientReadUncached } from '@/lib/sanity/client'
import { CalendarIcon } from '@heroicons/react/20/solid'
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
import { BackLink } from '@/components/BackButton'
import { ProposalMessagesRedirect } from '@/components/messaging'
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

    const schedules = conference
      ? await clientReadUncached.fetch<{ _id: string; status: string }[]>(
          `*[_type == "schedule" && conference._ref == $conferenceId && references($proposalId)] { _id, status }`,
          { conferenceId: conference._id, proposalId: id },
        )
      : []

    const inSchedule =
      schedules.length > 0
        ? schedules.some((s) => s.status === 'official')
          ? 'official'
          : schedules.some((s) => s.status === 'draft')
            ? 'draft'
            : null
        : null

    return (
      <div className="flex h-full min-h-screen flex-col lg:flex-row">
        {/* Renders nothing. Forwards a legacy `#messages` deep link (still
            stored on notification documents) to the messages workspace, which
            is where organizers read a proposal thread. The live entry point is
            the Message action in AdminActionBar. Suspense because it reads
            `useSearchParams` to notice a fragment-only navigation. */}
        <Suspense>
          <ProposalMessagesRedirect proposalId={proposal._id} />
        </Suspense>
        <div className="min-w-0 flex-1">
          <div className="w-full p-4">
            {inSchedule && (
              <div
                className={`mb-4 flex items-center gap-2 rounded-md p-3 text-sm font-medium ${
                  inSchedule === 'official'
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                }`}
              >
                <CalendarIcon className="h-5 w-5" />
                <span>
                  {inSchedule === 'official'
                    ? 'This proposal is included in the Official Schedule.'
                    : 'This proposal is currently placed in a Draft Schedule.'}
                </span>
              </div>
            )}
            <div className="mb-5">
              <div className="mb-3 flex items-center justify-between">
                <BackLink fallbackUrl="/admin/proposals">
                  Back to Proposals
                </BackLink>

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
