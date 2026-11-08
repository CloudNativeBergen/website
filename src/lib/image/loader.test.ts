import { describe, expect, it } from 'vitest'
import imageLoader from './loader'

const ASSET = 'https://cdn.sanity.io/images/p/d/abc-800x600.jpg'
const params = (u: string) => Object.fromEntries(new URL(u).searchParams)

describe('imageLoader', () => {
  it('resizes Sanity images on the Sanity CDN', () => {
    expect(params(imageLoader({ src: ASSET, width: 640, quality: 80 }))).toEqual(
      { w: '640', q: '80', fit: 'max', auto: 'format' },
    )
  })

  it('defaults quality to 75', () => {
    expect(params(imageLoader({ src: ASSET, width: 256 })).q).toBe('75')
  })

  it('keeps crop/hotspot params and replaces w instead of appending', () => {
    const src = `${ASSET}?rect=10,20,300,300&fp-x=0.4&w=96&h=48&fit=crop&auto=format&q=90`
    const out = imageLoader({ src, width: 192 })
    expect(params(out)).toEqual({
      rect: '10,20,300,300',
      'fp-x': '0.4',
      w: '192',
      h: '96',
      fit: 'crop',
      auto: 'format',
      q: '90',
    })
    expect(out.match(/[?&]w=/g)).toHaveLength(1)
  })

  it('never adds auto=format to a Sanity SVG', () => {
    const out = imageLoader({
      src: 'https://cdn.sanity.io/images/p/d/logo-100x40.svg',
      width: 128,
    })
    expect(params(out).auto).toBeUndefined()
    expect(params(out).w).toBe('128')
  })

  it.each([
    '/images/default-avatar.png',
    '/_next/static/media/icon.123.svg',
    'https://avatars.githubusercontent.com/u/1?v=4',
    'data:image/svg+xml;base64,PHN2Zy8+',
  ])('passes %s through unchanged', (src) => {
    expect(imageLoader({ src, width: 64 })).toBe(src)
  })
})
