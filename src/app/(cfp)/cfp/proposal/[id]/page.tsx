import { notFound, redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getProposalSanity as getProposal } from '@/lib/proposal/server'
import { getAuthSession } from '@/lib/auth'
import { getSpeaker } from '@/lib/speaker/sanity'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ProposalReadOnlyView } from '@/components/cfp/ProposalReadOnlyView'
import { PostConferenceVideoPanel } from '@/components/cfp/PostConferenceVideoPanel'
import { PostConferenceAudienceFeedbackPanel } from '@/components/cfp/PostConferenceAudienceFeedbackPanel'
import { ProposalAttachmentsPanel } from '@/components/proposal/ProposalAttachmentsPanel'
import { isConferenceOver } from '@/lib/conference/state'
import { BackLink } from '@/components/BackButton'
import { buildUrlWithImpersonation } from '@/lib/impersonation'

interface ProposalViewPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function ProposalViewPage({
  params,
}: ProposalViewPageProps) {
  const { id } = await params
  const headersList = await headers()
  const fullUrl = headersList.get('x-url') || ''
  const session = await getAuthSession({ url: fullUrl })

  if (!session?.speaker) {
    return redirect('/api/auth/signin?callbackUrl=/cfp/proposal/' + id)
  }

  const isImpersonatingAsOrganizer =
    session.isImpersonating && !!session.realAdmin?.is_organizer

  const { proposal, proposalError } = await getProposal({
    id,
    speakerId: session.speaker._id,
    isOrganizer: isImpersonatingAsOrganizer,
  })

  if (proposalError) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="font-space-grotesk text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Error Loading Proposal
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {proposalError.message}
          </p>
        </div>

        <BackLink fallbackUrl="/cfp/list">Back to Dashboard</BackLink>
      </div>
    )
  }

  if (!proposal) {
    notFound()
  }

  // Editable proposals (draft/submitted) should use the edit form
  if (proposal.status === 'draft' || proposal.status === 'submitted') {
    redirect(`/cfp/proposal?id=${id}`)
  }

  const { speaker: currentUserSpeaker, err: speakerError } = await getSpeaker(
    session.speaker._id,
  )

  if (speakerError || !currentUserSpeaker) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="font-space-grotesk text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Error Loading Speaker
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Failed to load speaker information
          </p>
        </div>

        <BackLink fallbackUrl="/cfp/list">Back to Dashboard</BackLink>
      </div>
    )
  }

  const { conference } = await getConferenceForCurrentDomain({ topics: true })

  if (!conference) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="font-space-grotesk text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Error Loading Conference
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Failed to load conference information
          </p>
        </div>

        <BackLink fallbackUrl="/cfp/list">Back to Dashboard</BackLink>
      </div>
    )
  }

  const backUrl = buildUrlWithImpersonation('/cfp/list', session)

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <BackLink fallbackUrl={backUrl}>Back to Dashboard</BackLink>
      </div>

      <div className="mb-6">
        <h1 className="font-space-grotesk text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          View Proposal
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Read-only view of your proposal
        </p>
      </div>

      <div className="flex gap-6">
        <div className="flex-1 space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <ProposalReadOnlyView proposal={proposal} />
          </div>
        </div>

        {(proposal.status === 'confirmed' ||
          proposal.status === 'accepted') && (
          <div className="hidden w-80 shrink-0 space-y-6 lg:block">
            <ProposalAttachmentsPanel
              proposalId={proposal._id}
              initialAttachments={proposal.attachments || []}
            />
            {isConferenceOver(conference) && (
              <>
                <PostConferenceVideoPanel proposal={proposal} />
                <PostConferenceAudienceFeedbackPanel
                  audienceFeedback={proposal.audienceFeedback}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
