import { CalendarIcon } from '@heroicons/react/24/outline'

export default function AdminSchedule() {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="border-b border-gray-200 pb-5">
        <div className="flex items-center gap-3">
          <CalendarIcon className="h-8 w-8 text-gray-400" />
          <div>
            <h1 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
              Schedule Management
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Create and manage the conference schedule
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <div className="rounded-lg bg-gray-50 p-6 text-center">
          <p className="text-gray-500">Schedule management coming soon...</p>
        </div>
      </div>
    </div>
  )
}
