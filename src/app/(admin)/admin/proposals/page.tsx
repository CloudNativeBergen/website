import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getProposals } from '@/lib/proposal/sanity'
import { ExclamationTriangleIcon } from '@heroicons/react/20/solid'
import { DocumentTextIcon, UserIcon, ClockIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { ProposalExisting } from '@/lib/proposal/types'

function ErrorDisplay({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-6 py-24 sm:py-32 lg:px-8">
      <div className="text-center">
        <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-400" />
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          {title}
        </h1>
        <p className="mt-6 text-base leading-7 text-gray-600 max-w-lg">
          {message || 'An unexpected error occurred. Please try again later.'}
        </p>
        <div className="mt-10 flex items-center justify-center gap-x-6">
          <Link
            href="/admin"
            className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Back to Dashboard
          </Link>
          <Link
            href="/"
            className="text-sm font-semibold text-gray-900 hover:text-gray-700"
          >
            Go home <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

function ProposalsList({ proposals }: { proposals: ProposalExisting[] }) {
  return (
    <div className="px-4 py-10 sm:px-6 lg:px-8 lg:py-6">
      <div className="mx-auto max-w-7xl">
        <div className="border-b border-gray-200 pb-5">
          <h1 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
            Proposal Management
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Review and manage all conference proposals ({proposals.length} total)
          </p>
        </div>

        <div className="mt-8">
          {proposals.length === 0 ? (
            <div className="text-center py-12">
              <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-semibold text-gray-900">No proposals</h3>
              <p className="mt-1 text-sm text-gray-500">Get started by promoting the CFP.</p>
              <div className="mt-6">
                <Link
                  href="/cfp"
                  className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
                >
                  View CFP Page
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {proposals.map((proposal) => (
                <div
                  key={proposal._id}
                  className="relative rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400"
                >
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      <DocumentTextIcon className="h-6 w-6 text-gray-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="focus:outline-none">
                        <span aria-hidden="true" className="absolute inset-0" />
                        <p className="text-sm font-medium text-gray-900 line-clamp-2">
                          {proposal.title}
                        </p>
                        <div className="mt-2 flex items-center text-sm text-gray-500">
                          <UserIcon className="mr-1 h-4 w-4" />
                          {typeof proposal.speaker === 'object' && proposal.speaker && 'name' in proposal.speaker
                            ? proposal.speaker.name
                            : 'Unknown Speaker'}
                        </div>
                        <div className="mt-1 flex items-center text-sm text-gray-500">
                          <ClockIcon className="mr-1 h-4 w-4" />
                          {proposal.format} • {proposal.level}
                        </div>
                        <div className="mt-2">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${proposal.status === 'accepted' ? 'bg-green-100 text-green-800' :
                            proposal.status === 'rejected' ? 'bg-red-100 text-red-800' :
                              proposal.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
                                'bg-yellow-100 text-yellow-800'
                            }`}>
                            {proposal.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Link to the detailed proposal management */}
        {proposals.length > 0 && (
          <div className="mt-8 text-center">
            <Link
              href="/admin"
              className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              Open Detailed Proposal Manager
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

export default async function AdminProposals() {
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

  return <ProposalsList proposals={proposals} />
}
