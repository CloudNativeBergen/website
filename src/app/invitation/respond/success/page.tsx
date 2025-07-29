import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid'
import Link from 'next/link'

export default async function InvitationSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; title?: string }>
}) {
  const params = await searchParams
  const action = params.action || 'accepted'
  const proposalTitle = params.title || 'the proposal'
  const isAccepted = action === 'accepted'

  return (
    <div className="bg-sky-mist flex min-h-screen items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="rounded-lg bg-white p-8 shadow">
          <div className="text-center">
            {isAccepted ? (
              <CheckCircleIcon className="text-fresh-green mx-auto h-16 w-16" />
            ) : (
              <XCircleIcon className="text-cloud-blue-dark mx-auto h-16 w-16" />
            )}

            <h1 className="text-cloud-blue-darker mt-4 text-2xl font-bold">
              {isAccepted ? 'Invitation Accepted!' : 'Invitation Declined'}
            </h1>

            <p className="text-cloud-blue-dark mt-2">
              {isAccepted ? (
                <>
                  You have successfully accepted the invitation to be a
                  co-speaker for{' '}
                  <span className="font-medium">
                    &quot;{proposalTitle}&quot;
                  </span>
                  .
                </>
              ) : (
                <>
                  You have declined the invitation to be a co-speaker for{' '}
                  <span className="font-medium">
                    &quot;{proposalTitle}&quot;
                  </span>
                  .
                </>
              )}
            </p>

            {isAccepted && (
              <p className="text-cloud-blue-dark mt-4 text-sm">
                You&apos;ll receive a confirmation email shortly. The primary
                speaker will be notified of your decision.
              </p>
            )}

            <div className="mt-8 space-y-3">
              {isAccepted && (
                <Link
                  href="/speaker-dashboard"
                  className="bg-cloud-blue hover:bg-cloud-blue-dark focus:ring-cloud-blue block w-full rounded-md px-4 py-2 text-white focus:ring-2 focus:ring-offset-2 focus:outline-none"
                >
                  Go to Speaker Dashboard
                </Link>
              )}

              <Link
                href="/"
                className={`block w-full rounded-md px-4 py-2 ${
                  isAccepted
                    ? 'bg-sky-mist text-cloud-blue-dark hover:bg-sky-mist/80'
                    : 'bg-cloud-blue hover:bg-cloud-blue-dark text-white'
                } focus:ring-cloud-blue focus:ring-2 focus:ring-offset-2 focus:outline-none`}
              >
                Return to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
