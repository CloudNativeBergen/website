import type { SponsorTier, ConferenceSponsor } from './types'

/**
 * Sorts sponsor tiers by type (standard, special, addon) and then by value (highest to lowest)
 */
export function sortSponsorTiers(tiers: SponsorTier[]): SponsorTier[] {
  const typeOrder = { standard: 0, special: 1, addon: 2 }

  return [...tiers].sort((a, b) => {
    const aOrder = typeOrder[a.tierType as keyof typeof typeOrder] ?? 99
    const bOrder = typeOrder[b.tierType as keyof typeof typeOrder] ?? 99

    if (aOrder !== bOrder) return aOrder - bOrder

    // Sort by highest price (descending) within same type
    const maxPriceA = a.price ? Math.max(...a.price.map((p) => p.amount)) : 0
    const maxPriceB = b.price ? Math.max(...b.price.map((p) => p.amount)) : 0

    if (maxPriceA !== maxPriceB) return maxPriceB - maxPriceA

    // Fallback to title
    return a.title.localeCompare(b.title)
  })
}

/**
 * Formats a tier label, appending "(addon)" for addon tiers
 */
export function formatTierLabel(
  tier: SponsorTier | { title: string; tierType?: string },
): string {
  if (tier.tierType === 'addon') {
    return `${tier.title} (addon)`
  }
  return tier.title
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
        sponsor.tier.tierType === 'special' ? 'SPECIAL' : sponsor.tier.title
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
  const typeOrder = { standard: 0, special: 1, addon: 2 }

  return [...tierNames].sort((a, b) => {
    if (a === 'No Tier') return 1
    if (b === 'No Tier') return -1
    if (a === 'SPECIAL') return 1 // Put aggregated SPECIAL at the end
    if (b === 'SPECIAL') return -1

    const tierA = sponsorTiers.find((tier) => tier.title === a)
    const tierB = sponsorTiers.find((tier) => tier.title === b)

    const aOrder = tierA
      ? (typeOrder[tierA.tierType as keyof typeof typeOrder] ?? 99)
      : 99
    const bOrder = tierB
      ? (typeOrder[tierB.tierType as keyof typeof typeOrder] ?? 99)
      : 99

    if (aOrder !== bOrder) return aOrder - bOrder

    const maxPriceA = tierA?.price
      ? Math.max(...tierA.price.map((p) => p.amount))
      : 0
    const maxPriceB = tierB?.price
      ? Math.max(...tierB.price.map((p) => p.amount))
      : 0

    if (maxPriceA !== maxPriceB) return maxPriceB - maxPriceA

    return a.localeCompare(b)
  })
}

/**
 * Utility to download SVG content as a file
 */
export function downloadSvg(svgContent: string, fileName: string) {
  const blob = new Blob([svgContent], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = fileName.endsWith('.svg') ? fileName : `${fileName}.svg`
  link.style.display = 'none'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  setTimeout(() => URL.revokeObjectURL(url), 100)
}
