import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay } from '@/components/admin'
import { WorkshopsClientPage } from '@/components/admin/workshop/WorkshopsClientPage'
import { getWorkshopsByConference } from '@/lib/workshop/sanity'

export default async function WorkshopAdminPage() {
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

  const workshops = await getWorkshopsByConference(conference._id)

  return (
    <WorkshopsClientPage
      conferenceId={conference._id}
      initialWorkshops={workshops}
    />
  )
}
