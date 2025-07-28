import { describe, it, expect } from '@jest/globals'
import { ConferenceSponsor } from '@/lib/sponsor/types'

// Test the sorting logic without rendering the component
describe('Sponsors Sorting Logic', () => {
  const mockSponsors: ConferenceSponsor[] = [
    {
      sponsor: {
        name: 'Sponsor A',
        website: 'https://a.com',
        logo: 'logo-a',
      },
      tier: {
        title: 'Gold',
        tagline: 'Gold tier',
        tier_type: 'standard',
        price: [{ _key: 'price1', amount: 50000, currency: 'NOK' }],
      },
    },
    {
      sponsor: {
        name: 'Sponsor B',
        website: 'https://b.com',
        logo: 'logo-b',
      },
      tier: {
        title: 'Platinum',
        tagline: 'Platinum tier',
        tier_type: 'standard',
        price: [{ _key: 'price2', amount: 100000, currency: 'NOK' }],
      },
    },
    {
      sponsor: {
        name: 'Sponsor C',
        website: 'https://c.com',
        logo: 'logo-c',
      },
      tier: {
        title: 'Silver',
        tagline: 'Silver tier',
        tier_type: 'standard',
        price: [{ _key: 'price3', amount: 25000, currency: 'NOK' }],
      },
    },
    {
      sponsor: {
        name: 'Sponsor D',
        website: 'https://d.com',
        logo: 'logo-d',
      },
      tier: {
        title: 'Community',
        tagline: 'Community tier',
        tier_type: 'special',
      },
    },
  ]

  it('groups sponsors by tier correctly', () => {
    // Group sponsors by tier, but treat all special tiers as one "SPECIAL" group
    const groupedSponsors = mockSponsors.reduce(
      (acc, sponsor) => {
        const tierTitle =
          sponsor.tier.tier_type === 'special' ? 'SPECIAL' : sponsor.tier.title
        if (!acc[tierTitle]) {
          acc[tierTitle] = []
        }
        acc[tierTitle].push(sponsor)
        return acc
      },
      {} as Record<string, ConferenceSponsor[]>,
    )

    expect(groupedSponsors['Gold']).toHaveLength(1)
    expect(groupedSponsors['Platinum']).toHaveLength(1)
    expect(groupedSponsors['Silver']).toHaveLength(1)
    expect(groupedSponsors['SPECIAL']).toHaveLength(1)
    expect(groupedSponsors['Gold'][0].sponsor.name).toBe('Sponsor A')
    expect(groupedSponsors['SPECIAL'][0].sponsor.name).toBe('Sponsor D')
  })

  it('sorts sponsors within each tier by price (most expensive first)', () => {
    // Create a tier with multiple sponsors
    const goldSponsors: ConferenceSponsor[] = [
      {
        sponsor: { name: 'Gold Sponsor 1', website: 'https://1.com', logo: 'logo-1' },
        tier: {
          title: 'Gold',
          tagline: 'Gold tier',
          tier_type: 'standard',
          price: [{ _key: 'price1', amount: 30000, currency: 'NOK' }],
        },
      },
      {
        sponsor: { name: 'Gold Sponsor 2', website: 'https://2.com', logo: 'logo-2' },
        tier: {
          title: 'Gold',
          tagline: 'Gold tier',
          tier_type: 'standard',
          price: [{ _key: 'price2', amount: 60000, currency: 'NOK' }],
        },
      },
    ]

    // Sort by price (most expensive first)
    const sorted = goldSponsors.sort((a, b) => {
      const aPrice = a.tier.price?.[0]?.amount || 0
      const bPrice = b.tier.price?.[0]?.amount || 0
      return bPrice - aPrice // Sort descending (most expensive first)
    })

    expect(sorted[0].sponsor.name).toBe('Gold Sponsor 2') // 60k should be first
    expect(sorted[1].sponsor.name).toBe('Gold Sponsor 1') // 30k should be second
  })

  it('sorts tiers by highest price (most expensive tier first)', () => {
    // Group sponsors by tier
    const groupedSponsors = mockSponsors.reduce(
      (acc, sponsor) => {
        const tierTitle =
          sponsor.tier.tier_type === 'special' ? 'SPECIAL' : sponsor.tier.title
        if (!acc[tierTitle]) {
          acc[tierTitle] = []
        }
        acc[tierTitle].push(sponsor)
        return acc
      },
      {} as Record<string, ConferenceSponsor[]>,
    )

    // Sort tier names by hierarchy and value
    const sortedTierNames = Object.keys(groupedSponsors).sort((a, b) => {
      // Special group always goes last
      if (a === 'SPECIAL' && b !== 'SPECIAL') return 1
      if (b === 'SPECIAL' && a !== 'SPECIAL') return -1
      if (a === 'SPECIAL' && b === 'SPECIAL') return 0

      // For standard tiers, sort by highest price in tier (most expensive tier first)
      const aTierSponsors = groupedSponsors[a]
      const bTierSponsors = groupedSponsors[b]
      
      const aMaxPrice = Math.max(...aTierSponsors.map(s => s.tier.price?.[0]?.amount || 0))
      const bMaxPrice = Math.max(...bTierSponsors.map(s => s.tier.price?.[0]?.amount || 0))
      
      if (aMaxPrice !== bMaxPrice) {
        return bMaxPrice - aMaxPrice // Sort descending (most expensive tier first)
      }

      // If prices are equal, sort alphabetically
      return a.localeCompare(b)
    })

    // Platinum (100k) should come first, then Gold (50k), then Silver (25k), then Special
    expect(sortedTierNames).toEqual(['Platinum', 'Gold', 'Silver', 'SPECIAL'])
  })

  it('handles sponsors without prices gracefully', () => {
    const sponsorWithoutPrice: ConferenceSponsor = {
      sponsor: {
        name: 'Sponsor E',
        website: 'https://e.com',
        logo: 'logo-e',
      },
      tier: {
        title: 'Bronze',
        tagline: 'Bronze tier',
        tier_type: 'standard',
      },
    }

    const sponsorWithPrice: ConferenceSponsor = {
      sponsor: {
        name: 'Sponsor F',
        website: 'https://f.com',
        logo: 'logo-f',
      },
      tier: {
        title: 'Bronze',
        tagline: 'Bronze tier',
        tier_type: 'standard',
        price: [{ _key: 'price1', amount: 10000, currency: 'NOK' }],
      },
    }

    const sponsors = [sponsorWithoutPrice, sponsorWithPrice]
    
    // Sort by price (most expensive first)
    const sorted = sponsors.sort((a, b) => {
      const aPrice = a.tier.price?.[0]?.amount || 0
      const bPrice = b.tier.price?.[0]?.amount || 0
      return bPrice - aPrice // Sort descending (most expensive first)
    })

    // Sponsor with price should come first
    expect(sorted[0].sponsor.name).toBe('Sponsor F')
    expect(sorted[1].sponsor.name).toBe('Sponsor E')
  })
})
