'use client'

import {
  DocumentPlusIcon,
  CalendarIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import Link from 'next/link'

interface DashboardSidebarProps {
  upcomingConferencesCount: number
  totalProposals: number
}

export function DashboardSidebar({
  upcomingConferencesCount,
  totalProposals,
}: DashboardSidebarProps) {
  return (
    <>
      {/* Quick Stats */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-space-grotesk mb-3 text-sm font-bold text-gray-900 dark:text-white">
          Quick Stats
        </h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <CalendarIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Upcoming Events
              </p>
              <p className="font-space-grotesk text-lg font-bold text-gray-900 dark:text-white">
                {upcomingConferencesCount}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
              <DocumentPlusIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Total Proposals
              </p>
              <p className="font-space-grotesk text-lg font-bold text-gray-900 dark:text-white">
                {totalProposals}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-space-grotesk mb-3 text-sm font-bold text-gray-900 dark:text-white">
          Quick Actions
        </h3>
        <div className="space-y-2">
          <Link
            href="/cfp/proposal"
            className="flex items-center gap-2 rounded-md bg-brand-cloud-blue px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-cloud-blue/90 dark:bg-blue-600 dark:hover:bg-blue-700"
          >
            <DocumentPlusIcon className="h-4 w-4" />
            New Proposal
          </Link>
          <Link
            href="/speaker"
            className="flex items-center gap-2 rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            <UserGroupIcon className="h-4 w-4" />
            View All Speakers
          </Link>
        </div>
      </div>
    </>
  )
}
