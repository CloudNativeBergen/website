import { describe, it, expect } from 'vitest'
import { DARK_TINT_LIGHTNESS, shiftToLightness } from './color'

/* -------------------------------------------------------------------------- */
/* Independent reference implementations                                       */
/*                                                                             */
/* Deliberately NOT reusing anything from ./color: an assertion that reuses the */
/* code under test proves nothing. OKLab lightness is re-derived from the       */
/* published matrices, and contrast from the WCAG 2.x definition.              */
/* -------------------------------------------------------------------------- */

function channels(hex: string): [number, number, number] {
  const h = hex.slice(1)
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ]
}

const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4

/** OKLab L of a hex colour (perceptual lightness, 0..1). */
function oklabL(hex: string): number {
  const [r, g, b] = channels(hex).map(toLinear) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
}

/** WCAG 2.x relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(toLinear) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.x contrast ratio, 1..21. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** OKLCh chroma and hue (degrees); hue is null for an achromatic colour. */
function oklch(hex: string): { chroma: number; hue: number | null } {
  const [r, g, b] = channels(hex).map(toLinear) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const chroma = Math.hypot(A, B)
  return {
    chroma,
    hue:
      chroma < 0.004 ? null : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360,
  }
}

/** Every hue/lightness corner a tenant could realistically pick, plus extremes. */
const PALETTES = {
  'house blue': '#1d4ed8',
  'house cyan accent': '#06b6d4',
  'dark navy': '#0a1f44',
  'bright yellow': '#facc15',
  'saturated red': '#dc2626',
  'light pastel pink': '#fbcfe8',
  'deep purple': '#4c1d95',
  orange: '#f97316',
  'vivid magenta': '#ff00ff',
  'vivid green': '#00ff00',
  black: '#000000',
  white: '#ffffff',
} as const

/** Dark surfaces the app actually paints, lightest last (the hard case). */
const DARK_SURFACES = {
  'gray-950': '#030712',
  'gray-900': '#111827',
  'gray-800': '#1f2937',
  'gray-700': '#374151',
} as const

describe('shiftToLightness', () => {
  it('hits the requested OKLab lightness for every palette and target', () => {
    for (const hex of Object.values(PALETTES)) {
      for (const target of Object.values(DARK_TINT_LIGHTNESS)) {
        // 8-bit quantisation is the only error source; nothing is gamut-clipped.
        expect(oklabL(shiftToLightness(hex, target))).toBeCloseTo(target, 2)
      }
    }
  })

  it('preserves hue', () => {
    for (const hex of Object.values(PALETTES)) {
      const { hue } = oklch(hex)
      if (hue === null) continue // black/white carry no hue
      for (const target of Object.values(DARK_TINT_LIGHTNESS)) {
        const out = oklch(shiftToLightness(hex, target))
        expect(out.hue).not.toBeNull()
        // Signed angular difference, wrapped into (-180, 180].
        const delta = Math.abs((((out.hue as number) - hue + 540) % 360) - 180)
        // The 8-bit hex round-trip perturbs a·b by ~±0.002, which is a larger
        // ANGLE the smaller the chroma — a near-grey has almost no hue left to
        // preserve. Scale the tolerance accordingly instead of pretending a
        // pastel darkened to a near-neutral holds its hue to a degree.
        const tolerance = Math.max(2, (0.002 / out.chroma) * (180 / Math.PI))
        expect(delta, `${hex} @ ${target} (C=${out.chroma})`).toBeLessThan(
          tolerance,
        )
      }
    }
  })

  it('returns the colour itself when the target is its own lightness', () => {
    for (const hex of Object.values(PALETTES)) {
      const out = shiftToLightness(hex, oklabL(hex))
      // Round-trip through OKLab is exact to within 8-bit rounding.
      const [r, g, b] = channels(out)
      const [R, G, B] = channels(hex)
      expect(Math.abs(r - R) * 255).toBeLessThanOrEqual(1)
      expect(Math.abs(g - G) * 255).toBeLessThanOrEqual(1)
      expect(Math.abs(b - B) * 255).toBeLessThanOrEqual(1)
    }
  })

  it('collapses achromatic inputs to neutral greys rather than producing a hue', () => {
    expect(shiftToLightness('#000000', DARK_TINT_LIGHTNESS.surface)).toBe(
      shiftToLightness('#ffffff', DARK_TINT_LIGHTNESS.surface),
    )
    expect(
      oklch(shiftToLightness('#000000', DARK_TINT_LIGHTNESS.text)).hue,
    ).toBe(null)
  })

  it('emits lowercase 6-digit hex (a valid CSS custom-property value)', () => {
    for (const hex of Object.values(PALETTES)) {
      expect(shiftToLightness(hex, DARK_TINT_LIGHTNESS.deep)).toMatch(
        /^#[0-9a-f]{6}$/,
      )
    }
  })

  it('holds the target lightness across a dense colour sweep (gamut mapping never sacrifices L)', () => {
    // Out-of-gamut mixes are resolved by dropping chroma, never lightness, so
    // the achieved L must stay on target for EVERY possible tenant colour.
    for (let r = 0; r <= 255; r += 15) {
      for (let g = 0; g <= 255; g += 15) {
        for (let b = 0; b <= 255; b += 15) {
          const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
          for (const target of Object.values(DARK_TINT_LIGHTNESS)) {
            expect(
              oklabL(shiftToLightness(hex, target)),
              `${hex} @ ${target}`,
            ).toBeCloseTo(target, 2)
          }
        }
      }
    }
  })
})

