import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * REGRESSION: the homepage asks for `{ featuredOnly: true }` with no
 * `featuredLimit`, and the old fallback in `getFeaturedGalleryImages` was
 * `limit || 1000` — an effectively unbounded read. Today's tenants feature few
 * photos so nothing burned, but the first photo-heavy tenant would have shipped
 * every featured image into the flight payload and rendered a carousel dot for
 * each one.
 */

const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadCached: { fetch: (...args: unknown[]) => fetchMock(...args) },
  clientReadUncached: { fetch: (...args: unknown[]) => fetchMock(...args) },
  clientWrite: { fetch: (...args: unknown[]) => fetchMock(...args) },
}))

vi.mock('@/lib/gallery/events', () => ({
  publishSpeakerTaggedEvent: vi.fn(),
}))

import { getFeaturedGalleryImages } from './sanity'
import { GALLERY_CONSTANTS } from './constants'

function lastParams(): Record<string, unknown> {
  const call = fetchMock.mock.calls.at(-1)
  return (call?.[1] ?? {}) as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockResolvedValue([])
})

describe('getFeaturedGalleryImages is bounded by default', () => {
  it('defaults an omitted limit to the featured-band size, not to "everything"', async () => {
    await getFeaturedGalleryImages(undefined, 'conf-1')

    // `$end` is `offset + limit`, and offset is 0 here.
    expect(lastParams().end).toBe(GALLERY_CONSTANTS.LIMITS.FEATURED_IMAGES)
    expect(lastParams().end).not.toBe(1000)
  })

  it('still honours an explicit larger limit', async () => {
    await getFeaturedGalleryImages(100, 'conf-1')

    expect(lastParams().end).toBe(100)
  })
})
