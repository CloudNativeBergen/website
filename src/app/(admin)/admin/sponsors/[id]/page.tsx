import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { denyNonOrganizer } from '@/lib/authz/page-guard'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getSponsorOverview } from '@/lib/sponsor-crm/sanity'
import { isTicketingEnabledForConference } from '@/lib/features/ticketing'
import { isWorkshopsEnabledForConference } from '@/lib/features/workshops'
import { ErrorDisplay } from '@/components/admin'
import { SponsorDashboardClient } from './SponsorDashboardClient'

const VIEWS = [
  'pipeline',
  'contacts',
  'logo',
  'history',
  'contract',
  'communications',
  'messages',
] as const
type View = (typeof VIEWS)[number]

export default async function SponsorDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ view?: string; board?: string }>
}) {
  // Same guard as the CRM board: the conference read below carries the
  // sponsor registration link, which must not reach a non-organizer.
  const denied = await denyNonOrganizer()
  if (denied) return denied

  const { id } = await params
  const { view, board } = await searchParams
  const domain = (await headers()).get('host') || 'localhost:3000'

  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({
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

  // Scoped to this conference: another tenant's id is simply not found.
  const { data: initialOverview } = await getSponsorOverview(id, conference._id)
  if (!initialOverview) notFound()

  const canSendDiscountCodes =
    !!conference.checkinEventId &&
    (await isTicketingEnabledForConference(conference))

  return (
    <SponsorDashboardClient
      sponsorId={id}
      conference={conference}
      domain={domain}
      canSendDiscountCodes={canSendDiscountCodes}
      workshopsEnabled={await isWorkshopsEnabledForConference(conference)}
      initialOverview={initialOverview}
      // Back to the board the sponsor was opened from (the invoice board).
      backHref={
        board === 'invoice'
          ? '/admin/sponsors/crm?board=invoice'
          : '/admin/sponsors/crm'
      }
      initialView={VIEWS.includes(view as View) ? (view as View) : undefined}
    />
  )
}
