import { describe, expect, it } from 'vitest'
import {
  channelFormat,
  croppedSize,
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

describe('croppedSize: the size an image is posted at', () => {
  it('keeps the pixels inside the stored crop; no crop, a degenerate one or no size leaves them', () => {
    const crop = { top: 0.1, bottom: 0.1, left: 0.25, right: 0.25 }
    expect(croppedSize({ width: 2000, height: 1000, crop })).toEqual({
      width: 1000,
      height: 800,
    })
    expect(croppedSize({ width: 2000, height: 1000, crop: null })).toEqual({
      width: 2000,
      height: 1000,
    })
    expect(
      croppedSize({
        width: 2000,
        height: 1000,
        crop: { top: 0, bottom: 0, left: 0.6, right: 0.6 },
      }),
    ).toEqual({ width: 2000, height: 1000 })
    expect(croppedSize({ width: null, height: null, crop })).toEqual({
      width: null,
      height: null,
    })
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
  const PICK = 'Check the crop, or pick a landscape (1200×628) entry.'
  const upload = (width: number, height: number) => ({
    format: shapeFormat(width, height),
    size: { width, height },
  })

  it("is silent for the Channel's own Format, and for a Channel without one", () => {
    expect(
      formatMismatchWarning('linkedin', { format: 'landscape' }),
    ).toBeNull()
    expect(formatMismatchWarning('bluesky', { format: 'square' })).toBeNull()
    expect(formatMismatchWarning('x', { format: 'portrait' })).toBeNull()
  })

  it("names LinkedIn's 1.91:1 crop for a square or portrait entry of unknown size", () => {
    expect(formatMismatchWarning('linkedin', { format: 'square' })).toBe(
      `LinkedIn posts go out cropped to 1.91:1, so this image loses its top and bottom. ${PICK}`,
    )
    expect(formatMismatchWarning('linkedin', { format: 'portrait' })).toBe(
      `LinkedIn posts go out cropped to 1.91:1, so this image loses its top and bottom. ${PICK}`,
    )
  })

  it('a studio card goes by its Format, and says how much from its pixels', () => {
    // At its Format's pixels: LinkedIn's own shape, nothing to say.
    expect(
      formatMismatchWarning('linkedin', {
        format: 'landscape',
        size: { width: 1200, height: 628 },
        studio: true,
      }),
    ).toBeNull()
    expect(
      formatMismatchWarning('linkedin', {
        format: 'square',
        size: { width: 1080, height: 1080 },
        studio: true,
      }),
    ).toBe(
      `LinkedIn posts go out cropped to 1.91:1, so this image loses about 48% of its height (top and bottom). ${PICK}`,
    )
    // Saved before Formats, so it reads as square, but it is 2:1: its sides go.
    expect(
      formatMismatchWarning('linkedin', {
        format: 'square',
        size: { width: 2000, height: 1000 },
        studio: true,
      }),
    ).toBe(
      `LinkedIn posts go out cropped to 1.91:1, so this image loses about 5% of its width (sides). ${PICK}`,
    )
  })

  it('an upload ranked landscape still warns when the crop takes more than 10%', () => {
    expect(formatMismatchWarning('linkedin', upload(4000, 1000))).toBe(
      `LinkedIn posts go out cropped to 1.91:1, so this image loses about 52% of its width (sides). ${PICK}`,
    )
    expect(formatMismatchWarning('linkedin', upload(1500, 1000))).toBe(
      `LinkedIn posts go out cropped to 1.91:1, so this image loses about 21% of its height (top and bottom). ${PICK}`,
    )
  })

  it('an upload within 10% of 1.91:1 is silent, 16:9 included (it loses 7%)', () => {
    expect(formatMismatchWarning('linkedin', upload(1200, 628))).toBeNull()
    expect(formatMismatchWarning('linkedin', upload(1600, 900))).toBeNull()
    expect(formatMismatchWarning('linkedin', upload(2000, 1000))).toBeNull()
  })

  it('says Bluesky does not crop a landscape or portrait entry', () => {
    expect(formatMismatchWarning('bluesky', { format: 'landscape' })).toBe(
      'Bluesky does not crop images: this one is posted at its own shape rather than square.',
    )
    expect(formatMismatchWarning('bluesky', upload(1080, 1350))).toBe(
      'Bluesky does not crop images: this one is posted at its own shape rather than square.',
    )
  })
})
