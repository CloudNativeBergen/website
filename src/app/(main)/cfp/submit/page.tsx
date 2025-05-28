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
    if (proposalId) {
      const { proposal: fetchedProposal, err } = await getProposal(
        proposalId,
        session.speaker._id,
      )
      if (err) {
        console.error('Error loading proposal:', err)
        loadingError = {
          type: 'Server Error',
          message: 'Failed to load proposal.',
        }
      } else if (!fetchedProposal) {
        loadingError = { type: 'Not Found', message: 'Proposal not found.' }
      } else {
        proposal = fetchedProposal
        if (fetchedProposal.speaker && 'name' in fetchedProposal.speaker) {
          speaker = fetchedProposal.speaker as Speaker
        }
      }
    } else {
      const { speaker: fetchedSpeaker, err } = await getSpeaker(
        session.speaker._id,
      )
      if (err) {
        console.error('Error loading speaker:', err)
        loadingError = {
          type: 'Server Error',
          message: 'Failed to load speaker.',
        }
      } else if (!fetchedSpeaker) {
        loadingError = { type: 'Not Found', message: 'Speaker not found.' }
      } else {
        speaker = fetchedSpeaker
      }
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
            <h1 className="font-display text-5xl font-bold tracking-tighter text-blue-600 sm:text-7xl">
              Submit Presentation
            </h1>
            <div className="mt-6 space-y-6 font-display text-2xl tracking-tight text-blue-900">
              <p>
                Become our next speaker and share your knowledge with the
                community! We are especially interested in local speakers who
                can provide unique insights and perspectives.
              </p>
            </div>
          </div>
          {loadingError && (
            <div className="mx-auto mt-12 max-w-2xl rounded-md bg-red-50 p-4 lg:max-w-4xl lg:px-12">
              <div className="flex">
                <div className="flex-shrink-0">
                  <XCircleIcon
                    className="h-5 w-5 text-red-400"
                    aria-hidden="true"
                  />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">
                    Loading failed: {loadingError.type}
                  </h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>{loadingError.message}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="mx-auto mt-12 max-w-2xl rounded-lg bg-white p-6 lg:max-w-4xl lg:px-12">
            <ProposalForm
              initialProposal={proposal}
              initialSpeaker={speaker}
              proposalId={proposalId}
              userEmail={session.speaker.email}
              conference={conference}
            />
          </div>
        </Container>
      </div>
    </>
  )
}
