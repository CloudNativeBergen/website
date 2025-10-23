import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay } from '@/components/admin'
import { WorkshopsClientPage } from '@/components/admin/workshop/WorkshopsClientPage'
import { getWorkshopsByConference } from '@/lib/workshop/sanity'

export default async function WorkshopAdminPage() {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({ revalidate: 0 })

  if (conferenceError) {
    return (
      <ErrorDisplay
        title="Error Loading Conference"
        message={conferenceError.message}
      />
    )
  }

  try {
    const workshops = await getWorkshopsByConference(conference._id)

    return (
      <WorkshopsClientPage
        conferenceId={conference._id}
        initialWorkshops={workshops}
      />
    )
  } catch (error) {
    return (
      <ErrorDisplay
        title="Error Loading Workshops"
        message={error instanceof Error ? error.message : 'Unknown error'}
      />
    )
  }
}
