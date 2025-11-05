import type { SponsorTier, ConferenceSponsor } from './types'

/**
 * Sorts sponsor tiers by value (highest to lowest), with special tiers at the end
 */
export function sortSponsorTiersByValue(tiers: SponsorTier[]): SponsorTier[] {
  return [...tiers].sort((a, b) => {
    // Special tiers go to the end
    if (a.tier_type === 'special' && b.tier_type !== 'special') return 1
    if (b.tier_type === 'special' && a.tier_type !== 'special') return -1
    if (a.tier_type === 'special' && b.tier_type === 'special') {
      return a.title.localeCompare(b.title)
    }

    // Sort by highest price (descending)
    const maxPriceA = a.price ? Math.max(...a.price.map((p) => p.amount)) : 0
    const maxPriceB = b.price ? Math.max(...b.price.map((p) => p.amount)) : 0
    return maxPriceB - maxPriceA
  })
}

/**
 * Gets the maximum price value for a sponsor tier
 */
export function getTierMaxPrice(
  tier: SponsorTier | ConferenceSponsor['tier'],
): number {
  if (!tier.price || tier.price.length === 0) return 0
  return Math.max(...tier.price.map((p) => p.amount))
}

/**
 * Groups sponsors by their tier title, handling special tiers
 */
export function groupSponsorsByTier<T extends ConferenceSponsor>(
  sponsors: T[],
): Record<string, T[]> {
  return sponsors.reduce(
    (acc, sponsor) => {
      const tierTitle =
        sponsor.tier.tier_type === 'special' ? 'SPECIAL' : sponsor.tier.title
      if (!acc[tierTitle]) {
        acc[tierTitle] = []
      }
      acc[tierTitle].push(sponsor)
      return acc
    },
    {} as Record<string, T[]>,
  )
}

/**
 * Generates a deterministic daily seed for shuffling
 */
export function getDailySeed(): number {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth() + 1
  const day = today.getDate()
  return year * 10000 + month * 100 + day
}

/**
 * Deterministically shuffles an array based on a seed
 */
export function deterministicShuffle<T>(array: T[], seed: number): T[] {
  const shuffled = [...array]
  let currentIndex = shuffled.length

  let random = seed
  const next = () => {
    random = (random * 1664525 + 1013904223) % 2 ** 32
    return random / 2 ** 32
  }

  while (currentIndex !== 0) {
    const randomIndex = Math.floor(next() * currentIndex)
    currentIndex--
    ;[shuffled[currentIndex], shuffled[randomIndex]] = [
      shuffled[randomIndex],
      shuffled[currentIndex],
    ]
  }

  return shuffled
}

/**
 * Sorts tier names by value (highest to lowest), with "No Tier" last and special tiers before it
 */
export function sortTierNamesByValue(
  tierNames: string[],
  sponsorTiers: SponsorTier[],
): string[] {
  return [...tierNames].sort((a, b) => {
    if (a === 'No Tier') return 1
    if (b === 'No Tier') return -1

    const tierA = sponsorTiers.find((tier) => tier.title === a)
    const tierB = sponsorTiers.find((tier) => tier.title === b)

    if (tierA?.tier_type === 'special' && tierB?.tier_type === 'special') {
      return a.localeCompare(b)
    }
    if (tierA?.tier_type === 'special') return 1
    if (tierB?.tier_type === 'special') return -1

    const maxPriceA = tierA?.price
      ? Math.max(...tierA.price.map((p) => p.amount))
      : 0
    const maxPriceB = tierB?.price
      ? Math.max(...tierB.price.map((p) => p.amount))
      : 0

    return maxPriceB - maxPriceA
  })
}
