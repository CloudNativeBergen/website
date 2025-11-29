import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay, AdminPageHeader } from '@/components/admin'
import { SponsorDashboardMetrics } from '@/components/admin/sponsor/SponsorDashboardMetrics'
import { SponsorActionItems } from '@/components/admin/sponsor/SponsorActionItems'
import { SponsorActivityTimeline } from '@/components/admin/sponsor/SponsorActivityTimeline'
import Link from 'next/link'
import {
  RectangleStackIcon,
  ClipboardDocumentListIcon,
  ChartBarIcon,
  BuildingOffice2Icon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'

export default async function AdminSponsors() {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({})

  if (conferenceError) {
    return (
      <ErrorDisplay
        title="Error Loading Conference"
        message={conferenceError.message}
      />
    )
  }

  if (!conference) {
    return (
      <ErrorDisplay
        title="No Conference Found"
        message="No conference found for current domain"
      />
    )
  }

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageHeader
        icon={<BuildingOffice2Icon />}
        title="Sponsor Management"
        description="Manage sponsorships, track revenue, and monitor pipeline health for"
        contextHighlight={conference.title}
        stats={[]}
      />

      <SponsorDashboardMetrics conferenceId={conference._id} />

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <SponsorActionItems conferenceId={conference._id} />
        <SponsorActivityTimeline conferenceId={conference._id} />
      </div>

      <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Quick Navigation
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/admin/sponsors/crm"
            className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
          >
            <div className="rounded-full bg-indigo-100 p-3 dark:bg-indigo-900/20">
              <RectangleStackIcon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-white">
                Sponsor CRM
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Manage pipeline
              </p>
            </div>
          </Link>

          <Link
            href="/admin/sponsors/tiers"
            className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
          >
            <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/20">
              <ChartBarIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-white">
                Sponsor Tiers
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Configure tiers
              </p>
            </div>
          </Link>

          <Link
            href="/admin/sponsors/contacts"
            className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
          >
            <div className="rounded-full bg-blue-100 p-3 dark:bg-blue-900/20">
              <UserGroupIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-white">
                Sponsor Contacts
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Manage contacts
              </p>
            </div>
          </Link>

          <Link
            href="/admin/sponsors/activity"
            className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
          >
            <div className="rounded-full bg-purple-100 p-3 dark:bg-purple-900/20">
              <ClipboardDocumentListIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-white">
                Activity Log
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Full history
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
