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
import { getAuthSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getSpeaker } from '@/lib/speaker/sanity'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export const dynamic = 'force-dynamic'

export default async function Submit({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const { id: proposalId } = (await searchParams) || {}

  const session = await getAuthSession()
  if (!session?.speaker) {
    return redirect('/api/auth/signin?callbackUrl=/cfp/submit?id=' + proposalId)
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
          // Find the current user's speaker data, not just the first speaker
          const currentUserSpeakerData = fetchedProposal.speakers.find(
            (s): s is Speaker =>
              typeof s === 'object' &&
              s !== null &&
              '_id' in s &&
              s._id === session.speaker._id,
          )

          // Fall back to currentUserSpeaker if not found in proposal speakers
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
    <>
      <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
        <h1 className="font-jetbrains text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl dark:text-blue-400">
          Submit Presentation
        </h1>
        <div className="font-inter mt-6 space-y-6 text-xl tracking-tight text-brand-slate-gray dark:text-gray-300">
          <p>
            Become our next speaker and share your knowledge with the community!
          </p>
        </div>
      </div>
      {loadingError && (
        <div className="mx-auto mt-12 max-w-2xl rounded-lg border border-red-200 bg-red-50 p-6 lg:max-w-4xl lg:px-12 dark:border-red-800/50 dark:bg-red-900/20">
          <div className="flex">
            <div className="flex-shrink-0">
              <XCircleIcon
                className="h-6 w-6 text-red-500 dark:text-red-400"
                aria-hidden="true"
              />
            </div>
            <div className="ml-4">
              <h3 className="font-space-grotesk text-lg font-semibold text-red-800 dark:text-red-200">
                Loading Error: {loadingError.type}
              </h3>
              <div className="font-inter mt-2 text-red-700 dark:text-red-300">
                <p>{loadingError.message}</p>
              </div>
            </div>
          </div>
        </div>
      )}
      {!loadingError && currentUserSpeaker && (
        <div className="mx-auto mt-12 max-w-2xl rounded-xl border border-brand-frosted-steel bg-white p-8 shadow-sm lg:max-w-4xl lg:px-12 dark:border-gray-700 dark:bg-gray-800">
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
      )}
    </>
  )
}
