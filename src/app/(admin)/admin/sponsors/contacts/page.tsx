import {
  ErrorDisplay,
  SponsorContactTable,
  SponsorContactActions,
} from '@/components/admin'
import { UserGroupIcon } from '@heroicons/react/24/outline'
import { SponsorWithContactInfo } from '@/lib/sponsor/types'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getAllSponsors } from '@/lib/sponsor/sanity'

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

    // Get all sponsors with contact information
    const { sponsors, error: sponsorsError } = await getAllSponsors(true)

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
        <div className="border-b border-brand-frosted-steel pb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <UserGroupIcon className="h-8 w-8 text-brand-cloud-blue" />
              <div>
                <h1 className="font-space-grotesk text-2xl leading-7 font-bold text-brand-slate-gray sm:truncate sm:text-3xl sm:tracking-tight">
                  Sponsor Contacts
                </h1>
                <p className="font-inter mt-2 text-sm text-brand-slate-gray/70">
                  Manage sponsor contact information and billing details for{' '}
                  <span className="font-medium text-brand-cloud-blue">
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

          <div className="font-inter mt-4 flex items-center gap-4 text-sm text-brand-slate-gray">
            <span>
              Total sponsors: <strong>{sponsorsWithContacts.length}</strong>
            </span>
            <span>
              With contact information:{' '}
              <strong>{sponsorsWithContactInfo.length}</strong>
            </span>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-brand-fresh-green"></div>
              <span>
                {sponsorsWithBillingInfo.length} with billing information
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-brand-cloud-blue"></div>
              <span>{sponsorsWithContactInfo.length} with contact persons</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-brand-frosted-steel"></div>
              <span>{sponsorsWithContacts.length} total sponsors</span>
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
