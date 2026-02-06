import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay } from '@/components/admin'
import { SponsorEmailTemplatesPageClient } from '@/components/admin/sponsor/SponsorEmailTemplatesPageClient'

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
