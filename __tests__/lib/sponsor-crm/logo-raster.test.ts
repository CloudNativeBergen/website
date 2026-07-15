import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { rasterizeLogoToPngDataUrl } from '@/lib/sponsor-crm/logo-raster'

const SAMPLE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40">' +
  '<rect width="120" height="40" fill="#1D4ED8"/>' +
  '<circle cx="20" cy="20" r="10" fill="white"/>' +
  '</svg>'

describe('rasterizeLogoToPngDataUrl', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('SVG rasterization', () => {
    it('rasterizes SVG markup to a PNG data URL', () => {
      const result = rasterizeLogoToPngDataUrl(SAMPLE_SVG)

      expect(result).toBeDefined()
      expect(result).toMatch(/^data:image\/png;base64,/)
      // The base64 payload should be non-trivial (a real PNG, not empty).
      const base64 = result!.replace(/^data:image\/png;base64,/, '')
      expect(base64.length).toBeGreaterThan(100)

      // Verify the decoded bytes start with the PNG magic number.
      const bytes = Buffer.from(base64, 'base64')
      expect(bytes.subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )
    })

    it('rasterizes SVG wrapped in an XML declaration', () => {
      const result = rasterizeLogoToPngDataUrl(
        `<?xml version="1.0" encoding="UTF-8"?>${SAMPLE_SVG}`,
      )
      expect(result).toMatch(/^data:image\/png;base64,/)
    })

    it('rasterizes SVG preceded by a DOCTYPE', () => {
      const result = rasterizeLogoToPngDataUrl(
        `<?xml version="1.0"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n${SAMPLE_SVG}`,
      )
      expect(result).toMatch(/^data:image\/png;base64,/)
    })

    it('rasterizes SVG preceded by a comment', () => {
      const result = rasterizeLogoToPngDataUrl(
        `<!-- Generator: some tool -->\n${SAMPLE_SVG}`,
      )
      expect(result).toMatch(/^data:image\/png;base64,/)
    })

    it('honours a custom rasterization width', () => {
      const narrow = rasterizeLogoToPngDataUrl(SAMPLE_SVG, { width: 60 })
      const wide = rasterizeLogoToPngDataUrl(SAMPLE_SVG, { width: 600 })
      // A larger raster width yields a larger PNG payload.
      expect(wide!.length).toBeGreaterThan(narrow!.length)
    })
  })

  describe('raster passthrough', () => {
    it('returns an existing PNG data URL unchanged', () => {
      const pngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAA='
      expect(rasterizeLogoToPngDataUrl(pngDataUrl)).toBe(pngDataUrl)
    })

    it('returns an existing JPEG data URL unchanged', () => {
      const jpegDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
      expect(rasterizeLogoToPngDataUrl(jpegDataUrl)).toBe(jpegDataUrl)
    })
  })

  describe('missing-logo fallback', () => {
    it('returns undefined for undefined input', () => {
      expect(rasterizeLogoToPngDataUrl(undefined)).toBeUndefined()
    })

    it('returns undefined for null input', () => {
      expect(rasterizeLogoToPngDataUrl(null)).toBeUndefined()
    })

    it('returns undefined for an empty / whitespace string', () => {
      expect(rasterizeLogoToPngDataUrl('')).toBeUndefined()
      expect(rasterizeLogoToPngDataUrl('   ')).toBeUndefined()
    })

    it('returns undefined and warns for non-SVG, non-raster input', () => {
      expect(rasterizeLogoToPngDataUrl('not an svg')).toBeUndefined()
      expect(warnSpy).toHaveBeenCalledOnce()
    })

    it('returns undefined and warns when the SVG cannot be parsed', () => {
      // Malformed SVG markup — resvg throws, and we must fall back gracefully.
      const result = rasterizeLogoToPngDataUrl('<svg><rect width="unclosed')
      expect(result).toBeUndefined()
      expect(warnSpy).toHaveBeenCalledOnce()
    })
  })
})
