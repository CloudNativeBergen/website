'use client'

import { DocumentPlusIcon, UserGroupIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'

export function DashboardSidebar() {
  return (
    <>
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
