import { describe, expect, it, vi } from 'vitest'

// `vitest.config.ts` aliases `@sanity/image-url` to a chainable stub for the
// whole suite; the URL assertions below are about the REAL builder's `rect`
// encoding, so this file loads the real package the way
// `__tests__/lib/openbadges/jwt-real-crypto.test.ts` defeats the `jose` alias.
vi.mock('@sanity/image-url', async () => {
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  return import(pathToFileURL(require.resolve('@sanity/image-url')).href)
})
import {
  defaultCropRect,
  matchesAspect,
  renditionRect,
  renditionUrl,
  type ImageAsset,
} from '../rendition'

const wide: ImageAsset = {
  assetId: 'image-0123456789abcdef0123456789abcdef01234567-2000x1000-jpg',
  width: 2000,
  height: 1000,
}

const tall: ImageAsset = { ...wide, width: 1000, height: 2000 }

describe('defaultCropRect', () => {
  it('returns the whole image when the platform does not crop', () => {
    expect(defaultCropRect(wide, null)).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    })
  })

  it('crops a wide image to a square centred on the image when there is no hotspot', () => {
    expect(defaultCropRect(wide, 1)).toEqual({
      x: 0.25,
      y: 0,
      width: 0.5,
      height: 1,
    })
  })

  it('centres the crop on the hotspot', () => {
    // Hotspot at the right edge: the window slides right and clamps.
    expect(
      defaultCropRect({ ...wide, hotspot: { x: 0.9, y: 0.5 } }, 1),
    ).toEqual({ x: 0.5, y: 0, width: 0.5, height: 1 })
    expect(
      defaultCropRect({ ...wide, hotspot: { x: 0.6, y: 0.5 } }, 1),
    ).toEqual({ x: 0.35, y: 0, width: 0.5, height: 1 })
  })

  it('crops a tall image vertically', () => {
    expect(defaultCropRect(tall, 1)).toEqual({
      x: 0,
      y: 0.25,
      width: 1,
      height: 0.5,
    })
  })

  it('stays inside the Studio crop when one is set', () => {
    // Studio crop trims the left 20%; the square window is taken from the rest.
    const rect = defaultCropRect(
      { ...wide, crop: { left: 0.2, top: 0, right: 0, bottom: 0 } },
      1,
    )
    expect(rect).toEqual({ x: 0.35, y: 0, width: 0.5, height: 1 })
  })
})

describe('matchesAspect', () => {
  it('accepts a window of the platform aspect and refuses another', () => {
    expect(matchesAspect(wide, { x: 0, y: 0, width: 0.5, height: 1 }, 1)).toBe(
      true,
    )
    expect(
      matchesAspect(wide, { x: 0, y: 0, width: 0.5, height: 0.5 }, 1),
    ).toBe(false)
    expect(matchesAspect(wide, { x: 0, y: 0, width: 1, height: 1 }, null)).toBe(
      true,
    )
  })
})

describe('renditionRect', () => {
  it('prefers a per-variant override', () => {
    const override = { x: 0.1, y: 0.1, width: 0.4, height: 0.8 }
    expect(renditionRect(wide, 1, override)).toEqual(override)
  })

  it('falls back to the default when the override is malformed', () => {
    expect(
      renditionRect(wide, 1, { x: 0.9, y: 0, width: 0.5, height: 1 }),
    ).toEqual({ x: 0.25, y: 0, width: 0.5, height: 1 })
  })
})

describe('renditionUrl', () => {
  it('runs against the real builder, not the suite-wide stub', () => {
    const url = renditionUrl(wide, { x: 0, y: 0, width: 1, height: 1 })
    expect(url).not.toContain('/images/mock/')
  })

  it('builds a CDN URL with the pixel rect and width cap', () => {
    const url = renditionUrl(
      wide,
      { x: 0.25, y: 0, width: 0.5, height: 1 },
      { maxWidth: 800 },
    )
    const parsed = new URL(url)
    expect(parsed.hostname).toBe('cdn.sanity.io')
    expect(
      parsed.pathname.endsWith(
        '/0123456789abcdef0123456789abcdef01234567-2000x1000.jpg',
      ),
    ).toBe(true)
    expect(parsed.searchParams.get('rect')).toBe('500,0,1000,1000')
    expect(parsed.searchParams.get('w')).toBe('800')
  })

  it('returns an empty string for an id that is not one of ours', () => {
    expect(
      renditionUrl(
        { ...wide, assetId: 'https://evil.example/x.jpg' },
        {
          x: 0,
          y: 0,
          width: 1,
          height: 1,
        },
      ),
    ).toBe('')
  })
})
