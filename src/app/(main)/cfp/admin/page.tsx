import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { ProposalTable } from '@/components/ProposalTable'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getProposals } from '@/lib/proposal/sanity'
import { ChevronRightIcon } from '@heroicons/react/20/solid'
import Link from 'next/link'

function ErrorDisplay({ title, message }: { title: string; message: string }) {
  return (
    <div className="relative py-6 sm:pt-12 sm:pb-20">
      <BackgroundImage className="absolute inset-x-0 -top-36 -bottom-14" />
      <Container className="relative max-w-screen-2xl">
        <div className="mx-auto max-w-screen-2xl lg:px-16">
          <h1 className="font-display text-5xl font-bold tracking-tighter text-red-600 sm:text-7xl">
            {title}
          </h1>
          <p className="mt-4 text-lg text-gray-700">
            {message || 'An unexpected error occurred.'}
          </p>
        </div>
      </Container>
    </div>
  )
}

export default async function AllProposals() {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain()

  if (conferenceError) {
    return (
      <ErrorDisplay
        title="Error Loading Conference"
        message={conferenceError.message}
      />
    )
  }

  const { proposals, proposalsError } = await getProposals({
    conferenceId: conference._id,
    returnAll: true,
    includeReviews: true,
  })

  if (proposalsError) {
    return (
      <ErrorDisplay
        title="Error Loading Proposals"
        message={proposalsError.message}
      />
    )
  }

  return (
    <div className="relative py-6 sm:pt-12 sm:pb-20">
      <BackgroundImage className="absolute inset-x-0 -top-36 -bottom-14" />
      <Container className="relative max-w-screen-2xl">
        <div className="mx-auto max-w-screen-2xl lg:px-16">
          <nav className="mb-6">
            <ol className="flex items-center space-x-2 text-sm text-gray-500">
              <li>
                <Link href="/" className="hover:text-indigo-600 transition-colors">
                  Home
                </Link>
              </li>
              <ChevronRightIcon className="h-4 w-4 flex-none text-gray-400" aria-hidden="true" />
              <li>
                <Link href="/cfp" className="hover:text-indigo-600 transition-colors">
                  CFP
                </Link>
              </li>
              <ChevronRightIcon className="h-4 w-4 flex-none text-gray-400" aria-hidden="true" />
              <li className="font-medium text-indigo-600">
                Admin
              </li>
            </ol>
          </nav>

          {proposals.length === 0 ? (
            <div className="mx-auto flex flex-col items-center rounded-lg bg-white p-6">
              <p className="text-lg font-semibold text-gray-900">
                No proposals submitted yet.
              </p>
              <p className="mt-2 text-sm text-gray-500">
                Ask speakers to submit proposals for the conference.
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-white pt-4 shadow-sm">
              <ProposalTable p={proposals} />
            </div>
          )}
        </div>
      </Container>
    </div>
  )
}
