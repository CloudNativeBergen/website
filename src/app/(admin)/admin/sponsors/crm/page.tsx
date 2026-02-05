import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay } from '@/components/admin'
import { SponsorCRMPageClient } from '@/components/admin/sponsor-crm'
import { headers } from 'next/headers'

export default async function AdminSponsorsCRM() {
  const headerList = await headers()
  const domain = headerList.get('host') || 'localhost:3000'

  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({
      sponsors: true,
      sponsorContact: true,
      sponsorTiers: true,
      organizers: true,
    })

  if (conferenceError || !conference) {
    return (
      <ErrorDisplay
        title="Conference Not Found"
        message={conferenceError?.message || 'Could not load conference data'}
      />
    )
  }

  return <SponsorCRMPageClient conference={conference} domain={domain} />
}
