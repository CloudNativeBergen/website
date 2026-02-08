import { getAuthSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { TravelSupportPageClient } from '@/components/travel-support/TravelSupportPageClient'
import { Flags } from '@/lib/speaker/types'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { AppEnvironment } from '@/lib/environment/config'
import { getTravelSupport } from '@/lib/travel-support/sanity'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

function NotEligibleDisplay() {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-6 dark:border-blue-800/50 dark:bg-blue-900/20">
      <div className="flex">
        <div className="shrink-0">
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
  )
}

export default async function TravelExpensePage() {
  const headersList = await headers()
  const fullUrl = headersList.get('x-url') || ''
  const session = await getAuthSession({ url: fullUrl })

  if (!session?.speaker) {
    return redirect('/api/auth/signin?callbackUrl=/speaker/expense')
  }

  const isEligibleForTravelSupport =
    AppEnvironment.isTestMode ||
    session.speaker.flags?.includes(Flags.requiresTravelFunding)

  if (!isEligibleForTravelSupport) {
    return <NotEligibleDisplay />
  }

  // Fetch travel support data server-side
  const { conference } = await getConferenceForCurrentDomain()
  if (!conference) {
    throw new Error('Conference not found')
  }

  const { travelSupport } = await getTravelSupport(
    session.speaker._id,
    conference._id,
  )

  return (
    <TravelSupportPageClient
      initialTravelSupport={travelSupport}
      speakerId={session.speaker._id}
    />
  )
}
