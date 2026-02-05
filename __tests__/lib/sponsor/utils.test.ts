import { describe, it, expect } from '@jest/globals'
import {
  sortSponsorTiers,
  formatTierLabel,
  sortTierNamesByValue,
  deterministicShuffle,
} from '@/lib/sponsor/utils'
import { SponsorTier } from '@/lib/sponsor/types'

describe('Sponsor Utilities', () => {
  const mockTiers: SponsorTier[] = [
    {
      _id: '1',
      _createdAt: '',
      _updatedAt: '',
      title: 'Gold',
      tagline: 'Gold tagline',
      tier_type: 'standard',
      price: [{ _key: 'p1', amount: 50000, currency: 'NOK' }],
      sold_out: false,
      most_popular: false,
    },
    {
      _id: '2',
      _createdAt: '',
      _updatedAt: '',
      title: 'Silver',
      tagline: 'Silver tagline',
      tier_type: 'standard',
      price: [{ _key: 'p2', amount: 25000, currency: 'NOK' }],
      sold_out: false,
      most_popular: false,
    },
    {
      _id: '3',
      _createdAt: '',
      _updatedAt: '',
      title: 'Lanyard',
      tagline: 'Lanyard tagline',
      tier_type: 'addon',
      price: [{ _key: 'p3', amount: 10000, currency: 'NOK' }],
      sold_out: false,
      most_popular: false,
    },
    {
      _id: '4',
      _createdAt: '',
      _updatedAt: '',
      title: 'Community',
      tagline: 'Community tagline',
      tier_type: 'special',
      price: [],
      sold_out: false,
      most_popular: false,
    },
  ]

  describe('sortSponsorTiers', () => {
    it('sorts tiers by type (standard > special > addon) and then price', () => {
      const sorted = sortSponsorTiers(mockTiers)
      expect(sorted[0].title).toBe('Gold') // Standard, High Price
      expect(sorted[1].title).toBe('Silver') // Standard, Low Price
      expect(sorted[2].title).toBe('Community') // Special
      expect(sorted[3].title).toBe('Lanyard') // Addon
    })
  })

  describe('formatTierLabel', () => {
    it('appends (addon) to addon tiers', () => {
      expect(formatTierLabel(mockTiers[2])).toBe('Lanyard (addon)')
    })

    it('returns title as-is for standard tiers', () => {
      expect(formatTierLabel(mockTiers[0])).toBe('Gold')
    })
  })

  describe('sortTierNamesByValue', () => {
    it('sorts tier names correctly using types and prices', () => {
      const names = ['Silver', 'Lanyard', 'Gold', 'Community', 'No Tier']
      const sorted = sortTierNamesByValue(names, mockTiers)

      expect(sorted[0]).toBe('Gold')
      expect(sorted[1]).toBe('Silver')
      expect(sorted[2]).toBe('Community')
      expect(sorted[3]).toBe('Lanyard')
      expect(sorted[4]).toBe('No Tier')
    })
  })

  describe('deterministicShuffle', () => {
    it('shuffles the same way given the same seed', () => {
      const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      const seed = 12345
      const result1 = deterministicShuffle(input, seed)
      const result2 = deterministicShuffle(input, seed)

      expect(result1).toEqual(result2)
      expect(result1).not.toEqual(input) // Should actually be shuffled
    })

    it('shuffles differently given different seeds', () => {
      const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      const result1 = deterministicShuffle(input, 111)
      const result2 = deterministicShuffle(input, 222)

      expect(result1).not.toEqual(result2)
    })
  })
})
