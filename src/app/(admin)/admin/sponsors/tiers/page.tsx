import { SPONSOR_PAGE_TITLES } from '@/lib/sponsor-crm/labels'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ConferenceSponsor } from '@/lib/sponsor/types'
import { ErrorDisplay, SponsorTiersPageClient } from '@/components/admin'
import { sortTierNamesByValue } from '@/lib/sponsor/utils'
import { denyNonOrganizer } from '@/lib/authz/page-guard'
import { headers } from 'next/headers'
import { isTicketingEnabledForConference } from '@/lib/features/ticketing'
import { isWorkshopsEnabledForConference } from '@/lib/features/workshops'

// `?sponsor=<id>&view=<tab>` opens that sponsor in the shared record panel.
export const metadata = { title: SPONSOR_PAGE_TITLES.tiers }

export default async function AdminSponsorTiers() {
  const domain = (await headers()).get('host') || 'localhost:3000'

  // The record panel's Send modal needs `sponsorRegistrationLink`, a ticket
  // token, so this page refuses non-organizers before the read, like the board.
  const denied = await denyNonOrganizer()
  if (denied) return denied

  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({
      sponsors: true,
      sponsorTiers: true,
      organizers: true,
      includeSponsorRegistrationLink: true,
    })

  if (conferenceError) {
    return (
      <ErrorDisplay
        title="Error Loading Conference"
        message={conferenceError.message}
      />
    )
  }

  const sponsors: ConferenceSponsor[] = conference?.sponsors || []
  const sponsorTiers = conference?.sponsorTiers || []

  const sponsorsByTier = sponsors.reduce(
    (acc, sponsorData) => {
      const tierTitle = sponsorData.tier?.title || 'No Tier'
      if (!acc[tierTitle]) {
        acc[tierTitle] = []
      }
      acc[tierTitle].push(sponsorData)
      return acc
    },
    {} as Record<string, typeof sponsors>,
  )

  Object.keys(sponsorsByTier).forEach((tierTitle) => {
    sponsorsByTier[tierTitle].sort((a, b) =>
      a.sponsor.name.localeCompare(b.sponsor.name),
    )
  })

  const sortedTierNames = sortTierNamesByValue(
    Object.keys(sponsorsByTier),
    sponsorTiers,
  )

  return (
    <SponsorTiersPageClient
      conference={conference}
      domain={domain}
      canSendDiscountCodes={
        !!conference.checkinEventId &&
        (await isTicketingEnabledForConference(conference))
      }
      workshopsEnabled={await isWorkshopsEnabledForConference(conference)}
      sponsors={sponsors}
      sponsorTiers={sponsorTiers}
      sponsorsByTier={sponsorsByTier}
      sortedTierNames={sortedTierNames}
    />
  )
}
