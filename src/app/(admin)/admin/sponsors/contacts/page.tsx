import {
  ErrorDisplay,
  AdminPageHeader,
  SponsorContactTable,
  SponsorContactActions,
} from '@/components/admin'
import {
  UserGroupIcon,
  BuildingOffice2Icon,
  ChartBarIcon,
} from '@heroicons/react/24/outline'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { listSponsorsForConference } from '@/lib/sponsor-crm/sanity'
import Link from 'next/link'
import { unstable_noStore as noStore } from 'next/cache'

export default async function AdminSponsorContacts() {
  noStore()
  try {
    const { conference, error: conferenceError } =
      await getConferenceForCurrentDomain()

    if (conferenceError || !conference) {
      return (
        <ErrorDisplay
          title="Conference Not Found"
          message={conferenceError?.message || 'Could not load conference data'}
        />
      )
    }

    const { sponsors: crmSponsors, error: crmError } =
      await listSponsorsForConference(conference._id)

    if (crmError || !crmSponsors) {
      return (
        <ErrorDisplay
          title="Failed to Load Sponsors"
          message={crmError?.message || 'Could not load sponsor CRM data'}
        />
      )
    }

    const sponsorsWithContactPersons = crmSponsors.filter(
      (s: SponsorForConferenceExpanded) =>
        Array.isArray(s.contact_persons) && s.contact_persons.length > 0,
    )

    const sponsorsWithBillingInfo = crmSponsors.filter(
      (s: SponsorForConferenceExpanded) => s.billing && s.billing.email,
    )

    return (
      <div className="mx-auto max-w-7xl">
        <AdminPageHeader
          icon={<UserGroupIcon />}
          title="Sponsor Contacts"
          description="Manage sponsor contact information and billing details for"
          contextHighlight={conference.title}
          stats={[
            {
              value: crmSponsors.length,
              label: 'Active sponsors',
              color: 'slate',
            },
            {
              value: sponsorsWithContactPersons.length,
              label: 'With contacts',
              color: 'blue',
            },
            {
              value: sponsorsWithBillingInfo.length,
              label: 'With billing',
              color: 'green',
            },
          ]}
          actions={
            <SponsorContactActions
              sponsorsWithContactsCount={sponsorsWithContactPersons.length}
              fromEmail={`${conference.organizer || 'Cloud Native Days'} <${conference.sponsor_email}>`}
              conference={conference}
            />
          }
          backLink={{ href: '/admin/sponsors', label: 'Back to Dashboard' }}
        />{' '}
        <div className="mt-8">
          <SponsorContactTable sponsors={crmSponsors} />
        </div>
        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Quick Navigation
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Link
              href="/admin/sponsors"
              className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
            >
              <div className="rounded-full bg-indigo-100 p-3 dark:bg-indigo-900/20">
                <BuildingOffice2Icon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  Sponsor Dashboard
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Back to overview
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
                  Manage tiers
                </p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    )
  } catch (error) {
    console.error('Sponsor contacts page error:', error)
    return (
      <ErrorDisplay
        title="Error Loading Page"
        message="An unexpected error occurred while loading the sponsor contacts page"
      />
    )
  }
}
