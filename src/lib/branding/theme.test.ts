import { describe, it, expect } from 'vitest'
import {
  conferenceThemeCss,
  emailBrandColor,
  manifestThemeColor,
  isHexColor,
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_ACCENT_COLOR,
} from './theme'

describe('isHexColor', () => {
  it('accepts 6-digit hex, any case', () => {
    expect(isHexColor('#1d4ed8')).toBe(true)
    expect(isHexColor('#1D4ED8')).toBe(true)
    expect(isHexColor('#ABCDEF')).toBe(true)
  })

  it('rejects malformed values', () => {
    expect(isHexColor('1d4ed8')).toBe(false) // missing #
    expect(isHexColor('#fff')).toBe(false) // 3-digit
    expect(isHexColor('#1d4ed88')).toBe(false) // 7 digits
    expect(isHexColor('#12345g')).toBe(false) // non-hex char
    expect(isHexColor('rebeccapurple')).toBe(false)
    expect(isHexColor('')).toBe(false)
    expect(isHexColor(undefined)).toBe(false)
    expect(isHexColor(null)).toBe(false)
    expect(isHexColor(123)).toBe(false)
  })
})

describe('conferenceThemeCss — token resolution', () => {
  it('returns an empty string when no theme is present (default = pixel-identical)', () => {
    expect(conferenceThemeCss(undefined)).toBe('')
    expect(conferenceThemeCss(null)).toBe('')
    expect(conferenceThemeCss({})).toBe('')
  })

  it('emits primary + derived hover + accent for a full theme', () => {
    const css = conferenceThemeCss({
      primaryColor: '#7C3AED',
      accentColor: '#22D3EE',
    })
    expect(css).toContain('--brand-primary:#7C3AED')
    expect(css).toContain('--brand-accent:#22D3EE')
    // Hover is a darker primary, derived in pure CSS.
    expect(css).toContain(
      '--brand-primary-hover:color-mix(in srgb, #7C3AED 85%, #000)',
    )
    // A single :root block drives both light and dark.
    expect(css.startsWith(':root{')).toBe(true)
    expect(css.endsWith('}')).toBe(true)
  })

  it('emits only the primary when accent is absent', () => {
    const css = conferenceThemeCss({ primaryColor: '#7C3AED' })
    expect(css).toContain('--brand-primary:#7C3AED')
    expect(css).toContain('--brand-primary-hover:')
    expect(css).not.toContain('--brand-accent')
  })

  it('emits only the accent when primary is absent', () => {
    const css = conferenceThemeCss({ accentColor: '#22D3EE' })
    expect(css).toContain('--brand-accent:#22D3EE')
    expect(css).not.toContain('--brand-primary')
  })

  it('ignores malformed colours (defence in depth) and emits nothing', () => {
    expect(conferenceThemeCss({ primaryColor: 'purple' })).toBe('')
    expect(
      conferenceThemeCss({ primaryColor: '#fff', accentColor: '#zzz' }),
    ).toBe('')
  })

  it('trims surrounding whitespace before validating', () => {
    const css = conferenceThemeCss({ primaryColor: '  #1D4ED8  ' })
    expect(css).toContain('--brand-primary:#1D4ED8')
  })
})

describe('emailBrandColor / manifestThemeColor', () => {
  it('returns the primary hex when themed', () => {
    expect(emailBrandColor({ primaryColor: '#7C3AED' })).toBe('#7C3AED')
    expect(manifestThemeColor({ primaryColor: '#7C3AED' })).toBe('#7C3AED')
  })

  it('falls back to the house blue when unthemed or invalid', () => {
    expect(emailBrandColor(undefined)).toBe(DEFAULT_PRIMARY_COLOR)
    expect(emailBrandColor({})).toBe(DEFAULT_PRIMARY_COLOR)
    expect(emailBrandColor({ primaryColor: 'nope' })).toBe(
      DEFAULT_PRIMARY_COLOR,
    )
    expect(manifestThemeColor(null)).toBe(DEFAULT_PRIMARY_COLOR)
  })
})

describe('house defaults', () => {
  it('match the tailwind.css seam fallbacks', () => {
    // These MUST equal the fallbacks in src/styles/tailwind.css or the injected
    // override and the CSS default would disagree.
    expect(DEFAULT_PRIMARY_COLOR.toLowerCase()).toBe('#1d4ed8')
    expect(DEFAULT_ACCENT_COLOR.toLowerCase()).toBe('#06b6d4')
  })
})
