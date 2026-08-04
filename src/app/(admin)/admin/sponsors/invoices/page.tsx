import { ErrorDisplay } from '@/components/admin'
import { SponsorInvoicesPageClient } from '@/components/admin/sponsor/SponsorInvoicesPageClient'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export default async function AdminSponsorInvoices() {
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

  return <SponsorInvoicesPageClient conference={conference} />
}
