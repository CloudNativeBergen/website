import { describe, it, expect, jest } from '@jest/globals'
import { validateSponsorTier } from '@/lib/sponsor/validation'
import { SponsorTierInput } from '@/lib/sponsor/types'

jest.mock('is-svg', () => () => true)

describe('validateSponsorTier', () => {
  const baseTier: SponsorTierInput = {
    title: 'Test Tier',
    tagline: 'Test Tagline',
    tier_type: 'standard',
    sold_out: false,
    most_popular: false,
    price: [{ amount: 1000, currency: 'NOK' }],
    perks: [{ label: 'Perk', description: 'Desc' }],
  }

  describe('Standard Tier', () => {
    it('passes with valid data', () => {
      const errors = validateSponsorTier(baseTier)
      expect(errors).toHaveLength(0)
    })

    it('fails without price', () => {
      const tier = { ...baseTier, price: [] }
      const errors = validateSponsorTier(tier)
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'price' }),
      )
    })

    it('fails without perks', () => {
      const tier = { ...baseTier, perks: [] }
      const errors = validateSponsorTier(tier)
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'perks' }),
      )
    })
  })

  describe('Addon Tier', () => {
    const addonTier: SponsorTierInput = {
      ...baseTier,
      tier_type: 'addon',
    }

    it('passes with valid data', () => {
      const errors = validateSponsorTier(addonTier)
      expect(errors).toHaveLength(0)
    })

    it('passes with price of 0 (Free Addon)', () => {
      const tier = {
        ...addonTier,
        price: [{ amount: 0, currency: 'NOK' }],
      }
      const errors = validateSponsorTier(tier)
      expect(errors).toHaveLength(0)
    })

    it('passes without perks (Optional Perks)', () => {
      const tier = { ...addonTier, perks: [] }
      const errors = validateSponsorTier(tier)
      expect(errors).toHaveLength(0)
    })

    it('fails without price array', () => {
      const tier = { ...addonTier, price: [] }
      const errors = validateSponsorTier(tier)
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'price' }),
      )
    })
  })

  describe('Special Tier', () => {
    const specialTier: SponsorTierInput = {
      ...baseTier,
      tier_type: 'special',
      price: [],
      perks: [],
    }

    it('passes without price and perks', () => {
      const errors = validateSponsorTier(specialTier)
      expect(errors).toHaveLength(0)
    })
  })
})
