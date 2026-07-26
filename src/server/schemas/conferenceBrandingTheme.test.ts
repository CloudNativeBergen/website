import { describe, it, expect } from 'vitest'
import { UpdateBrandingSchema, ConferenceThemeSchema } from './conference'

describe('ConferenceThemeSchema', () => {
  it('accepts a well-formed hex pair', () => {
    const parsed = ConferenceThemeSchema.parse({
      primaryColor: '#7C3AED',
      accentColor: '#22D3EE',
    })
    expect(parsed).toEqual({ primaryColor: '#7C3AED', accentColor: '#22D3EE' })
  })

  it('rejects non-hex colours', () => {
    expect(
      ConferenceThemeSchema.safeParse({
        primaryColor: 'purple',
        accentColor: '#22D3EE',
      }).success,
    ).toBe(false)
    expect(
      ConferenceThemeSchema.safeParse({
        primaryColor: '#fff', // 3-digit not allowed
        accentColor: '#22D3EE',
      }).success,
    ).toBe(false)
  })

  it('requires both colours', () => {
    expect(
      ConferenceThemeSchema.safeParse({ primaryColor: '#7C3AED' }).success,
    ).toBe(false)
  })
})

describe('UpdateBrandingSchema — theme extension', () => {
  it('accepts a theme-only patch (backgroundPattern optional)', () => {
    const res = UpdateBrandingSchema.safeParse({
      theme: { primaryColor: '#7C3AED', accentColor: '#22D3EE' },
    })
    expect(res.success).toBe(true)
  })

  it('accepts a backgroundPattern-only patch (theme untouched)', () => {
    const res = UpdateBrandingSchema.safeParse({ backgroundPattern: 'subtle' })
    expect(res.success).toBe(true)
  })

  it('accepts an explicit null theme (unset → revert to defaults)', () => {
    const res = UpdateBrandingSchema.safeParse({ theme: null })
    expect(res.success).toBe(true)
    if (res.success) expect(res.data.theme).toBeNull()
  })

  it('rejects a theme with a malformed colour', () => {
    const res = UpdateBrandingSchema.safeParse({
      theme: { primaryColor: '#12345g', accentColor: '#22D3EE' },
    })
    expect(res.success).toBe(false)
  })

  it('rejects an invalid backgroundPattern', () => {
    const res = UpdateBrandingSchema.safeParse({
      backgroundPattern: 'rainbow',
    })
    expect(res.success).toBe(false)
  })
})
