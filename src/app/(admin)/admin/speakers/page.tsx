import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getSpeakers } from '@/lib/speaker/sanity'
import { Status } from '@/lib/proposal/types'
import { ErrorDisplay, SpeakerTable } from '@/components/admin'
import { UserGroupIcon } from '@heroicons/react/24/outline'

export default async function AdminSpeakers() {
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

  const { speakers, err: speakersError } = await getSpeakers(
    conference._id,
    [Status.accepted, Status.confirmed]
  )

  if (speakersError) {
    return (
      <ErrorDisplay
        title="Error Loading Speakers"
        message={speakersError.message}
      />
    )
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="border-b border-gray-200 pb-5">
        <div className="flex items-center gap-3">
          <UserGroupIcon className="h-8 w-8 text-gray-400" />
          <div>
            <h1 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
              Speaker Management
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Manage speakers with accepted or confirmed talks for {conference.title}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-green-100"></div>
            <span>{speakers.filter(s => s.proposals.some(p => p.status === 'confirmed')).length} with confirmed talks</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-blue-100"></div>
            <span>{speakers.filter(s => s.proposals.some(p => p.status === 'accepted')).length} with accepted talks</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-gray-200"></div>
            <span>{speakers.length} total speakers</span>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <SpeakerTable speakers={speakers} />
      </div>
    </div>
  )
}
