import { describe, it, expect } from 'vitest'
import {
  compositeWhiteOver,
  contrastRatio,
  HOUSE_OG_PAIR,
  OG_CHIP_BACKGROUND_ALPHA,
  OG_DARKEST_CHIP_BACKGROUND,
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

/**
 * The chips are `rgba(255, 255, 255, 0.9)`, not white. These tests pin the
 * composite arithmetic that `OG_MAX_TEXT_LUMINANCE` is derived from, so the
 * ceiling cannot silently drift back to being measured against pure white.
 *
 * Chip sites, all `backgroundColor: rgba(255,255,255,0.9)` + `color:
 * brand.textOnLight`:
 *   - speaker card, sponsor-name fallback (14px / weight 600) — ingress and
 *     service sponsor rows, `createSponsorLogo`
 *   - badge card, "OpenBadges 3.0 Verified" pill (14px / weight 600)
 */
describe('chip contrast — measured on the real composite, not on white', () => {
  /** WCAG AA for text below 24px (or below 18.66px bold), which the chips are. */
  const SMALL_TEXT_BAR = 4.5

  it('the chip background is NOT white', () => {
    expect(OG_CHIP_BACKGROUND_ALPHA).toBe(0.9)
    expect(OG_DARKEST_CHIP_BACKGROUND).not.toBe('#FFFFFF')
    // 0.9 * 255 = 229.5, floored to 229 = 0xE5.
    expect(OG_DARKEST_CHIP_BACKGROUND).toBe('#E5E5E5')
    expect(relativeLuminance(OG_DARKEST_CHIP_BACKGROUND)).toBeCloseTo(0.7835, 4)
  })

  it('composites in gamma-encoded sRGB, per channel', () => {
    expect(compositeWhiteOver('#000000', 0)).toBe('#000000')
    expect(compositeWhiteOver('#000000', 1)).toBe('#FFFFFF')
    expect(compositeWhiteOver('#FFFFFF', 0.9)).toBe('#FFFFFF')
    // 0.9*255 + 0.1*0x1D = 229.5 + 2.9 = 232.4 → 232 = 0xE8
    expect(compositeWhiteOver('#1D4ED8', 0.9)).toBe('#E8EDFB')
  })

  it('the ceiling is derived FROM the composite, and clears 4.5:1 on it', () => {
    const required =
      (relativeLuminance(OG_DARKEST_CHIP_BACKGROUND) + 0.05) / SMALL_TEXT_BAR -
      0.05
    expect(OG_MAX_TEXT_LUMINANCE).toBeLessThanOrEqual(required)
    expect(required).toBeCloseTo(0.1352, 4)
  })

  it('REGRESSION: the old 0.18 ceiling did not clear the bar on the composite', () => {
    // 0.18 was solved against pure white — 1.05/0.23 = 4.57:1 — but applied on
    // a 90%-opaque chip, where it is only 3.64:1. This is the bug being fixed.
    const stale = 0.18
    const onWhite = 1.05 / (stale + 0.05)
    const onComposite =
      (relativeLuminance(OG_DARKEST_CHIP_BACKGROUND) + 0.05) / (stale + 0.05)
    expect(onWhite).toBeGreaterThan(SMALL_TEXT_BAR)
    expect(onComposite).toBeCloseTo(3.6241, 3)
    expect(onComposite).toBeLessThan(SMALL_TEXT_BAR)
  })

  it.each([
    ['#FFFFFF', 'pure white'],
    ['#FDE68A', 'amber-200'],
    ['#F59E0B', 'amber-500'],
    ['#A7F3D0', 'emerald-200'],
    ['#E0F2FE', 'sky-100'],
    ['#FF00FF', 'magenta'],
    ['#7C2D12', 'already dark'],
    ['#000000', 'black'],
  ])('themed %s (%s) clears 4.5:1 against the darkest possible chip', (hex) => {
    const { textOnLight } = ogBrandColors({
      primaryColor: hex,
      accentColor: hex,
    })
    expect(
      contrastRatio(textOnLight, OG_DARKEST_CHIP_BACKGROUND),
    ).toBeGreaterThanOrEqual(SMALL_TEXT_BAR)
  })

  it('holds over the chip on any clamped gradient pixel, not just black', () => {
    // A chip can sit anywhere on the card, so the colour behind it is any pixel
    // of the clamped gradient. Every one of them is lighter than black, so the
    // black-backed bound is the binding one — assert that directly.
    const { primary, accent, textOnLight } = ogBrandColors({
      primaryColor: '#FDE68A',
      accentColor: '#000000',
    })
    const ch = (hex: string) =>
      [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
    const [a, b] = [ch(primary), ch(accent)]
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const behind =
        '#' +
        a
          .map((c, i) =>
            Math.round(c + (b[i] - c) * t)
              .toString(16)
              .padStart(2, '0'),
          )
          .join('')
      const chip = compositeWhiteOver(behind, OG_CHIP_BACKGROUND_ALPHA)
      expect(contrastRatio(textOnLight, chip)).toBeGreaterThanOrEqual(
        SMALL_TEXT_BAR,
      )
    }
  })

  it('leaves realistic dark brand colours untouched despite the tighter bar', () => {
    // The tightening from 0.18 to 0.135 only moves pastels; real brand colours
    // are far below both, so a themed tenant still gets its stored hex verbatim.
    for (const hex of ['#7C2D12', '#1D4ED8', '#166534', '#1e40af']) {
      expect(
        ogBrandColors({ primaryColor: hex, accentColor: hex }).textOnLight,
      ).toBe(hex)
    }
  })
})

describe('contrastRatio', () => {
  it('is order-independent and anchors on the extremes', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 6)
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 6)
    expect(contrastRatio('#FF00FF', '#FF00FF')).toBeCloseTo(1, 6)
  })
})

/**
 * `OG_MAX_BACKGROUND_LUMINANCE` guarantees the LARGE-text bar only. The cards
 * also carry sub-24px white type on the gradient; that is inherited from the
 * house design and is NOT covered. Pinned so the doc comment cannot quietly
 * regrow the claim that it covers "every text element".
 */
describe('background ceiling — what it does and does not guarantee', () => {
  it('gives large text (≥24px) exactly 3:1', () => {
    expect(1.05 / (OG_MAX_BACKGROUND_LUMINANCE + 0.05)).toBeCloseTo(3, 6)
  })

  it('does NOT give the 12–18px white labels 4.5:1 — a known, inherited gap', () => {
    expect(1.05 / (OG_MAX_BACKGROUND_LUMINANCE + 0.05)).toBeLessThan(4.5)
    // What the ceiling would have to be for those to pass.
    expect(1.05 / 4.5 - 0.05).toBeCloseTo(0.18333, 5)
    // And the house palette is already worse than any themed tenant can be.
    expect(relativeLuminance(DEFAULT_ACCENT_COLOR)).toBeGreaterThan(
      OG_MAX_BACKGROUND_LUMINANCE,
    )
    expect(contrastRatio('#FFFFFF', DEFAULT_ACCENT_COLOR)).toBeLessThan(3)
  })
})

describe('HOUSE_OG_PAIR', () => {
  it('is the shared branding default, not a second copy of the hexes', () => {
    expect(HOUSE_OG_PAIR.primary).toBe(DEFAULT_PRIMARY_COLOR)
    expect(HOUSE_OG_PAIR.accent).toBe(DEFAULT_ACCENT_COLOR)
  })
})
