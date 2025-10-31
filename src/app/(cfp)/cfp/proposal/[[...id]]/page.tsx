import { XCircleIcon } from '@heroicons/react/24/solid'
import {
  Format,
  Language,
  Level,
  FormError,
  ProposalInput,
} from '@/lib/proposal/types'
import { getProposalSanity } from '@/lib/proposal/server'
import { Speaker } from '@/lib/speaker/types'
import { ProposalForm } from '@/components/cfp/ProposalForm'
import { ProposalGuidanceSidebar } from '@/components/cfp/ProposalGuidanceSidebar'
import { getAuthSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getSpeaker } from '@/lib/speaker/sanity'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export const dynamic = 'force-dynamic'

export default async function ProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id?: string[] }>
  searchParams: Promise<{ id?: string }>
}) {
  // Support both /cfp/proposal/[id] and /cfp/proposal?id=[id] patterns
  const routeParams = await params
  const queryParams = await searchParams
  const proposalId = routeParams.id?.[0] || queryParams.id

  const session = await getAuthSession()
  if (!session?.speaker) {
    const callbackUrl = proposalId
      ? `/cfp/proposal/${proposalId}`
      : '/cfp/proposal'
    return redirect(`/api/auth/signin?callbackUrl=${callbackUrl}`)
  }

  let proposal: ProposalInput = {
    title: '',
    language: Language.norwegian,
    description: [],
    format: Format.lightning_10,
    level: Level.beginner,
    audiences: [],
    topics: [],
    outline: '',
    tos: false,
  }
  let speaker = { name: '', email: '' }
  let loadingError: FormError | null = null
  let currentUserSpeaker: Speaker | null = null

  const { conference, error } = await getConferenceForCurrentDomain({
    topics: true,
  })

  if (!conference || error) {
    console.error('Error loading conference:', error)
    loadingError = {
      type: 'Server Error',
      message: 'Failed to load conference.',
    }
  }

  if (conference && !proposalId) {
    const { isCfpOpen } = await import('@/lib/conference/state')
    if (!isCfpOpen(conference)) {
      const contactEmail = conference.cfp_email || conference.contact_email
      loadingError = {
        type: 'CFP Closed',
        message: contactEmail
          ? `The Call for Papers is currently closed. We'd love to have you speak at our next conference! Please check back when the next CFP opens, or reach out to ${contactEmail} if you have any questions.`
          : 'The Call for Papers is currently closed. We&apos;d love to have you speak at our next conference! Please check back when the next CFP opens, or contact the organizers if you have any questions.',
      }
    }
  }

  try {
    const { speaker: fetchedSpeaker, err } = await getSpeaker(
      session.speaker._id,
    )
    if (err) {
      console.error('Error loading current user speaker:', err)
      loadingError = {
        type: 'Server Error',
        message: 'Failed to load current user information.',
      }
    } else if (!fetchedSpeaker) {
      loadingError = {
        type: 'Not Found',
        message: 'Current user speaker not found.',
      }
    } else {
      currentUserSpeaker = fetchedSpeaker

      if (!proposalId && conference && !loadingError) {
        const { getProposals } = await import('@/lib/proposal/data/sanity')
        const { Status } = await import('@/lib/proposal/types')
        const { proposals: existingProposals } = await getProposals({
          speakerId: session.speaker._id,
          conferenceId: conference._id,
          returnAll: false,
        })

        const proposalCount = (existingProposals || []).filter(
          (p) => p.status !== Status.deleted,
        ).length

        if (proposalCount >= 3) {
          loadingError = {
            type: 'Maximum Reached',
            message:
              'You have reached the maximum of 3 proposals per conference. Please edit or withdraw an existing proposal if you need to submit a new one.',
          }
        }
      }
    }
  } catch (error) {
    console.error('Error loading current user speaker:', error)
    loadingError = {
      type: 'Server Error',
      message: 'Failed to load current user information.',
    }
  }

  try {
    if (proposalId) {
      const { proposal: fetchedProposal, proposalError } =
        await getProposalSanity({
          id: proposalId,
          speakerId: session.speaker._id,
          isOrganizer: false,
        })
      if (proposalError) {
        console.error('Error loading proposal:', proposalError)
        loadingError = {
          type: 'Server Error',
          message: 'Failed to load proposal.',
        }
      } else if (!fetchedProposal) {
        loadingError = { type: 'Not Found', message: 'Proposal not found.' }
      } else {
        proposal = fetchedProposal
        if (
          fetchedProposal.speakers &&
          Array.isArray(fetchedProposal.speakers) &&
          fetchedProposal.speakers.length > 0
        ) {
          const currentUserSpeakerData = fetchedProposal.speakers.find(
            (s): s is Speaker =>
              typeof s === 'object' &&
              s !== null &&
              '_id' in s &&
              s._id === session.speaker._id,
          )

          if (currentUserSpeakerData) {
            speaker = currentUserSpeakerData
          } else if (currentUserSpeaker) {
            speaker = currentUserSpeaker
          }
        }
      }
    } else if (currentUserSpeaker) {
      speaker = currentUserSpeaker
    }
  } catch (error) {
    console.error('Error loading data:', error)
    loadingError = { type: 'Server Error', message: 'Failed to load data.' }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="font-space-grotesk text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          {proposalId ? 'Edit Proposal' : 'Submit Presentation'}
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {proposalId
            ? 'Update your proposal details'
            : 'Become our next speaker and share your knowledge with the community!'}
        </p>
      </div>

      {loadingError && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-6 dark:border-blue-800/50 dark:bg-blue-900/20">
          <div className="flex">
            <div className="flex-shrink-0">
              <XCircleIcon
                className="h-6 w-6 text-blue-600 dark:text-blue-400"
                aria-hidden="true"
              />
            </div>
            <div className="ml-4">
              <h3 className="font-space-grotesk text-lg font-semibold text-blue-900 dark:text-blue-200">
                {loadingError.type}
              </h3>
              <div className="font-inter mt-2 text-blue-800 dark:text-blue-300">
                <p>{loadingError.message}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {!loadingError && currentUserSpeaker && (
        <div className="flex gap-6">
          <div className="flex-1">
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <ProposalForm
                initialProposal={proposal}
                initialSpeaker={speaker}
                proposalId={proposalId}
                userEmail={session.speaker.email}
                conference={conference}
                allowedFormats={conference.formats}
                currentUserSpeaker={currentUserSpeaker}
              />
            </div>
          </div>

          <div className="hidden w-80 flex-shrink-0 lg:block">
            <ProposalGuidanceSidebar conference={conference} />
          </div>
        </div>
      )}
    </div>
  )
}
