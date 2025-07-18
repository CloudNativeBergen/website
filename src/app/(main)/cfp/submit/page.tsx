import { XCircleIcon } from '@heroicons/react/24/solid'
import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import {
  Format,
  Language,
  Level,
  FormError,
  ProposalInput,
} from '@/lib/proposal/types'
import { getProposal } from '@/lib/proposal/sanity'
import { Speaker } from '@/lib/speaker/types'
import { ProposalForm } from '@/components/ProposalForm'
import { auth } from '@/lib/auth'
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

  const session = await auth()
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

  // Always fetch the current user speaker for the form
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
      const { proposal: fetchedProposal, proposalError } = await getProposal({
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
          const primarySpeaker = fetchedProposal.speakers[0]
          if (
            typeof primarySpeaker === 'object' &&
            primarySpeaker &&
            'name' in primarySpeaker
          ) {
            speaker = primarySpeaker as Speaker
          }
        }
      }
    } else if (currentUserSpeaker) {
      // For new proposals, use the current user speaker
      speaker = currentUserSpeaker
    }
  } catch (error) {
    console.error('Error loading data:', error)
    loadingError = { type: 'Server Error', message: 'Failed to load data.' }
  }

  return (
    <>
      <div className="relative py-20 sm:pt-36 sm:pb-24">
        <BackgroundImage className="-top-36 -bottom-14" />
        <Container className="relative">
          <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
            <h1 className="font-jetbrains text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl">
              Submit Presentation
            </h1>
            <div className="font-inter mt-6 space-y-6 text-xl tracking-tight text-brand-slate-gray">
              <p>
                Become our next speaker and share your knowledge with the
                community! We are especially interested in local speakers who
                can provide unique insights and perspectives.
              </p>
            </div>
          </div>
          {loadingError && (
            <div className="mx-auto mt-12 max-w-2xl rounded-lg border border-red-200 bg-red-50 p-6 lg:max-w-4xl lg:px-12">
              <div className="flex">
                <div className="flex-shrink-0">
                  <XCircleIcon
                    className="h-6 w-6 text-red-500"
                    aria-hidden="true"
                  />
                </div>
                <div className="ml-4">
                  <h3 className="font-space-grotesk text-lg font-semibold text-red-800">
                    Loading Error: {loadingError.type}
                  </h3>
                  <div className="font-inter mt-2 text-red-700">
                    <p>{loadingError.message}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          {!loadingError && currentUserSpeaker && (
            <div className="mx-auto mt-12 max-w-2xl rounded-xl border border-brand-frosted-steel bg-white p-8 shadow-sm lg:max-w-4xl lg:px-12">
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
        </Container>
      </div>
    </>
  )
}
