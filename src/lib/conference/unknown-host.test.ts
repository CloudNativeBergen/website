import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * REGRESSION (#616): the unknown-host branch of `getConferenceForDomain` used to
 * fetch gallery images UNSCOPED — "conference not found → show everything" — so
 * any Host that resolved to no conference (a stray DNS record, a preview URL, a
 * scanner) was served every tenant's photos. An unresolvable tenant must get
 * NOTHING.
 */

const conferenceFetchMock = vi.fn()
vi.mock('../sanity/client', () => ({
  clientWrite: { fetch: (...args: unknown[]) => conferenceFetchMock(...args) },
  // The conference-by-domain read runs on the CDN client; the `uncached: true`
  // branch runs on the live one. Both resolve to the same mock here because
  // these cases are about resolution STATUS, not about which quota was billed
  // (`__tests__/lib/sanity/cdn-read-routing.test.ts` covers that).
  clientReadCached: {
    fetch: (...args: unknown[]) => conferenceFetchMock(...args),
  },
  clientReadUncached: {
    fetch: (...args: unknown[]) => conferenceFetchMock(...args),
  },
}))

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}))

const getGalleryImagesMock = vi.fn((...args: unknown[]) => {
  void args
  return Promise.resolve([])
})
const getFeaturedGalleryImagesMock = vi.fn((...args: unknown[]) => {
  void args
  return Promise.resolve([])
})
vi.mock('@/lib/gallery/sanity', () => ({
  getGalleryImages: (...args: unknown[]) => getGalleryImagesMock(...args),
  getFeaturedGalleryImages: (...args: unknown[]) =>
    getFeaturedGalleryImagesMock(...args),
}))

vi.mock('@/lib/sponsor-crm/sanity', () => ({
  getPublicSponsorsForConference: vi.fn(async () => []),
}))

import { getConferenceForDomain } from './sanity'
import { isUnknownHost, isConferenceUnavailable } from './guard'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getConferenceForDomain — unknown host gets NO gallery (#616)', () => {
  it('does not issue ANY gallery read for a host that resolves to no conference', async () => {
    conferenceFetchMock.mockResolvedValue(null)

    const result = await getConferenceForDomain('nobody.example.com', {
      gallery: true,
    })

    expect(isUnknownHost(result)).toBe(true)
    expect(result.error).toBeInstanceOf(Error)
    // The decisive assertions: no gallery query ran, and nothing is rendered.
    expect(getGalleryImagesMock).not.toHaveBeenCalled()
    expect(getFeaturedGalleryImagesMock).not.toHaveBeenCalled()
    expect(result.conference.galleryImages).toEqual([])
    expect(result.conference.featuredGalleryImages).toEqual([])
  })

  it('featuredOnly on an unknown host is empty too', async () => {
    conferenceFetchMock.mockResolvedValue(null)

    const result = await getConferenceForDomain('nobody.example.com', {
      gallery: { featuredOnly: true, featuredLimit: 8 },
    })

    expect(getFeaturedGalleryImagesMock).not.toHaveBeenCalled()
    expect(result.conference.featuredGalleryImages).toEqual([])
  })

  it('a KNOWN host still gets its own conference-scoped gallery (unchanged)', async () => {
    conferenceFetchMock.mockResolvedValue({
      _id: 'conf-1',
      title: 'Cloud Native Days',
      domains: ['cnd.example'],
    })

    const result = await getConferenceForDomain('cnd.example', {
      gallery: { featuredLimit: 8, limit: 50 },
    })

    expect(result.error).toBeNull()
    // Every gallery read carries this conference's id — and the cache flag the
    // caller asked for (`uncached: false` here, the public pages' default; the
    // composer preview is the one caller that passes `true`).
    expect(getFeaturedGalleryImagesMock).toHaveBeenCalledWith(8, 'conf-1', {
      useCache: true,
    })
    expect(getGalleryImagesMock).toHaveBeenCalledWith(
      {
        limit: 50,
        conferenceId: 'conf-1',
      },
      { useCache: true },
    )
  })
})

/**
 * #848. The loader is where "we don't know" becomes representable. Every
 * downstream honesty fix rests on it classifying correctly here.
 */
describe('getConferenceForDomain — a failed read is not a missing conference', () => {
  it('classifies a thrown read as `unavailable`, never `not-found`', async () => {
    conferenceFetchMock.mockRejectedValue(new Error('ECONNREFUSED sanity.io'))

    const result = await getConferenceForDomain('live-tenant.example')

    expect(result.status).toBe('unavailable')
    expect(isConferenceUnavailable(result)).toBe(true)
    // The empty conference is IDENTICAL to the unknown-host one; only the
    // status tells them apart, which is exactly what the layout branches on.
    expect(result.conference._id).toBeUndefined()
    expect(isUnknownHost(result)).toBe(false)
  })

  it('classifies a successful miss as `not-found`', async () => {
    conferenceFetchMock.mockResolvedValue(null)

    const result = await getConferenceForDomain('nobody.example.com')

    expect(result.status).toBe('not-found')
    expect(isUnknownHost(result)).toBe(true)
    expect(isConferenceUnavailable(result)).toBe(false)
  })

  it('classifies a match as `resolved`', async () => {
    conferenceFetchMock.mockResolvedValue({
      _id: 'conf-1',
      title: 'Cloud Native Days',
      domains: ['cnd.example'],
    })

    const result = await getConferenceForDomain('cnd.example')

    expect(result.status).toBe('resolved')
    expect(isUnknownHost(result)).toBe(false)
    expect(isConferenceUnavailable(result)).toBe(false)
  })

  it('keeps a PARTIAL failure `resolved` — a secondary read is not the site', async () => {
    // The conference itself read fine; the gallery blew up afterwards. The
    // site must render, with the page's own error handling intact, not
    // collapse to an outage screen.
    conferenceFetchMock.mockResolvedValue({
      _id: 'conf-1',
      title: 'Cloud Native Days',
      domains: ['cnd.example'],
    })
    getFeaturedGalleryImagesMock.mockRejectedValueOnce(
      new Error('gallery read failed'),
    )

    const result = await getConferenceForDomain('cnd.example', {
      gallery: { featuredOnly: true },
    })

    expect(result.error).toBeInstanceOf(Error)
    expect(result.status).toBe('resolved')
    expect(isConferenceUnavailable(result)).toBe(false)
  })
})
