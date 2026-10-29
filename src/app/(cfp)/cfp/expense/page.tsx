import { connection } from 'next/server'
import { getAuthSession } from '@/lib/auth'
import { notFound, redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { TravelSupportPageClient } from '@/components/travel-support/TravelSupportPageClient'
import { Flags } from '@/lib/speaker/types'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { AppEnvironment } from '@/lib/environment/config'
import {
  getTravelSupport,
  resolveTravelSupportConferenceId,
} from '@/lib/travel-support/sanity'
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

export default async function TravelExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ conferenceId?: string | string[] }>
}) {
  await connection()

  const headersList = await headers()
  const fullUrl = headersList.get('x-url') || ''
  const session = await getAuthSession({ url: fullUrl })

  if (!session?.speaker) {
    // Keep `?conferenceId=` so the speaker lands on the edition they asked
    // for. The path stays relative, so the callback cannot leave the site.
    const { conferenceId } = await searchParams
    const query = new URLSearchParams(
      [conferenceId ?? []].flat().map((id) => ['conferenceId', id]),
    ).toString()
    const callbackUrl = encodeURIComponent(
      query ? `/cfp/expense?${query}` : '/cfp/expense',
    )
    return redirect(`/api/auth/signin?callbackUrl=${callbackUrl}`)
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

  // The dashboard links here per conference card. Honour that conference only
  // when it is in this domain's org and the speaker has a talk there.
  const { conferenceId: requested } = await searchParams
  const conferenceId = await resolveTravelSupportConferenceId(
    session.speaker._id,
    conference,
    typeof requested === 'string' ? requested : undefined,
  )
  if (!conferenceId) {
    return notFound()
  }

  const { travelSupport } = await getTravelSupport(
    session.speaker._id,
    conferenceId,
  )

  return (
    <TravelSupportPageClient
      initialTravelSupport={travelSupport}
      speakerId={session.speaker._id}
      conferenceId={conferenceId === conference._id ? undefined : conferenceId}
    />
  )
}
