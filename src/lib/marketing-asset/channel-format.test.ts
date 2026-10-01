import { describe, expect, it } from 'vitest'
import {
  channelFormat,
  entryFormat,
  formatMismatchWarning,
  shapeFormat,
} from './channel-format'

describe('channelFormat (spec §6)', () => {
  it('LinkedIn wants landscape, Bluesky square, any other Channel nothing', () => {
    expect(channelFormat('linkedin')).toBe('landscape')
    expect(channelFormat('bluesky')).toBe('square')
    expect(channelFormat('x')).toBeNull()
    expect(channelFormat(null)).toBeNull()
  })
})

describe('shapeFormat: an upload ranks by its shape', () => {
  it.each([
    [1080, 1080, 'square'],
    [1200, 628, 'landscape'],
    [1600, 900, 'landscape'], // 16:9
    [1500, 1000, 'landscape'], // 3:2 is nearer 1.91:1 than 1:1
    [1200, 900, 'square'], // 4:3 is nearer 1:1
    [1080, 1350, 'portrait'], // 4:5
    [1000, 1500, 'portrait'], // 2:3
    [960, 1000, 'square'],
    [4000, 1000, 'landscape'],
  ] as const)('%i×%i reads as %s', (width, height, format) => {
    expect(shapeFormat(width, height)).toBe(format)
  })

  it('an unknown size reads as square', () => {
    expect(shapeFormat(null, null)).toBe('square')
    expect(shapeFormat(1200, null)).toBe('square')
    expect(shapeFormat(0, 600)).toBe('square')
  })
})

describe('entryFormat', () => {
  const studio = (format: 'square' | 'landscape' | 'portrait') => ({
    tab: 'sponsors' as const,
    format,
    speakerId: null,
    sponsorId: null,
    project: null,
  })

  it("trusts the studio's Format over the pixels; an upload goes by shape", () => {
    expect(
      entryFormat({ studio: studio('square'), width: 1920, height: 1080 }),
    ).toBe('square')
    expect(
      entryFormat({ studio: studio('portrait'), width: 1080, height: 1350 }),
    ).toBe('portrait')
    expect(entryFormat({ studio: null, width: 1920, height: 1080 })).toBe(
      'landscape',
    )
    expect(entryFormat({ studio: null, width: null, height: null })).toBe(
      'square',
    )
  })
})

describe('formatMismatchWarning: warns, naming the crop', () => {
  it("is silent for the Channel's own Format, and for a Channel without one", () => {
    expect(formatMismatchWarning('linkedin', 'landscape')).toBeNull()
    expect(formatMismatchWarning('bluesky', 'square')).toBeNull()
    expect(formatMismatchWarning('x', 'portrait')).toBeNull()
  })

  it("names LinkedIn's 1.91:1 crop for a square or portrait entry", () => {
    expect(formatMismatchWarning('linkedin', 'square')).toBe(
      'LinkedIn posts go out cropped to 1.91:1, so this square image loses its top and bottom. Check the crop, or pick a landscape entry.',
    )
    expect(formatMismatchWarning('linkedin', 'portrait')).toBe(
      'LinkedIn posts go out cropped to 1.91:1, so this portrait image loses its top and bottom. Check the crop, or pick a landscape entry.',
    )
  })

  it('says Bluesky does not crop a landscape or portrait entry', () => {
    expect(formatMismatchWarning('bluesky', 'landscape')).toBe(
      'Bluesky does not crop images: this landscape one is posted at its own shape rather than square.',
    )
    expect(formatMismatchWarning('bluesky', 'portrait')).toBe(
      'Bluesky does not crop images: this portrait one is posted at its own shape rather than square.',
    )
  })
})
