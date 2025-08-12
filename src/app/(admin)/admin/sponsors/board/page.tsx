import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ConferenceSponsorDetailed } from '@/lib/sponsor/types'
import { ErrorDisplay, SponsorBoard } from '@/components/admin'
import { Squares2X2Icon, ArrowLeftIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'

export default async function AdminSponsorBoard() {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({
      sponsors: true,
      sponsorContact: true,
      sponsorTiers: true,
    })

  if (conferenceError) {
    return (
      <ErrorDisplay
        title="Error Loading Conference"
        message={conferenceError.message}
      />
    )
  }

  const sponsors: ConferenceSponsorDetailed[] = conference?.sponsors || []

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header with Breadcrumb */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex items-center space-x-2">
            <Link
              href="/admin/sponsors"
              className="flex items-center text-sm text-gray-500 hover:text-gray-700"
            >
              <ArrowLeftIcon className="mr-2 h-4 w-4" />
              Back to Sponsors
            </Link>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          <Squares2X2Icon className="h-8 w-8 text-gray-400" />
          <div className="flex-1">
            <h1 className="text-xl leading-7 font-bold text-gray-900 sm:text-2xl sm:tracking-tight lg:truncate lg:text-3xl">
              Sponsor Pipeline Board
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Visual kanban-style board for managing sponsor pipeline and status
              transitions for {conference.title}
            </p>
          </div>
        </div>
      </div>

      {sponsors.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="text-center">
            <Squares2X2Icon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">
              No Sponsors Found
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              Add sponsors to the conference to start managing them with the
              pipeline board.
            </p>
            <div className="mt-6">
              <Link
                href="/admin/sponsors"
                className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
              >
                <ArrowLeftIcon className="mr-2 h-4 w-4" />
                Go to Sponsor Management
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 px-6 py-4 overflow-hidden">
          <SponsorBoard
            sponsors={sponsors}
            conference={conference}
          />
        </div>
      )}
    </div>
  )
}
