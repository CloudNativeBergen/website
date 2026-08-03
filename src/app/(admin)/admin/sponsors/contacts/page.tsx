import { ErrorDisplay } from '@/components/admin'
import { SponsorContactsPageClient } from '@/components/admin/sponsor/SponsorContactsPageClient'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export default async function AdminSponsorContacts() {
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

  // The sponsor rows themselves are fetched client-side through
  // `sponsor.crm.list` so the filters run server-side on every change and a
  // saved edit refreshes the table it came from.
  return <SponsorContactsPageClient conference={conference} />
}
