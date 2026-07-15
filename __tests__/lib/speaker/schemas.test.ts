import {
  SpeakerInputSchema,
  SpeakerUpdateSchema,
  SpeakerCreateSchema,
} from '@/server/schemas/speaker'

describe('Speaker gender and country fields', () => {
  it('accepts a valid preset gender and country', () => {
    const result = SpeakerInputSchema.safeParse({
      name: 'Alice',
      gender: 'Woman',
      country: 'Norway',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.gender).toBe('Woman')
      expect(result.data.country).toBe('Norway')
    }
  })

  it('accepts the self-describe preset with free-text value', () => {
    const result = SpeakerInputSchema.safeParse({
      name: 'Dana',
      gender: 'Prefer to self-describe',
      genderSelfDescribe: 'Genderfluid',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.genderSelfDescribe).toBe('Genderfluid')
    }
  })

  it('rejects a gender value outside the preset list', () => {
    const result = SpeakerInputSchema.safeParse({
      name: 'Alice',
      gender: 'Robot',
    })
    expect(result.success).toBe(false)
  })

  it('treats gender and country as optional', () => {
    const result = SpeakerInputSchema.safeParse({ name: 'Alice' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.gender).toBeUndefined()
      expect(result.data.country).toBeUndefined()
    }
  })

  it('normalizes null gender/country to undefined', () => {
    const result = SpeakerInputSchema.safeParse({
      name: 'Alice',
      gender: null,
      genderSelfDescribe: null,
      country: null,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.gender).toBeUndefined()
      expect(result.data.genderSelfDescribe).toBeUndefined()
      expect(result.data.country).toBeUndefined()
    }
  })

  it('supports partial updates carrying only the new fields', () => {
    const result = SpeakerUpdateSchema.safeParse({
      gender: 'Non-binary',
      country: 'Sweden',
    })
    expect(result.success).toBe(true)
  })

  it('accepts the new fields on admin create schema', () => {
    const result = SpeakerCreateSchema.safeParse({
      name: 'Alice',
      email: 'alice@example.com',
      gender: 'Man',
      country: 'Denmark',
    })
    expect(result.success).toBe(true)
  })
})

describe('genderSelfDescribe cross-field validation', () => {
  it('rejects genderSelfDescribe when gender is not the self-describe preset', () => {
    const result = SpeakerInputSchema.safeParse({
      name: 'Alice',
      gender: 'Woman',
      genderSelfDescribe: 'Genderfluid',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['genderSelfDescribe'])
    }
  })

  it('rejects genderSelfDescribe when gender is absent', () => {
    const result = SpeakerInputSchema.safeParse({
      name: 'Alice',
      genderSelfDescribe: 'Genderfluid',
    })
    expect(result.success).toBe(false)
  })

  it('allows genderSelfDescribe with the self-describe preset', () => {
    const result = SpeakerInputSchema.safeParse({
      name: 'Alice',
      gender: 'Prefer to self-describe',
      genderSelfDescribe: 'Genderfluid',
    })
    expect(result.success).toBe(true)
  })

  it('allows an empty genderSelfDescribe regardless of gender', () => {
    const result = SpeakerInputSchema.safeParse({
      name: 'Alice',
      gender: 'Woman',
      genderSelfDescribe: '',
    })
    expect(result.success).toBe(true)
  })

  it('enforces the rule on the partial update schema', () => {
    const result = SpeakerUpdateSchema.safeParse({
      gender: 'Man',
      genderSelfDescribe: 'Genderqueer',
    })
    expect(result.success).toBe(false)
  })

  it('enforces the rule on the admin create schema', () => {
    const result = SpeakerCreateSchema.safeParse({
      name: 'Alice',
      email: 'alice@example.com',
      gender: 'Man',
      genderSelfDescribe: 'Genderqueer',
    })
    expect(result.success).toBe(false)
  })
})
