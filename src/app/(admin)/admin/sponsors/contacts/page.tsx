import {
  ErrorDisplay,
  SponsorContactTable,
  SponsorContactActions,
} from '@/components/admin'
import {
  UserGroupIcon,
  BuildingOffice2Icon,
  HomeIcon,
} from '@heroicons/react/24/outline'
import { SponsorWithContactInfo } from '@/lib/sponsor/types'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getSponsorsForConference } from '@/lib/sponsor/sanity'
import Link from 'next/link'

export default async function AdminSponsorContacts() {
  try {
    // Get conference
    const { conference, error: conferenceError } =
      await getConferenceForCurrentDomain({ revalidate: 0 })

    if (conferenceError || !conference) {
      return (
        <ErrorDisplay
          title="Conference Not Found"
          message={conferenceError?.message || 'Could not load conference data'}
        />
      )
    }

    // Get sponsors for the current conference only
    const { sponsors, error: sponsorsError } = await getSponsorsForConference(
      conference._id,
      true,
    )

    if (sponsorsError) {
      return (
        <ErrorDisplay
          title="Error Loading Sponsors"
          message={sponsorsError.message}
        />
      )
    }

    const sponsorsWithContacts = sponsors as SponsorWithContactInfo[]

    // Filter sponsors with contact information
    const sponsorsWithContactInfo = sponsorsWithContacts.filter(
      (sponsor) =>
        sponsor.contact_persons && sponsor.contact_persons.length > 0,
    )

    // Count sponsors with billing info
    const sponsorsWithBillingInfo = sponsorsWithContacts.filter(
      (sponsor) => sponsor.billing && sponsor.billing.email,
    )

    return (
      <div className="mx-auto max-w-7xl">
        <div className="border-b border-brand-frosted-steel pb-6 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <UserGroupIcon className="h-8 w-8 text-brand-cloud-blue dark:text-indigo-400" />
              <div>
                <h1 className="font-space-grotesk text-2xl leading-7 font-bold text-brand-slate-gray sm:truncate sm:text-3xl sm:tracking-tight dark:text-white">
                  Sponsor Contacts
                </h1>
                <p className="font-inter mt-2 text-sm text-brand-slate-gray/70 dark:text-gray-400">
                  Manage sponsor contact information and billing details for
                  active sponsors of{' '}
                  <span className="font-medium text-brand-cloud-blue dark:text-indigo-400">
                    {conference.title}
                  </span>
                  .
                </p>
              </div>
            </div>

            <SponsorContactActions
              sponsorsWithContactsCount={sponsorsWithContactInfo.length}
              fromEmail={`Cloud Native Bergen <${conference.contact_email}>`}
              conference={conference}
            />
          </div>

          <div className="font-inter mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-brand-slate-gray dark:text-gray-400">
            <span>
              Active sponsors: <strong>{sponsorsWithContacts.length}</strong>
            </span>
            <span>
              With contact information:{' '}
              <strong>{sponsorsWithContactInfo.length}</strong>
            </span>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-brand-fresh-green dark:bg-green-400"></div>
              <span>
                {sponsorsWithBillingInfo.length} with billing information
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-brand-cloud-blue dark:bg-indigo-400"></div>
              <span>{sponsorsWithContactInfo.length} with contact persons</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-brand-frosted-steel dark:bg-gray-500"></div>
              <span>{sponsorsWithContacts.length} conference sponsors</span>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <SponsorContactTable sponsors={sponsorsWithContacts} />
        </div>

        {/* Quick Actions */}
        <div className="mt-12">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            Related Actions
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href="/admin/sponsors"
              className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500"
            >
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <BuildingOffice2Icon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Sponsor Management
                  </p>
                  <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                    Manage sponsors and tiers
                  </p>
                </div>
              </div>
            </Link>

            <Link
              href="/admin/tickets/discount"
              className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500"
            >
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <svg
                    className="h-6 w-6 text-gray-400 dark:text-gray-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125V15.75a2.999 2.999 0 0 1 0-5.198V8.376c0-.621-.504-1.125-1.125-1.125H3.375Z"
                    />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Sponsor Discount Codes
                  </p>
                  <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                    Create and send discount codes to sponsors
                  </p>
                </div>
              </div>
            </Link>

            <Link
              href="/admin"
              className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500"
            >
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <HomeIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Back to Dashboard
                  </p>
                  <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                    Return to the main admin dashboard
                  </p>
                </div>
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
