'use client'

import { UserGroupIcon, AcademicCapIcon, ComputerDesktopIcon, ClockIcon } from '@heroicons/react/24/outline'

interface WorkshopStats {
  workshopId: string
  workshopTitle: string
  capacity: number
  totalSignups: number
  confirmedCount: number
  waitlistCount: number
  experienceLevels: {
    beginner: number
    intermediate: number
    advanced: number
  }
  operatingSystems: {
    windows: number
    macos: number
    linux: number
  }
}

interface WorkshopStatisticsProps {
  statistics: WorkshopStats[]
}

export function WorkshopStatistics({ statistics }: WorkshopStatisticsProps) {
  if (!statistics || statistics.length === 0) {
    return null
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
          Workshop Signups
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          View signup statistics for your workshops
        </p>
      </div>

      {statistics.map((workshop) => (
        <div
          key={workshop.workshopId}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {workshop.workshopTitle}
          </h3>

          {/* Signup Overview */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-4">
              <div className="flex items-center gap-2">
                <UserGroupIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                <span className="text-sm font-medium text-green-900 dark:text-green-100">
                  Confirmed
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold text-green-600 dark:text-green-400">
                {workshop.confirmedCount}
              </p>
              <p className="text-xs text-green-700 dark:text-green-300">
                of {workshop.capacity} capacity
              </p>
            </div>

            <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 p-4">
              <div className="flex items-center gap-2">
                <ClockIcon className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                <span className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                  Waitlist
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {workshop.waitlistCount}
              </p>
              <p className="text-xs text-yellow-700 dark:text-yellow-300">
                participants
              </p>
            </div>

            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-4">
              <div className="flex items-center gap-2">
                <UserGroupIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  Total
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-400">
                {workshop.totalSignups}
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                signups
              </p>
            </div>
          </div>

          {/* Experience Levels */}
          {workshop.confirmedCount > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <AcademicCapIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Experience Levels
                </h4>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md bg-gray-50 dark:bg-gray-700 p-3 text-center">
                  <p className="text-xs text-gray-600 dark:text-gray-400">Beginner</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {workshop.experienceLevels.beginner}
                  </p>
                </div>
                <div className="rounded-md bg-gray-50 dark:bg-gray-700 p-3 text-center">
                  <p className="text-xs text-gray-600 dark:text-gray-400">Intermediate</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {workshop.experienceLevels.intermediate}
                  </p>
                </div>
                <div className="rounded-md bg-gray-50 dark:bg-gray-700 p-3 text-center">
                  <p className="text-xs text-gray-600 dark:text-gray-400">Advanced</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {workshop.experienceLevels.advanced}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Operating Systems */}
          {workshop.confirmedCount > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ComputerDesktopIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Operating Systems
                </h4>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md bg-gray-50 dark:bg-gray-700 p-3 text-center">
                  <p className="text-xs text-gray-600 dark:text-gray-400">Windows</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {workshop.operatingSystems.windows}
                  </p>
                </div>
                <div className="rounded-md bg-gray-50 dark:bg-gray-700 p-3 text-center">
                  <p className="text-xs text-gray-600 dark:text-gray-400">macOS</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {workshop.operatingSystems.macos}
                  </p>
                </div>
                <div className="rounded-md bg-gray-50 dark:bg-gray-700 p-3 text-center">
                  <p className="text-xs text-gray-600 dark:text-gray-400">Linux</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {workshop.operatingSystems.linux}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}