describe('DARK_TINT_LIGHTNESS — reproduction of the hand-tuned house shades', () => {
  // These are what the `.dark` rules use as their `var()` fallback. The
  // transform does NOT have to reproduce them (an unthemed site never runs it),
  // but a tenant who stores the house colours should land next to them. Locking
  // the outputs also pins the transform against accidental change.
  const HOUSE_PRIMARY = '#1d4ed8'
  const HOUSE_ACCENT = '#06b6d4'

  it.each([
    ['surface', HOUSE_PRIMARY, DARK_TINT_LIGHTNESS.surface, '#163fb3'],
    ['deep', HOUSE_PRIMARY, DARK_TINT_LIGHTNESS.deep, '#11359a'],
    ['edge', HOUSE_PRIMARY, DARK_TINT_LIGHTNESS.edge, '#3565df'],
    ['text', HOUSE_PRIMARY, DARK_TINT_LIGHTNESS.text, '#a7c1f6'],
    ['accent', HOUSE_ACCENT, DARK_TINT_LIGHTNESS.accent, '#016071'],
  ] as const)('%s', (_name, source, target, expected) => {
    expect(shiftToLightness(source, target)).toBe(expected)
  })

  it.each([
    ['surface', HOUSE_PRIMARY, DARK_TINT_LIGHTNESS.surface, '#1e40af'],
    ['deep', HOUSE_PRIMARY, DARK_TINT_LIGHTNESS.deep, '#1e3a8a'],
    ['edge', HOUSE_PRIMARY, DARK_TINT_LIGHTNESS.edge, '#2563eb'],
    ['text', HOUSE_PRIMARY, DARK_TINT_LIGHTNESS.text, '#93c5fd'],
    ['accent', HOUSE_ACCENT, DARK_TINT_LIGHTNESS.accent, '#155e75'],
  ] as const)(
    '%s matches the house shade to within a shade step',
    (_name, source, target, house) => {
      // Same perceptual lightness by construction; the residual is chroma/hue,
      // where the hand-tuned Tailwind ramp desaturates faster than a linear
      // OKLab mix. Half a Tailwind step (~0.06 L) is the tolerance.
      const got = shiftToLightness(source, target)
      expect(oklabL(got)).toBeCloseTo(oklabL(house), 1)
    },
  )
})

describe('contrast guarantees for any tenant primary', () => {
  it('dark brand TEXT clears WCAG AA (4.5:1) on every dark surface the app paints', () => {
    for (const [name, hex] of Object.entries(PALETTES)) {
      const text = shiftToLightness(hex, DARK_TINT_LIGHTNESS.text)
      for (const [surfaceName, surface] of Object.entries(DARK_SURFACES)) {
        expect(
          contrast(text, surface),
          `${name} text on ${surfaceName}`,
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('dark brand text clears AAA (7:1) on gray-800 and darker', () => {
    for (const [name, hex] of Object.entries(PALETTES)) {
      const text = shiftToLightness(hex, DARK_TINT_LIGHTNESS.text)
      for (const surface of ['#030712', '#111827', '#1f2937']) {
        expect(contrast(text, surface), name).toBeGreaterThanOrEqual(7)
      }
    }
  })

  it('WHITE text clears AAA on the dark brand SURFACE for every primary', () => {
    // Brand-coloured buttons/badges are painted with white labels.
    for (const [name, hex] of Object.entries(PALETTES)) {
      const surface = shiftToLightness(hex, DARK_TINT_LIGHTNESS.surface)
      expect(contrast(surface, '#ffffff'), name).toBeGreaterThanOrEqual(7)
    }
  })

  it('keeps the surface/deep/edge tints ordered darkest → lightest', () => {
    for (const [name, hex] of Object.entries(PALETTES)) {
      const deep = oklabL(shiftToLightness(hex, DARK_TINT_LIGHTNESS.deep))
      const surface = oklabL(shiftToLightness(hex, DARK_TINT_LIGHTNESS.surface))
      const edge = oklabL(shiftToLightness(hex, DARK_TINT_LIGHTNESS.edge))
      const text = oklabL(shiftToLightness(hex, DARK_TINT_LIGHTNESS.text))
      expect(deep, name).toBeLessThan(surface)
      expect(surface, name).toBeLessThan(edge)
      expect(edge, name).toBeLessThan(text)
    }
  })
})

/**
 * Raised by adversarial review. The production caller gates on the same shape,
 * so none of these is reachable today — but slicing an unvalidated string
 * produced a *silently wrong colour* rather than an error, and a brand colour
 * that is quietly wrong is the one failure nobody notices.
 */
describe('shiftToLightness — malformed input', () => {
  const target = DARK_TINT_LIGHTNESS.surface

  it.each([
    ['empty', ''],
    ['no hash', '1d4ed8'],
    ['three-digit shorthand', '#fff'],
    ['five digits', '#12345'],
    ['seven digits', '#1d4ed80'],
    ['non-hex characters', '#gggggg'],
    ['a CSS colour name', 'rebeccapurple'],
    ['an injection attempt', '#000;} body{display:none'],
  ])('rejects %s rather than inventing a colour', (_label, value) => {
    expect(() => shiftToLightness(value, target)).toThrow(TypeError)
  })

  it('still accepts uppercase and surrounding whitespace', () => {
    expect(shiftToLightness('  #1D4ED8  ', target)).toBe(
      shiftToLightness('#1d4ed8', target),
    )
  })
})
