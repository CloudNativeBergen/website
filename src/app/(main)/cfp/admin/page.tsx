import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { ProposalTable } from '@/components/ProposalTable'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getProposals } from '@/lib/proposal/sanity'

function ErrorDisplay({ title, message }: { title: string; message: string }) {
  return (
    <div className="relative py-20 sm:pb-24 sm:pt-36">
      <BackgroundImage className="-bottom-14 -top-36" />
      <Container className="relative">
        <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
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
  const { conference, error: conferenceError } = await getConferenceForCurrentDomain()

  if (conferenceError) {
    return <ErrorDisplay title="Error Loading Conference" message={conferenceError.message} />
  }

  const { proposals, error: proposalsError } = await getProposals({ conferenceId: conference._id, returnAll: true })

  if (proposalsError) {
    return <ErrorDisplay title="Error Loading Proposals" message={proposalsError.message} />
  }

  return (
    <div className="relative py-20 sm:pb-24 sm:pt-36">
      <BackgroundImage className="-bottom-14 -top-36" />
      <Container className="relative">
        <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
          <h1 className="font-display text-5xl font-bold tracking-tighter text-blue-600 sm:text-7xl">
            Admin Dashboard
          </h1>
        </div>
        <>
          {proposals.length === 0 ? (
            <div className="mx-auto mt-12 flex max-w-2xl flex-col items-center rounded-lg border-2 border-dashed border-blue-600 bg-white p-6 lg:max-w-4xl lg:px-12">
              <p className="text-lg font-semibold text-gray-900">
                No proposals submitted yet.
              </p>
              <p className="mt-2 text-sm text-gray-500">
                Ask speakers to submit proposals for the conference.
              </p>
            </div>
          ) : (
            <div className="mx-auto mt-12 max-w-4xl rounded-xl bg-white pt-4 shadow-sm ring-1 ring-gray-900/5 lg:max-w-6xl">
              <ProposalTable p={proposals} />
            </div>
          )}
        </>
      </Container>
    </div>
  )
}
