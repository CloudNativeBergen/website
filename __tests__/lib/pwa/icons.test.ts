import {
  ICON_SPECS,
  ICON_BG_NAVY,
  variantParams,
  composeIconSvg,
  renderIconPng,
  renderConferenceIconPng,
} from '@/lib/pwa/icons'
import { DEFAULT_LOGOMARK_SVG } from '@/lib/pwa/default-mark'

// PNG magic number: 89 50 4E 47 0D 0A 1A 0A
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function isPng(buf: Buffer): boolean {
  return buf.length > 8 && buf.subarray(0, 8).equals(PNG_MAGIC)
}

/** Read the `IHDR` width/height from a PNG buffer. */
function pngSize(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

// Path-based mark (no <rect>) so background-rect assertions are unambiguous.
const SAMPLE_MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><path d="M10 70 L50 10 L90 70 Z" fill="#3B82F6"/></svg>`

describe('variantParams', () => {
  it('any is transparent and generously sized', () => {
    const p = variantParams('any')
    expect(p.background).toBeNull()
    expect(p.markScale).toBeGreaterThan(0.7)
  })

  it('maskable is opaque navy and keeps the mark in the 80% safe circle', () => {
    const p = variantParams('maskable')
    expect(p.background).toBe(ICON_BG_NAVY)
    // The bounding-box diagonal must fit the 0.8-diameter safe circle.
    expect(p.markScale * Math.SQRT2).toBeLessThan(0.8)
  })

  it('apple is opaque navy', () => {
    expect(variantParams('apple').background).toBe(ICON_BG_NAVY)
  })
})

describe('composeIconSvg', () => {
  it('omits a background rect for the transparent "any" variant', () => {
    const svg = composeIconSvg(SAMPLE_MARK, { size: 192, variant: 'any' })
    expect(svg).not.toContain('<rect')
    expect(svg).toContain('width="192"')
    expect(svg).toContain('viewBox="0 0 192 192"')
  })

  it('paints an opaque navy background for maskable and apple', () => {
    for (const variant of ['maskable', 'apple'] as const) {
      const svg = composeIconSvg(SAMPLE_MARK, { size: 512, variant })
      expect(svg).toContain(`<rect`)
      expect(svg).toContain(`fill="${ICON_BG_NAVY}"`)
    }
  })

  it('centers and scales the mark via a transform group', () => {
    const svg = composeIconSvg(SAMPLE_MARK, { size: 200, variant: 'any' })
    expect(svg).toMatch(
      /<g transform="translate\([\d.]+ [\d.]+\) scale\([\d.]+\)">/,
    )
  })
})

describe('renderIconPng', () => {
  it('rasterizes each spec to a correctly sized PNG', () => {
    for (const [key, spec] of Object.entries(ICON_SPECS)) {
      const png = renderIconPng(DEFAULT_LOGOMARK_SVG, spec)
      expect(isPng(png), `spec ${key} should be a PNG`).toBe(true)
      expect(pngSize(png)).toEqual({ width: spec.size, height: spec.size })
    }
  })
})

describe('renderConferenceIconPng (fallback path)', () => {
  const spec = ICON_SPECS['192']

  it('uses the conference logomarkBright when present', () => {
    const png = renderConferenceIconPng(SAMPLE_MARK, spec)
    expect(isPng(png)).toBe(true)
    expect(pngSize(png).width).toBe(192)
  })

  it('falls back to the default mark when logomarkBright is missing', () => {
    for (const missing of [undefined, null, '', '   ']) {
      const png = renderConferenceIconPng(missing, spec)
      expect(isPng(png), `missing=${JSON.stringify(missing)}`).toBe(true)
    }
  })

  it('falls back to the default mark when the SVG is malformed', () => {
    const png = renderConferenceIconPng('<svg><not valid', spec)
    expect(isPng(png)).toBe(true)
    expect(pngSize(png).width).toBe(192)
  })
})
