import type { Metadata } from 'next'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid'
import Link from 'next/link'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function InvitationSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; title?: string; test?: string }>
}) {
  const params = await searchParams
  const action = params.action || 'accepted'
  const proposalTitle = params.title || 'the proposal'
  const isAccepted = action === 'accepted'
  const isTestMode =
    process.env.NODE_ENV === 'development' && params.test === 'true'

  return (
    <div className="flex min-h-screen flex-col bg-brand-sky-mist">
      {isTestMode && (
        <div className="border-b border-yellow-200 bg-yellow-50 p-4">
          <div className="mx-auto max-w-4xl">
            <p className="font-semibold text-yellow-800">
              ⚠️ Test Mode Active - This was a test invitation response
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md">
          <div className="rounded-lg bg-white p-8 shadow">
            <div className="text-center">
              {isAccepted ? (
                <CheckCircleIcon className="mx-auto h-16 w-16 text-green-600" />
              ) : (
                <XCircleIcon className="mx-auto h-16 w-16 text-brand-cloud-blue-hover" />
              )}

              <h1 className="mt-4 text-2xl font-bold text-brand-cloud-blue-hover">
                {isAccepted ? 'Invitation Accepted!' : 'Invitation Declined'}
              </h1>

              <p className="mt-2 text-brand-cloud-blue-hover">
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
                <p className="mt-4 text-sm text-brand-cloud-blue-hover">
                  You&apos;ll receive a confirmation email shortly. The primary
                  speaker will be notified of your decision.
                </p>
              )}

              <div className="mt-8 space-y-3">
                {isAccepted && (
                  <Link
                    href="/cfp/list"
                    className="block w-full rounded-md bg-brand-cloud-blue px-4 py-2 text-white hover:bg-brand-cloud-blue-hover focus:ring-2 focus:ring-brand-cloud-blue focus:ring-offset-2 focus:outline-none"
                  >
                    Go to Speaker Dashboard
                  </Link>
                )}

                <Link
                  href="/"
                  className={`block w-full rounded-md px-4 py-2 ${
                    isAccepted
                      ? 'bg-brand-sky-mist text-brand-cloud-blue-hover hover:bg-brand-sky-mist/80'
                      : 'bg-brand-cloud-blue text-white hover:bg-brand-cloud-blue-hover'
                  } focus:ring-2 focus:ring-brand-cloud-blue focus:ring-offset-2 focus:outline-none`}
                >
                  Return to Home
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
