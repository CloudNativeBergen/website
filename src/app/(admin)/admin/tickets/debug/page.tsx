import { Metadata } from 'next'
import TicketDataInspector from '@/components/admin/TicketDataInspector'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export const metadata: Metadata = {
  title: 'Ticket Data Debug | Admin',
  description: 'Debug and inspect ticket data from Checkin API',
}

export default async function TicketDebugPage() {
  // Fetch conference data on the server side
  const { conference, error } = await getConferenceForCurrentDomain({
    organizers: false,
  })

  if (!conference) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">
            Conference not found
          </h1>
          <p className="mt-2 text-gray-600">Unable to load conference data</p>
          {error && (
            <p className="mt-1 text-sm text-red-500">{error.message}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Ticket Data Debug
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Inspect raw data from Checkin API and transformation results
        </p>
        {error && (
          <div className="mt-2 rounded bg-red-100 p-2 text-red-700">
            Error loading conference: {error.message}
          </div>
        )}
      </div>

      <TicketDataInspector />
    </div>
  )
}
