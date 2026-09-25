import { describe, expect, it } from 'vitest'
import { isSoftOnSocial, sniffImageType } from './image-type'

const bytes = (...b: number[]) => new Uint8Array(b)
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))

describe('sniffImageType reads the real type from the first bytes', () => {
  it('PNG', () => {
    expect(
      sniffImageType(
        bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0),
      ),
    ).toBe('image/png')
  })
  it('JPEG', () => {
    expect(
      sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0)),
    ).toBe('image/jpeg')
  })
  it('WebP', () => {
    expect(
      sniffImageType(bytes(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBP'))),
    ).toBe('image/webp')
  })
  it.each([
    ['a GIF', bytes(...ascii('GIF89a'), 0, 0, 0, 0, 0, 0)],
    ['an SVG', bytes(...ascii('<svg xmlns="h'))],
    [
      'a WAV (RIFF but not WEBP)',
      bytes(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WAVE')),
    ],
    ['a PDF', bytes(...ascii('%PDF-1.7 abcd'))],
    ['a truncated PNG header', bytes(0x89, 0x50, 0x4e)],
    ['nothing', bytes()],
  ])('refuses %s', (_, input) => {
    expect(sniffImageType(input)).toBeNull()
  })
})

describe('isSoftOnSocial', () => {
  it('warns when the SHORT side is under 1080 px', () => {
    expect(isSoftOnSocial({ width: 1920, height: 1079 })).toBe(true)
    expect(isSoftOnSocial({ width: 1024, height: 1024 })).toBe(true)
  })
  it('does not warn at 1080 or above', () => {
    expect(isSoftOnSocial({ width: 1080, height: 1350 })).toBe(false)
    expect(isSoftOnSocial({ width: 4000, height: 1080 })).toBe(false)
  })
  it('does not warn when the size is unknown', () => {
    expect(isSoftOnSocial(null)).toBe(false)
    expect(isSoftOnSocial({ width: 0, height: 0 })).toBe(false)
    expect(isSoftOnSocial({ width: null, height: 900 })).toBe(false)
  })
})
