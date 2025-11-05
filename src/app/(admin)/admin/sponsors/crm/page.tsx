import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay, AdminPageHeader } from '@/components/admin'
import { SponsorCRMClient } from './SponsorCRMClient'
import { BuildingOffice2Icon } from '@heroicons/react/24/outline'

export default async function AdminSponsorsCRM() {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({
      revalidate: 0,
    })

  if (conferenceError || !conference) {
    return (
      <ErrorDisplay
        title="Conference Not Found"
        message={conferenceError?.message || 'Could not load conference data'}
      />
    )
  }

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageHeader
        icon={<BuildingOffice2Icon />}
        title="Sponsor Pipeline"
        description="Manage sponsor relationships and track deals for"
        contextHighlight={conference.title}
        stats={[]}
        backLink={{ href: '/admin/sponsors', label: 'Back to Dashboard' }}
      />

      <SponsorCRMClient conferenceId={conference._id} />
    </div>
  )
}
