import { notFound, redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getProposalSanity as getProposal } from '@/lib/proposal/server'
import { getAuthSession } from '@/lib/auth'
import { getSpeaker } from '@/lib/speaker/sanity'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ProposalForm } from '@/components/cfp/ProposalForm'
import Link from 'next/link'
import { ChevronLeftIcon } from '@heroicons/react/20/solid'
import type { Speaker } from '@/lib/speaker/types'

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
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="font-space-grotesk text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Error Loading Proposal
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {proposalError.message}
          </p>
        </div>

        <Link
          href="/cfp/list"
          className="hover:text-brand-electric-purple inline-flex items-center text-brand-cloud-blue transition-colors"
        >
          <ChevronLeftIcon className="mr-2 h-5 w-5" />
          Back to My Proposals
        </Link>
      </div>
    )
  }

  if (!proposal) {
    notFound()
  }

  const { speaker: currentUserSpeaker, err: speakerError } = await getSpeaker(
    session.speaker._id,
  )

  if (speakerError || !currentUserSpeaker) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="font-space-grotesk text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Error Loading Speaker
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Failed to load speaker information
          </p>
        </div>

        <Link
          href="/cfp/list"
          className="hover:text-brand-electric-purple inline-flex items-center text-brand-cloud-blue transition-colors"
        >
          <ChevronLeftIcon className="mr-2 h-5 w-5" />
          Back to My Proposals
        </Link>
      </div>
    )
  }

  const { conference } = await getConferenceForCurrentDomain({ topics: true })

  if (!conference) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="font-space-grotesk text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Error Loading Conference
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Failed to load conference information
          </p>
        </div>

        <Link
          href="/cfp/list"
          className="hover:text-brand-electric-purple inline-flex items-center text-brand-cloud-blue transition-colors"
        >
          <ChevronLeftIcon className="mr-2 h-5 w-5" />
          Back to My Proposals
        </Link>
      </div>
    )
  }

  const currentUserSpeakerData =
    proposal.speakers?.find(
      (s): s is Speaker =>
        typeof s === 'object' &&
        s !== null &&
        '_id' in s &&
        s._id === session.speaker._id,
    ) || currentUserSpeaker

  const backUrl = session.isImpersonating
    ? `/cfp/list?impersonate=${session.speaker._id}`
    : '/cfp/list'

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Link
          href={backUrl}
          className="hover:text-brand-electric-purple inline-flex items-center text-brand-cloud-blue transition-colors"
        >
          <ChevronLeftIcon className="mr-2 h-5 w-5" />
          Back to My Proposals
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="font-space-grotesk text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          View Proposal
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Read-only view of your proposal
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <ProposalForm
          initialProposal={proposal}
          initialSpeaker={currentUserSpeakerData}
          proposalId={proposal._id}
          userEmail={session.speaker.email}
          conference={conference}
          allowedFormats={conference.formats}
          currentUserSpeaker={currentUserSpeaker}
          mode="readOnly"
        />
      </div>
    </div>
  )
}
