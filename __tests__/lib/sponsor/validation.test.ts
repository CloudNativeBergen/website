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
      const errors = validateSponsorTier({ ...baseTier, price: [] })
      expect(errors).toContainEqual(expect.objectContaining({ field: 'price' }))
    })

    it('fails without perks', () => {
      const errors = validateSponsorTier({ ...baseTier, perks: [] })
      expect(errors).toContainEqual(expect.objectContaining({ field: 'perks' }))
    })

    it('fails with negative price amount', () => {
      const errors = validateSponsorTier({
        ...baseTier,
        price: [{ amount: -1, currency: 'NOK' }],
      })
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'price.0.amount' }),
      )
    })

    it('fails with invalid currency', () => {
      const errors = validateSponsorTier({
        ...baseTier,
        price: [{ amount: 1000, currency: 'GBP' }],
      })
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'price.0.currency' }),
      )
    })

    it('fails with empty perk label', () => {
      const errors = validateSponsorTier({
        ...baseTier,
        perks: [{ label: '', description: 'Desc' }],
      })
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'perks.0.label' }),
      )
    })

    it('fails with empty perk description', () => {
      const errors = validateSponsorTier({
        ...baseTier,
        perks: [{ label: 'Perk', description: '' }],
      })
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'perks.0.description' }),
      )
    })
  })

  describe('title and tagline validation', () => {
    it('fails with empty title', () => {
      const errors = validateSponsorTier({ ...baseTier, title: '' })
      expect(errors).toContainEqual(
        expect.objectContaining({
          field: 'title',
          message: 'Title is required',
        }),
      )
    })

    it('fails with whitespace-only title', () => {
      const errors = validateSponsorTier({ ...baseTier, title: '   ' })
      expect(errors).toContainEqual(expect.objectContaining({ field: 'title' }))
    })

    it('fails when title exceeds 100 characters', () => {
      const errors = validateSponsorTier({
        ...baseTier,
        title: 'A'.repeat(101),
      })
      expect(errors).toContainEqual(
        expect.objectContaining({
          field: 'title',
          message: 'Title must be 100 characters or less',
        }),
      )
    })

    it('accepts title at exactly 100 characters', () => {
      const errors = validateSponsorTier({
        ...baseTier,
        title: 'A'.repeat(100),
      })
      expect(errors.filter((e) => e.field === 'title')).toHaveLength(0)
    })

    it('fails with empty tagline', () => {
      const errors = validateSponsorTier({ ...baseTier, tagline: '' })
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'tagline' }),
      )
    })

    it('fails when tagline exceeds 200 characters', () => {
      const errors = validateSponsorTier({
        ...baseTier,
        tagline: 'A'.repeat(201),
      })
      expect(errors).toContainEqual(
        expect.objectContaining({
          field: 'tagline',
          message: 'Tagline must be 200 characters or less',
        }),
      )
    })
  })

  describe('tierType validation', () => {
    it('fails with invalid tierType', () => {
      const errors = validateSponsorTier({
        ...baseTier,
        tierType: 'premium' as any,
      })
      expect(errors).toContainEqual(
        expect.objectContaining({
          field: 'tierType',
          message: 'Tier type must be standard, special, or addon',
        }),
      )
    })

    it('fails with empty tierType', () => {
      const errors = validateSponsorTier({
        ...baseTier,
        tierType: '' as any,
      })
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'tierType' }),
      )
    })
  })

  describe('conference reference', () => {
    it('fails when conference field is present but empty', () => {
      const errors = validateSponsorTier({ ...baseTier, conference: '' })
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'conference' }),
      )
    })

    it('passes when conference field is not present', () => {
      const errors = validateSponsorTier(baseTier)
      expect(errors.filter((e) => e.field === 'conference')).toHaveLength(0)
    })
  })

  describe('Addon Tier', () => {
    const addonTier: SponsorTierInput = {
      ...baseTier,
      tierType: 'addon',
    }

    it('passes with valid data', () => {
      expect(validateSponsorTier(addonTier)).toHaveLength(0)
    })

    it('passes with price of 0 (free addon)', () => {
      const errors = validateSponsorTier({
        ...addonTier,
        price: [{ amount: 0, currency: 'NOK' }],
      })
      expect(errors).toHaveLength(0)
    })

    it('passes without perks', () => {
      expect(validateSponsorTier({ ...addonTier, perks: [] })).toHaveLength(0)
    })

    it('fails without price', () => {
      const errors = validateSponsorTier({ ...addonTier, price: [] })
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
      expect(validateSponsorTier(specialTier)).toHaveLength(0)
    })
  })

  describe('multiple validation errors', () => {
    it('reports all errors at once', () => {
      const errors = validateSponsorTier({
        title: '',
        tagline: '',
        tierType: '' as any,
        soldOut: false,
        mostPopular: false,
        price: [],
        perks: [],
      })
      expect(errors.length).toBeGreaterThanOrEqual(3)
      const fields = errors.map((e) => e.field)
      expect(fields).toContain('title')
      expect(fields).toContain('tagline')
      expect(fields).toContain('tierType')
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
    expect(validateSponsor(baseSponsor)).toHaveLength(0)
  })

  it('passes with missing logo (quick creation)', () => {
    expect(validateSponsor({ ...baseSponsor, logo: '' })).toHaveLength(0)
  })

  it('fails with empty name', () => {
    const errors = validateSponsor({ ...baseSponsor, name: '' })
    expect(errors).toContainEqual(
      expect.objectContaining({ field: 'name', message: 'Name is required' }),
    )
  })

  it('fails with whitespace-only name', () => {
    const errors = validateSponsor({ ...baseSponsor, name: '   ' })
    expect(errors).toContainEqual(expect.objectContaining({ field: 'name' }))
  })

  it('fails when name exceeds 100 characters', () => {
    const errors = validateSponsor({
      ...baseSponsor,
      name: 'A'.repeat(101),
    })
    expect(errors).toContainEqual(
      expect.objectContaining({
        field: 'name',
        message: 'Name must be 100 characters or less',
      }),
    )
  })

  it('fails with empty website', () => {
    const errors = validateSponsor({ ...baseSponsor, website: '' })
    expect(errors).toContainEqual(expect.objectContaining({ field: 'website' }))
  })

  it('fails with invalid website URL', () => {
    const errors = validateSponsor({ ...baseSponsor, website: 'not-a-url' })
    expect(errors).toContainEqual(
      expect.objectContaining({
        field: 'website',
        message: 'Website must be a valid URL',
      }),
    )
  })

  it('fails with non-SVG logo content if provided', () => {
    const errors = validateSponsor({ ...baseSponsor, logo: 'not-an-svg' })
    expect(errors).toContainEqual(
      expect.objectContaining({
        field: 'logo',
        message: 'Logo must be valid SVG content',
      }),
    )
  })

  it('reports multiple errors at once', () => {
    const errors = validateSponsor({
      name: '',
      website: '',
      logo: 'bad',
    })
    expect(errors.length).toBeGreaterThanOrEqual(3)
    const fields = errors.map((e) => e.field)
    expect(fields).toContain('name')
    expect(fields).toContain('website')
    expect(fields).toContain('logo')
  })
})
