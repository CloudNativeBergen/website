import { validateSponsorTier, validateSponsor } from '@/lib/sponsor/validation'
import { SponsorTierInput, SponsorInput } from '@/lib/sponsor/types'

describe('validateSponsorTier', () => {
  const baseTier: SponsorTierInput = {
    title: 'Test Tier',
    tagline: 'Test Tagline',
    tierType: 'standard',
    soldOut: false,
    mostPopular: false,
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
      expect(errors).toContainEqual(expect.objectContaining({ field: 'price' }))
    })

    it('fails without perks', () => {
      const tier = { ...baseTier, perks: [] }
      const errors = validateSponsorTier(tier)
      expect(errors).toContainEqual(expect.objectContaining({ field: 'perks' }))
    })
  })

  describe('Addon Tier', () => {
    const addonTier: SponsorTierInput = {
      ...baseTier,
      tierType: 'addon',
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
      expect(errors).toContainEqual(expect.objectContaining({ field: 'price' }))
    })
  })

  describe('Special Tier', () => {
    const specialTier: SponsorTierInput = {
      ...baseTier,
      tierType: 'special',
      price: [],
      perks: [],
    }

    it('passes without price and perks', () => {
      const errors = validateSponsorTier(specialTier)
      expect(errors).toHaveLength(0)
    })
  })
})

describe('validateSponsor', () => {
  const baseSponsor: SponsorInput = {
    name: 'Acme Corp',
    website: 'https://acme.com',
    logo: '<svg>...</svg>',
  }

  it('passes with valid data', () => {
    const errors = validateSponsor(baseSponsor)
    expect(errors).toHaveLength(0)
  })

  it('passes with missing logo (quick creation)', () => {
    const sponsor = { ...baseSponsor, logo: '' }
    const errors = validateSponsor(sponsor)
    expect(errors).toHaveLength(0)
  })

  it('fails with invalid website URL', () => {
    const sponsor = { ...baseSponsor, website: 'not-a-url' }
    const errors = validateSponsor(sponsor)
    expect(errors).toContainEqual(expect.objectContaining({ field: 'website' }))
  })

  it('fails with empty name', () => {
    const sponsor = { ...baseSponsor, name: '' }
    const errors = validateSponsor(sponsor)
    expect(errors).toContainEqual(expect.objectContaining({ field: 'name' }))
  })

  it('fails with non-SVG logo content if provided', () => {
    const sponsor = { ...baseSponsor, logo: 'not-an-svg' }
    const errors = validateSponsor(sponsor)
    expect(errors).toContainEqual(expect.objectContaining({ field: 'logo' }))
  })
})
