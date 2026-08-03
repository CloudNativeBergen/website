import { describe, it, expect } from 'vitest'
import {
  HOUSE_OG_PAIR,
  OG_MAX_BACKGROUND_LUMINANCE,
  OG_MAX_TEXT_LUMINANCE,
  ogBrandColors,
  relativeLuminance,
} from './brand'
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_PRIMARY_COLOR,
} from '@/lib/branding/theme'

/** The literal gradient string the OG routes hard-coded before theming. */
const LEGACY_HOUSE_GRADIENT = 'linear-gradient(135deg, #1D4ED8, #06B6D4)'
/** The literal gradient string the badge card hard-coded before theming. */
const LEGACY_BADGE_GRADIENT = 'linear-gradient(135deg, #1e40af, #10b981)'
const BADGE_PAIR = { primary: '#1e40af', accent: '#10b981' }

describe('relativeLuminance', () => {
  it('anchors on black and white', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 6)
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 6)
  })

  it('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(relativeLuminance(' #1d4ed8 ')).toBeCloseTo(
      relativeLuminance('#1D4ED8'),
      12,
    )
  })
})

describe('ogBrandColors — UNTHEMED is byte-identical to the pre-theming output', () => {
  it.each([
    ['no theme', undefined],
    ['null theme', null],
    ['empty theme', {}],
    ['half theme (primary only)', { primaryColor: '#7C3AED' }],
    ['half theme (accent only)', { accentColor: '#22D3EE' }],
    ['malformed primary', { primaryColor: 'purple', accentColor: '#22D3EE' }],
    ['malformed accent', { primaryColor: '#7C3AED', accentColor: '#zzz' }],
    ['3-digit hex', { primaryColor: '#fff', accentColor: '#000' }],
  ])('%s → the house gradient string, verbatim', (_label, theme) => {
    const brand = ogBrandColors(theme)
    expect(brand.themed).toBe(false)
    expect(brand.gradient).toBe(LEGACY_HOUSE_GRADIENT)
    expect(brand.primary).toBe(DEFAULT_PRIMARY_COLOR)
    expect(brand.accent).toBe(DEFAULT_ACCENT_COLOR)
    expect(brand.textOnLight).toBe(DEFAULT_PRIMARY_COLOR)
  })

  it('keeps the badge card on ITS own house pair', () => {
    const brand = ogBrandColors(undefined, BADGE_PAIR)
    expect(brand.gradient).toBe(LEGACY_BADGE_GRADIENT)
    expect(brand.textOnLight).toBe('#1e40af')
  })

  it('never clamps the house palette, even though the accent is light', () => {
    // The house cyan sits ABOVE the tenant ceiling. It is grandfathered: the
    // unthemed path returns colours verbatim, which is what makes the legacy
    // output byte-identical.
    expect(relativeLuminance(DEFAULT_ACCENT_COLOR)).toBeGreaterThan(
      OG_MAX_BACKGROUND_LUMINANCE,
    )
    expect(ogBrandColors(undefined).accent).toBe(DEFAULT_ACCENT_COLOR)
  })
})

describe('ogBrandColors — THEMED', () => {
  it('uses a dark-enough stored pair verbatim', () => {
    const brand = ogBrandColors({
      primaryColor: '#7C2D12',
      accentColor: '#166534',
    })
    expect(brand.themed).toBe(true)
    expect(brand.primary).toBe('#7C2D12')
    expect(brand.accent).toBe('#166534')
    expect(brand.gradient).toBe('linear-gradient(135deg, #7C2D12, #166534)')
  })

  it('trims stored whitespace', () => {
    expect(
      ogBrandColors({ primaryColor: ' #7C2D12 ', accentColor: ' #166534 ' })
        .gradient,
    ).toBe('linear-gradient(135deg, #7C2D12, #166534)')
  })

  it('differs from the house gradient (the bug this fixes)', () => {
    expect(
      ogBrandColors({ primaryColor: '#7C2D12', accentColor: '#F59E0B' })
        .gradient,
    ).not.toBe(LEGACY_HOUSE_GRADIENT)
  })
})

describe('ogBrandColors — contrast clamp', () => {
  const LIGHT_BRANDS = [
    '#FFFFFF', // pure white
    '#FDE68A', // amber-200
    '#F59E0B', // amber-500
    '#A7F3D0', // emerald-200
    '#E0F2FE', // sky-100
    '#FF00FF', // full-saturation magenta
  ]

  it.each(LIGHT_BRANDS)('%s is darkened until white text clears 3:1', (hex) => {
    const brand = ogBrandColors({ primaryColor: hex, accentColor: hex })
    expect(relativeLuminance(brand.primary)).toBeLessThanOrEqual(
      OG_MAX_BACKGROUND_LUMINANCE,
    )
    expect(relativeLuminance(brand.accent)).toBeLessThanOrEqual(
      OG_MAX_BACKGROUND_LUMINANCE,
    )
    // …and the chip variant clears the stricter small-text bar.
    expect(relativeLuminance(brand.textOnLight)).toBeLessThanOrEqual(
      OG_MAX_TEXT_LUMINANCE,
    )
  })

  it('preserves hue by scaling channels, not by desaturating', () => {
    // Pure magenta stays pure magenta: the zero channel stays zero and the two
    // equal channels stay equal.
    const { primary } = ogBrandColors({
      primaryColor: '#FF00FF',
      accentColor: '#FF00FF',
    })
    const [r, g, b] = [1, 3, 5].map((i) =>
      parseInt(primary.slice(i, i + 2), 16),
    )
    expect(g).toBe(0)
    expect(r).toBe(b)
    expect(r).toBeGreaterThan(0)
  })

  it('clamps only what needs clamping (a dark colour is untouched)', () => {
    const { primary } = ogBrandColors({
      primaryColor: '#1D4ED8',
      accentColor: '#1D4ED8',
    })
    expect(primary).toBe('#1D4ED8')
  })

  it('bounds every pixel of the gradient, not just its endpoints', () => {
    // The sRGB transfer function is convex, so a channel-wise interpolation
    // never exceeds the interpolation of the endpoint luminances. Sample it.
    const { primary, accent } = ogBrandColors({
      primaryColor: '#FFFFFF',
      accentColor: '#FDE68A',
    })
    const channels = (hex: string) =>
      [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
    const a = channels(primary)
    const b = channels(accent)
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const mixed =
        '#' +
        a
          .map((c, i) =>
            Math.round(c + (b[i] - c) * t)
              .toString(16)
              .padStart(2, '0'),
          )
          .join('')
      expect(relativeLuminance(mixed)).toBeLessThanOrEqual(
        OG_MAX_BACKGROUND_LUMINANCE + 1e-9,
      )
    }
  })

  it('handles black without dividing by zero', () => {
    const brand = ogBrandColors({
      primaryColor: '#000000',
      accentColor: '#000000',
    })
    expect(brand.gradient).toBe('linear-gradient(135deg, #000000, #000000)')
  })
})

describe('HOUSE_OG_PAIR', () => {
  it('is the shared branding default, not a second copy of the hexes', () => {
    expect(HOUSE_OG_PAIR.primary).toBe(DEFAULT_PRIMARY_COLOR)
    expect(HOUSE_OG_PAIR.accent).toBe(DEFAULT_ACCENT_COLOR)
  })
})
