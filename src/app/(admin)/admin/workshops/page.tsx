import { notFound } from 'next/navigation'
import { denyNonOrganizer } from '@/lib/authz/page-guard'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay } from '@/components/admin'
import { WorkshopsClientPage } from '@/components/admin/workshop/WorkshopsClientPage'
import { getWorkshopsByConference } from '@/lib/workshop/sanity'
import { isWorkshopsEnabledForConference } from '@/lib/features/workshops'
import { workshopMainHost } from '@/lib/workshop/sign-in'
import { resendPortal } from '@/lib/workshop/resend-instructions'
import { WorkshopTickets } from '@/components/admin/workshop/tickets'

export default async function WorkshopAdminPage() {
  // GUARDED BEFORE THE READ: the read below is live on every view, and the
  // admin layout's organizer check does not stop this page from running (see
  // denyNonOrganizer). A request from someone who is not an organizer of this
  // org causes no read here.
  const denied = await denyNonOrganizer()
  if (denied) return denied

  // READ LIVE, past both cache layers (#1345): the registration card below is
  // the baseline of every save, which sends only what differs from it. The
  // cached read serves the times from before a save to the request that
  // follows it (`revalidateTag(tag, 'default')` is stale-while-revalidate),
  // so an organizer who set a time back to what a stale card showed would
  // send nothing. One live read per view of this admin page.
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({ uncached: true })

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
  // The resend action (#1298), refused for the reasons the server refuses it.
  const mainHost = workshopMainHost(conference)
  const { blocker } = await resendPortal(conference)
  const resendDisabledReason =
    blocker === 'portal-unavailable'
      ? mainHost
        ? `Available once attendees can sign in on ${mainHost}, the conference’s first domain.`
        : 'Available once the conference has a domain attendees can sign in on.'
      : blocker === 'registration-closed'
        ? 'Workshop registration has closed.'
        : null

  return (
    <WorkshopsClientPage
      conferenceId={conference._id}
      initialWorkshops={workshops}
      workshopRegistrationSponsorStart={
        conference.workshopRegistrationSponsorStart ?? undefined
      }
      workshopRegistrationStart={
        conference.workshopRegistrationStart ?? undefined
      }
      workshopRegistrationEnd={conference.workshopRegistrationEnd ?? undefined}
      resendDisabledReason={resendDisabledReason}
      ticketsSection={<WorkshopTickets conference={conference} />}
    />
  )
}
