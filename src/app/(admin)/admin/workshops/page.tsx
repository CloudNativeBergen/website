import { notFound } from 'next/navigation'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay } from '@/components/admin'
import { WorkshopsClientPage } from '@/components/admin/workshop/WorkshopsClientPage'
import { getWorkshopsByConference } from '@/lib/workshop/sanity'
import { isWorkshopsEnabledForConference } from '@/lib/features/workshops'
import { workshopPortalUrl } from '@/lib/workshop/sign-in'

export default async function WorkshopAdminPage() {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({})

  // FEATURE GATE (#689): organizers of a tenant without the workshop feature
  // get no workshop management surface — the nav entry is hidden (see the
  // admin registry's `feature` field) and the page itself 404s. Fail-closed.
  if (!(await isWorkshopsEnabledForConference(conference))) {
    notFound()
  }

  if (conferenceError) {
    return (
      <ErrorDisplay
        title="Error Loading Conference"
        message={conferenceError.message}
      />
    )
  }

  const workshops = await getWorkshopsByConference(conference._id)
  // The resend action is only offered once the portal link works (#1298).
  const portalAvailable = (await workshopPortalUrl(conference)) !== null

  return (
    <WorkshopsClientPage
      conferenceId={conference._id}
      initialWorkshops={workshops}
      workshopRegistrationStart={
        conference.workshopRegistrationStart ?? undefined
      }
      workshopRegistrationEnd={conference.workshopRegistrationEnd ?? undefined}
      portalAvailable={portalAvailable}
    />
  )
}
