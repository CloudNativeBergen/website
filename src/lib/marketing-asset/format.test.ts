import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STUDIO_FORMAT,
  STUDIO_FORMATS,
  STUDIO_FORMAT_IDS,
  studioFormatSchema,
} from './format'

describe('studio Formats (docs/MARKETING_STUDIO_FORMATS_SPEC.md §2)', () => {
  it('are exactly three, each at its platform-native pixel size', () => {
    expect(STUDIO_FORMAT_IDS).toEqual(['square', 'landscape', 'portrait'])
    expect(STUDIO_FORMATS).toEqual({
      square: { label: 'Square', width: 1080, height: 1080 },
      landscape: { label: 'Landscape', width: 1200, height: 628 },
      portrait: { label: 'Portrait', width: 1080, height: 1350 },
    })
  })

  it('all clear the 1080 px short-side warning and stay under Bluesky’s 2000 px', () => {
    for (const { width, height } of Object.values(STUDIO_FORMATS)) {
      expect(Math.min(width, height)).toBeGreaterThanOrEqual(628)
      expect(Math.max(width, height)).toBeLessThanOrEqual(2000)
    }
    // Landscape is the one Format whose short side is under 1080: LinkedIn's
    // own 1.91:1 size, accepted by the spec.
    expect(STUDIO_FORMATS.landscape.height).toBe(628)
  })

  it('reads anything without a Format as square (§6)', () => {
    expect(DEFAULT_STUDIO_FORMAT).toBe('square')
    expect(studioFormatSchema.parse('portrait')).toBe('portrait')
    expect(studioFormatSchema.safeParse('story').success).toBe(false)
    expect(studioFormatSchema.safeParse('').success).toBe(false)
  })
})
