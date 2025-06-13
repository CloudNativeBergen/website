import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { PlusCircleIcon } from '@heroicons/react/20/solid'
import { auth } from '@/lib/auth'
import { getProposals } from '@/lib/proposal/sanity'
import { ProposalList } from '@/components/ProposalList'
import { redirect } from 'next/navigation'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-red-500">{message}</p>
    </div>
  )
}

export default async function SpeakerDashboard() {
  const session = await auth()
  if (!session?.speaker) {
    return redirect('/api/auth/signin?callbackUrl=/cfp/list')
  }

  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain()

  if (conferenceError || !conference) {
    console.error('Error loading conference:', conferenceError)
    return <ErrorDisplay message="Error loading conference" />
  }

  const cfpIsOpen =
    new Date() >= new Date(conference.cfp_start_date) &&
    new Date() <= new Date(conference.cfp_end_date)

  const { proposals: initialProposals, proposalsError } = await getProposals({
    speakerId: session.speaker._id,
    conferenceId: conference?._id,
    returnAll: false,
  })

  if (proposalsError) {
    console.error('Error fetching proposals:', proposalsError)
    return <ErrorDisplay message="Error fetching proposals" />
  }

  return (
    <div className="relative py-20 sm:pt-36 sm:pb-24">
      <BackgroundImage className="-top-36 -bottom-14" />
      <Container className="relative">
        <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
          <h1 className="font-display text-5xl font-bold tracking-tighter text-blue-600 sm:text-7xl">
            Speaker Dashboard
            {cfpIsOpen && (
              <a href="/cfp/submit">
                <PlusCircleIcon className="ml-8 inline-block h-14 w-14 text-blue-600 hover:text-blue-500" />
              </a>
            )}
          </h1>
          <div className="mt-6 space-y-6 font-display text-2xl tracking-tight text-blue-900">
            <p>
              Thank you for your interest in submitting a presentation to our
              conference.
            </p>
          </div>
        </div>
        <ProposalList
          initialProposals={initialProposals}
          cfpIsOpen={cfpIsOpen}
        />
      </Container>
    </div>
  )
}
