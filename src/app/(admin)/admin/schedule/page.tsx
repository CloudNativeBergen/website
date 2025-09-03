import { CalendarIcon } from '@heroicons/react/24/outline'
import { ScheduleEditor } from '@/components/admin/schedule/ScheduleEditor'
import { getScheduleData } from '@/lib/schedule/server'

export const dynamic = 'force-dynamic'

export default async function AdminSchedule() {
  const { schedules, conference, proposals, error } = await getScheduleData()

  if (error) {
    return (
      <div className="mx-auto h-full max-w-7xl">
        <div className="border-b border-gray-200 pb-5 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <CalendarIcon className="h-8 w-8 text-gray-400 dark:text-gray-500" />
            <div>
              <h1 className="text-2xl leading-7 font-bold text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight dark:text-white">
                Schedule Management
              </h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Create and manage the conference schedule
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
            <p className="text-red-800 dark:text-red-300">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="-mx-2 -my-8 sm:-mx-4 lg:-mx-8">
      <ScheduleEditor
        initialSchedules={schedules}
        conference={conference}
        initialProposals={proposals}
      />
    </div>
  )
}
