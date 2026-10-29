import { SPONSOR_PAGE_TITLES } from '@/lib/sponsor-crm/labels'
import { ErrorDisplay } from '@/components/admin'
import { SponsorInvoicesPageClient } from '@/components/admin/sponsor/SponsorInvoicesPageClient'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export const metadata = { title: SPONSOR_PAGE_TITLES.invoices }

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
