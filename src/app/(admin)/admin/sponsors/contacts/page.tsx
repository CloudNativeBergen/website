import {
  ErrorDisplay,
  AdminPageHeader,
  SponsorContactTable,
  SponsorContactActions,
} from '@/components/admin'
import { UserGroupIcon, BuildingOffice2Icon } from '@heroicons/react/24/outline'
import {
  SponsorWithContactInfo,
  ConferenceSponsorWithContact,
} from '@/lib/sponsor/types'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import Link from 'next/link'

export default async function AdminSponsorContacts() {
  try {
    const { conference, error: conferenceError } =
      await getConferenceForCurrentDomain({
        sponsors: true,
        sponsorContact: true,
      })

    if (conferenceError || !conference || !conference.sponsors) {
      return (
        <ErrorDisplay
          title="Conference Not Found"
          message={conferenceError?.message || 'Could not load conference data'}
        />
      )
    }

    const sponsorsWithContacts = (
      conference.sponsors as ConferenceSponsorWithContact[]
    ).map(
      (conferenceSponsor): SponsorWithContactInfo => ({
        _id: conferenceSponsor.sponsor._id,
        _createdAt: '',
        _updatedAt: '',
        name: conferenceSponsor.sponsor.name,
        website: conferenceSponsor.sponsor.website,
        logo: conferenceSponsor.sponsor.logo,
        org_number: conferenceSponsor.sponsor.org_number,
        contact_persons: conferenceSponsor.sponsor.contact_persons,
        billing: conferenceSponsor.sponsor.billing,
      }),
    )

    const sponsorsWithContactPersons = sponsorsWithContacts.filter(
      (sponsor) =>
        Array.isArray(sponsor.contact_persons) &&
        sponsor.contact_persons.length > 0,
    )

    const sponsorsWithBillingInfo = sponsorsWithContacts.filter(
      (sponsor) => sponsor.billing && sponsor.billing.email,
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
              value: sponsorsWithContacts.length,
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
              fromEmail={`Cloud Native Bergen <${conference.contact_email}>`}
              conference={conference}
            />
          }
          backLink={{ href: '/admin/sponsors', label: 'Back to Dashboard' }}
        />{' '}
        <div className="mt-8">
          <SponsorContactTable sponsors={sponsorsWithContacts} />
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
                <BuildingOffice2Icon className="h-6 w-6 text-green-600 dark:text-green-400" />
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
