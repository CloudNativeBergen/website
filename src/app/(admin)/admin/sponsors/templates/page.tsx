import { SPONSOR_PAGE_TITLES } from '@/lib/sponsor-crm/labels'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay } from '@/components/admin'
import { SponsorEmailTemplatesPageClient } from '@/components/admin/sponsor/SponsorEmailTemplatesPageClient'

export const metadata = { title: SPONSOR_PAGE_TITLES.templates }

export default async function AdminSponsorTemplates() {
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

  return <SponsorEmailTemplatesPageClient conference={conference} />
}
