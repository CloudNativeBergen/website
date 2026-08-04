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
import { isUnknownHost } from './guard'

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
