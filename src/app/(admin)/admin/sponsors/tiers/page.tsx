import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ConferenceSponsorWithContact } from '@/lib/sponsor/types'
import { ErrorDisplay } from '@/components/admin'
import SponsorPageClient from '@/components/admin/SponsorPageClient'
import { sortTierNamesByValue } from '@/lib/sponsor/utils'

export default async function AdminSponsorTiers() {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({
      sponsors: true,
      sponsorContact: true,
      sponsorTiers: true,
    })

  if (conferenceError) {
    return (
      <ErrorDisplay
        title="Error Loading Conference"
        message={conferenceError.message}
      />
    )
  }

  const sponsors: ConferenceSponsorWithContact[] = conference?.sponsors || []
  const sponsorTiers = conference?.sponsor_tiers || []

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
    <SponsorPageClient
      conference={conference}
      sponsors={sponsors}
      sponsorTiers={sponsorTiers}
      sponsorsByTier={sponsorsByTier}
      sortedTierNames={sortedTierNames}
    />
  )
}
