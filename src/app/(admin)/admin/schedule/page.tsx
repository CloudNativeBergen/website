import { CalendarIcon } from '@heroicons/react/24/outline'
import { ScheduleEditor } from '@/components/schedule/ScheduleEditor'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getProposals } from '@/lib/proposal/sanity'
import { Status } from '@/lib/proposal/types'

export default async function AdminSchedule() {
  // Fetch conference with schedule first
  const { conference, error: conferenceError } = await getConferenceForCurrentDomain({ 
    schedule: true 
  })

  if (conferenceError) {
    return (
      <div className="mx-auto h-full max-w-7xl">
        <div className="border-b border-gray-200 pb-5">
          <div className="flex items-center gap-3">
            <CalendarIcon className="h-8 w-8 text-gray-400" />
            <div>
              <h1 className="text-2xl leading-7 font-bold text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
                Schedule Management
              </h1>
              <p className="mt-2 text-sm text-gray-600">
                Create and manage the conference schedule
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-red-800">
              {conferenceError.message}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Fetch confirmed proposals for this conference
  const { proposals, proposalsError } = await getProposals({ 
    conferenceId: conference._id,
    returnAll: true 
  })

  // Filter confirmed proposals
  const confirmedProposals = proposals.filter(
    proposal => proposal.status === Status.confirmed
  )

  // Extract schedule from conference
  const schedule = conference.schedules?.[0] || null

  if (proposalsError) {
    return (
      <div className="mx-auto h-full max-w-7xl">
        <div className="border-b border-gray-200 pb-5">
          <div className="flex items-center gap-3">
            <CalendarIcon className="h-8 w-8 text-gray-400" />
            <div>
              <h1 className="text-2xl leading-7 font-bold text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
                Schedule Management
              </h1>
              <p className="mt-2 text-sm text-gray-600">
                Create and manage the conference schedule
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-red-800">
              {proposalsError.message}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <ScheduleEditor
        initialSchedule={schedule}
        initialProposals={confirmedProposals}
      />
    </div>
  )
}
