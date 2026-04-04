import { connection } from 'next/server'
import { XCircleIcon } from '@heroicons/react/24/solid'
import Link from 'next/link'
import {
  Format,
  Language,
  Level,
  FormError,
  ProposalInput,
} from '@/lib/proposal/types'
import { countActiveProposals } from '@/lib/proposal/utils'
import { Speaker } from '@/lib/speaker/types'
import { ProposalForm } from '@/components/cfp/ProposalForm'
import { ProposalGuidanceSidebar } from '@/components/cfp/ProposalGuidanceSidebar'
import { getAuthSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getSpeaker } from '@/lib/speaker/sanity'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export default async function NewProposalPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  await connection()

  // Redirect old ?id= URLs to the path-based route
  const { id } = await searchParams
  if (id) {
    redirect(`/cfp/proposal/${id}`)
  }

  const headersList = await headers()
  const fullUrl = headersList.get('x-url') || ''
  const session = await getAuthSession({ url: fullUrl })

  if (!session?.speaker) {
    return redirect('/api/auth/signin?callbackUrl=/cfp/proposal')
  }

  const proposal: ProposalInput = {
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

  if (conference) {
    const { isCfpOpen } = await import('@/lib/conference/state')
    if (!isCfpOpen(conference)) {
      const contactEmail = conference.cfpEmail || conference.contactEmail
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
      speaker = fetchedSpeaker

      if (conference && !loadingError) {
        const { getProposals } = await import('@/lib/proposal/data/sanity')
        const { proposals: existingProposals } = await getProposals({
          speakerId: session.speaker._id,
          conferenceId: conference._id,
          returnAll: false,
        })

        const proposalCount = countActiveProposals(existingProposals)

        if (proposalCount >= 3) {
          loadingError = {
            type: 'Maximum Reached',
            message:
              'You have reached the maximum of 3 proposals per conference. Please go to your proposals list to unsubmit or withdraw an existing proposal if you need to submit a new one.',
            link: { href: '/cfp/list', label: 'Go to your proposals' },
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

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="font-space-grotesk text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          Submit Presentation
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Become our next speaker and share your knowledge with the community!
        </p>
      </div>

      {loadingError && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-6 dark:border-blue-800/50 dark:bg-blue-900/20">
          <div className="flex">
            <div className="shrink-0">
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
                {loadingError.link && (
                  <p className="mt-3">
                    <Link
                      href={loadingError.link.href}
                      className="font-semibold text-brand-cloud-blue underline hover:text-brand-cloud-blue-hover dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      {loadingError.link.label}
                    </Link>
                  </p>
                )}
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
                key="new"
                initialProposal={proposal}
                initialSpeaker={speaker}
                userEmail={session.speaker.email}
                conference={conference}
                allowedFormats={conference.formats}
                currentUserSpeaker={currentUserSpeaker}
              />
            </div>
          </div>

          <div className="hidden w-80 shrink-0 lg:block">
            <ProposalGuidanceSidebar conference={conference} />
          </div>
        </div>
      )}
    </div>
  )
}
