import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createImageUrlBuilder } from '@sanity/image-url'

import { speakerImageUrl } from './client'

// `@sanity/image-url` is aliased to a chainable mock builder in vitest.config.ts;
// `client.ts` builds one at import time, so every transform funnels through this
// single instance and its calls are inspectable.
function builder() {
  return vi.mocked(createImageUrlBuilder).mock.results[0].value as Record<
    string,
    ReturnType<typeof vi.fn>
  >
}

const SANITY_IMAGE = 'https://cdn.sanity.io/images/p/d/abc123-400x400.jpg'

beforeEach(() => {
  for (const method of ['image', 'width', 'height', 'fit', 'auto', 'url']) {
    builder()[method].mockClear()
  }
})

describe('speakerImageUrl', () => {
  it('asks the CDN to negotiate a format for browser-bound URLs', () => {
    speakerImageUrl(SANITY_IMAGE, { width: 640, height: 800, fit: 'crop' })

    expect(builder().auto.mock.calls).toEqual([['format']])
  })

  it('negotiates by default when no options are passed', () => {
    speakerImageUrl(SANITY_IMAGE)

    expect(builder().auto.mock.calls).toEqual([['format']])
  })

  it('omits it for server-side rasterizers that opt out', () => {
    speakerImageUrl(SANITY_IMAGE, {
      width: 500,
      height: 500,
      fit: 'crop',
      auto: false,
    })

    expect(builder().auto).not.toHaveBeenCalled()
    // The rest of the transform is untouched by the opt-out.
    expect(builder().width.mock.calls).toEqual([[500]])
    expect(builder().height.mock.calls).toEqual([[500]])
    expect(builder().fit.mock.calls).toEqual([['crop']])
  })

  it('leaves non-Sanity URLs (OAuth avatars) completely alone', () => {
    const external = 'https://avatars.githubusercontent.com/u/1?v=4'

    expect(speakerImageUrl(external)).toBe(external)
    expect(builder().auto).not.toHaveBeenCalled()
  })
})
