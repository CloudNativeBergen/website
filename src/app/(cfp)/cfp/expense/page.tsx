import { getAuthSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { TravelSupportPage } from '@/components/travel-support/TravelSupportPage'
import { Flags } from '@/lib/speaker/types'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { AppEnvironment } from '@/lib/environment/config'

function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-red-500 dark:text-red-400">{message}</p>
    </div>
  )
}

function NotEligibleDisplay() {
  return (
    <div className="mx-auto max-w-2xl lg:max-w-6xl lg:px-12">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-6 dark:border-blue-800/50 dark:bg-blue-900/20">
        <div className="flex">
          <div className="flex-shrink-0">
            <ExclamationTriangleIcon
              className="h-6 w-6 text-blue-500 dark:text-blue-400"
              aria-hidden="true"
            />
          </div>
          <div className="ml-3">
            <h3 className="text-lg font-medium text-blue-900 dark:text-blue-200">
              Travel Support Currently Unavailable
            </h3>
            <div className="mt-3 text-blue-800 dark:text-blue-300">
              <p className="mb-3">
                Travel support is available for speakers who indicated they need
                funding assistance during proposal submission.
              </p>
              <p className="text-sm">
                Got questions? Feel free to reach out to our friendly organizing
                team - we&apos;re always happy to help!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default async function TravelExpensePage() {
  const session = await getAuthSession()
  if (!session?.speaker) {
    return redirect('/api/auth/signin?callbackUrl=/cfp/expense')
  }

  // Check if speaker is eligible for travel funding
  const isEligibleForTravelSupport =
    AppEnvironment.isTestMode ||
    session.speaker.flags?.includes(Flags.requiresTravelFunding)

  if (!isEligibleForTravelSupport) {
    return (
      <>
        <div className="mx-auto max-w-2xl lg:max-w-6xl lg:px-12">
          <h1 className="font-jetbrains text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl dark:text-blue-400">
            Travel Support
          </h1>
          <div className="font-inter mt-6 space-y-4 text-xl tracking-normal text-gray-700 dark:text-gray-300">
            <p>
              We&apos;re here to help make your conference journey possible.
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-2xl lg:max-w-6xl lg:px-12">
          <div className="mt-12">
            <NotEligibleDisplay />
          </div>
        </div>
      </>
    )
  }

  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain()

  if (conferenceError || !conference) {
    console.error('Error loading conference:', conferenceError)
    return <ErrorDisplay message="Error loading conference" />
  }

  return (
    <>
      <div className="mx-auto max-w-2xl lg:max-w-6xl lg:px-12">
        <h1 className="font-jetbrains text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl dark:text-blue-400">
          Travel Support
        </h1>
        <div className="font-inter mt-6 space-y-4 text-xl tracking-normal text-gray-700 dark:text-gray-300">
          <p>We&apos;re here to help make your conference journey possible.</p>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Submit your travel expenses and banking details so we can support
            your attendance.
          </p>
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-2xl lg:max-w-6xl lg:px-12">
        <div className="mt-12">
          <TravelSupportPage />
        </div>
      </div>
    </>
  )
}
