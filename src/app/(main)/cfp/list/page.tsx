import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import {
  PlusCircleIcon,
} from '@heroicons/react/20/solid'
import { auth } from '@/lib/auth'
import { getProposals } from '@/lib/proposal/sanity'
import { ProposalList } from '@/components/ProposalList'
import { redirect } from 'next/navigation'

export default async function SpeakerDashboard() {
  const cfpIsOpen = true // TODO: Fetch this from the API

  const session = await auth()
  if (!session?.speaker) {
    return redirect('/api/auth/signin?callbackUrl=/cfp/list')
  }

  const { proposals: initialProposals, err: error } = await getProposals(session.speaker._id, false)

  if (error) {
    console.error('Error fetching proposals:', error)
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-red-500">Error fetching proposals</p>
      </div>
    )
  }

  return (
    <div className="relative py-20 sm:pb-24 sm:pt-36">
      <BackgroundImage className="-bottom-14 -top-36" />
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
        <ProposalList initialProposals={initialProposals} cfpIsOpen={cfpIsOpen} />
      </Container>
    </div>
  )
}
