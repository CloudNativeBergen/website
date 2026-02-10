import { notFound } from 'next/navigation'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { DashboardDemoClient } from './DashboardDemoClient'

export default async function DashboardDemoPage() {
  if (process.env.NODE_ENV !== 'development') {
    notFound()
  }

  const { conference, error } = await getConferenceForCurrentDomain({})

  if (error || !conference) {
    return (
      <div className="flex min-h-96 items-center justify-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Could not load conference data.
        </p>
      </div>
    )
  }

  return <DashboardDemoClient conference={conference} />
}
