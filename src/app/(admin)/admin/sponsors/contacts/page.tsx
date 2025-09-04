import {
  ErrorDisplay,
  SponsorContactTable,
  SponsorContactActions,
} from '@/components/admin'
import { UserGroupIcon } from '@heroicons/react/24/outline'
import { SponsorWithContactInfo } from '@/lib/sponsor/types'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getSponsorsForConference } from '@/lib/sponsor/sanity'

export default async function AdminSponsorContacts() {
  try {
    // Get conference
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
