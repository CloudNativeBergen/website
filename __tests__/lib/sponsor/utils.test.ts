import {
  sortSponsorTiers,
  formatTierLabel,
  sortTierNamesByValue,
  deterministicShuffle,
  groupSponsorsByTier,
  getDailySeed,
} from '@/lib/sponsor/utils'
import type { SponsorTier, ConferenceSponsor } from '@/lib/sponsor/types'

function makeTier(
  overrides: Partial<SponsorTier> & { _id: string; title: string },
): SponsorTier {
  return {
    _createdAt: '',
    _updatedAt: '',
    tagline: `${overrides.title} tagline`,
    tierType: 'standard',
    soldOut: false,
    mostPopular: false,
    price: [],
    ...overrides,
  }
}

const mockTiers: SponsorTier[] = [
  makeTier({
    _id: '1',
    title: 'Gold',
    price: [{ _key: 'p1', amount: 50000, currency: 'NOK' }],
  }),
  makeTier({
    _id: '2',
    title: 'Silver',
    price: [{ _key: 'p2', amount: 25000, currency: 'NOK' }],
  }),
  makeTier({
    _id: '3',
    title: 'Lanyard',
    tierType: 'addon',
    price: [{ _key: 'p3', amount: 10000, currency: 'NOK' }],
  }),
  makeTier({
    _id: '4',
    title: 'Community',
    tierType: 'special',
  }),
]

describe('sortSponsorTiers', () => {
  it('sorts by type (standard > special > addon) then by price descending', () => {
    const sorted = sortSponsorTiers(mockTiers)
    expect(sorted.map((t) => t.title)).toEqual([
      'Gold',
      'Silver',
      'Community',
      'Lanyard',
    ])
  })

  it('falls back to title when prices are equal', () => {
    const tiers = [
      makeTier({
        _id: 'a',
        title: 'Beta',
        price: [{ _key: 'p', amount: 100, currency: 'NOK' }],
      }),
      makeTier({
        _id: 'b',
        title: 'Alpha',
        price: [{ _key: 'p', amount: 100, currency: 'NOK' }],
      }),
    ]
    const sorted = sortSponsorTiers(tiers)
    expect(sorted[0].title).toBe('Alpha')
    expect(sorted[1].title).toBe('Beta')
  })

  it('treats missing price as 0', () => {
    const tiers = [
      makeTier({ _id: 'a', title: 'Free', price: [] }),
      makeTier({
        _id: 'b',
        title: 'Paid',
        price: [{ _key: 'p', amount: 1000, currency: 'NOK' }],
      }),
    ]
    const sorted = sortSponsorTiers(tiers)
    expect(sorted[0].title).toBe('Paid')
    expect(sorted[1].title).toBe('Free')
  })

  it('does not mutate the input array', () => {
    const original = [...mockTiers]
    sortSponsorTiers(mockTiers)
    expect(mockTiers).toEqual(original)
  })
})

describe('formatTierLabel', () => {
  it('appends (addon) to addon tiers', () => {
    expect(formatTierLabel(mockTiers[2])).toBe('Lanyard (addon)')
  })

  it('returns title as-is for standard tiers', () => {
    expect(formatTierLabel(mockTiers[0])).toBe('Gold')
  })

  it('returns title as-is for special tiers', () => {
    expect(formatTierLabel(mockTiers[3])).toBe('Community')
  })

  it('works with a plain object having title and tierType', () => {
    expect(formatTierLabel({ title: 'WiFi', tierType: 'addon' })).toBe(
      'WiFi (addon)',
    )
  })
})

describe('groupSponsorsByTier', () => {
  function makeSponsor(
    name: string,
    tierTitle: string,
    tierType: 'standard' | 'special' | 'addon' = 'standard',
  ): ConferenceSponsor {
    return {
      sponsor: { _id: name, name, website: 'https://example.com' },
      tier: { title: tierTitle, tagline: '', tierType },
    }
  }

  it('groups sponsors by tier title', () => {
    const sponsors = [
      makeSponsor('A', 'Gold'),
      makeSponsor('B', 'Silver'),
      makeSponsor('C', 'Gold'),
    ]
    const groups = groupSponsorsByTier(sponsors)
    expect(Object.keys(groups)).toEqual(['Gold', 'Silver'])
    expect(groups['Gold']).toHaveLength(2)
    expect(groups['Silver']).toHaveLength(1)
  })

  it('aggregates special tiers under SPECIAL key', () => {
    const sponsors = [
      makeSponsor('A', 'Community Partner', 'special'),
      makeSponsor('B', 'Media Partner', 'special'),
      makeSponsor('C', 'Gold'),
    ]
    const groups = groupSponsorsByTier(sponsors)
    expect(groups['SPECIAL']).toHaveLength(2)
    expect(groups['Gold']).toHaveLength(1)
    expect(groups['Community Partner']).toBeUndefined()
  })

  it('returns empty object for empty array', () => {
    expect(groupSponsorsByTier([])).toEqual({})
  })
})

describe('getDailySeed', () => {
  it('returns a numeric seed in YYYYMMDD format', () => {
    const seed = getDailySeed()
    expect(seed).toBeGreaterThan(20200101)
    expect(seed).toBeLessThan(21000101)
    expect(Number.isInteger(seed)).toBe(true)
  })

  it('returns the same value when called twice on the same day', () => {
    expect(getDailySeed()).toBe(getDailySeed())
  })
})

describe('sortTierNamesByValue', () => {
  it('sorts tier names by type and price, with No Tier last', () => {
    const names = ['Silver', 'Lanyard', 'Gold', 'Community', 'No Tier']
    const sorted = sortTierNamesByValue(names, mockTiers)
    expect(sorted).toEqual([
      'Gold',
      'Silver',
      'Community',
      'Lanyard',
      'No Tier',
    ])
  })

  it('puts SPECIAL before No Tier but after standard tiers', () => {
    const names = ['No Tier', 'SPECIAL', 'Gold']
    const sorted = sortTierNamesByValue(names, mockTiers)
    expect(sorted.indexOf('Gold')).toBeLessThan(sorted.indexOf('SPECIAL'))
    expect(sorted.indexOf('SPECIAL')).toBeLessThan(sorted.indexOf('No Tier'))
  })

  it('handles unknown tier names gracefully', () => {
    const names = ['Unknown', 'Gold']
    const sorted = sortTierNamesByValue(names, mockTiers)
    expect(sorted[0]).toBe('Gold')
  })
})

describe('deterministicShuffle', () => {
  it('produces identical output for identical seed', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const a = deterministicShuffle(input, 12345)
    const b = deterministicShuffle(input, 12345)
    expect(a).toEqual(b)
    expect(a).not.toEqual(input)
  })

  it('produces different output for different seeds', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(deterministicShuffle(input, 111)).not.toEqual(
      deterministicShuffle(input, 222),
    )
  })

  it('does not mutate the input array', () => {
    const input = [1, 2, 3]
    const copy = [...input]
    deterministicShuffle(input, 42)
    expect(input).toEqual(copy)
  })

  it('handles empty array', () => {
    expect(deterministicShuffle([], 42)).toEqual([])
  })

  it('handles single element', () => {
    expect(deterministicShuffle([1], 42)).toEqual([1])
  })
})
