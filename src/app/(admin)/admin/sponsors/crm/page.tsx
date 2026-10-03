import { denyNonOrganizer } from '@/lib/authz/page-guard'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay } from '@/components/admin'
import { SponsorCRMPageClient } from '@/components/admin/sponsor-crm'
import { headers } from 'next/headers'
import { isTicketingEnabledForConference } from '@/lib/features/ticketing'

export default async function AdminSponsorsCRM() {
  const headerList = await headers()
  const domain = headerList.get('host') || 'localhost:3000'

  // The read below asks for `sponsorRegistrationLink`, a reusable Checkin
  // token that buys hidden sponsor tickets, and the whole conference reaches
  // the client component's RSC payload. The admin layout's check is only
  // presentation (see denyNonOrganizer), so this page refuses for itself
  // BEFORE the read, like the settings and discount pages.
  const denied = await denyNonOrganizer()
  if (denied) return denied

  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({
      sponsors: true,
      sponsorTiers: true,
      organizers: true,
      // Organizer-only page: the Send modal exposes the link to templates as
      // `SPONSOR_REGISTRATION_URL` (#1261), so the composer and the server
      // must see the same value.
      includeSponsorRegistrationLink: true,
    })

  if (conferenceError || !conference) {
    return (
      <ErrorDisplay
        title="Conference Not Found"
        message={conferenceError?.message || 'Could not load conference data'}
      />
    )
  }

  // The discount kind needs ticketing switched on for the org (a deny is a
  // kill switch, #850) AND a Checkin event to read codes from; otherwise the
  // kind is hidden rather than offered and refused (#1262).
  const canSendDiscountCodes =
    !!conference.checkinEventId &&
    (await isTicketingEnabledForConference(conference))

  return (
    <SponsorCRMPageClient
      conference={conference}
      domain={domain}
      canSendDiscountCodes={canSendDiscountCodes}
    />
  )
}
