/**
 * `getConferenceForCurrentDomain({ gallery: true })` — how many gallery reads?
 *
 * This exists because a refactor that was MEANT to replace a hardcoded
 * `limit: 50` with `GALLERY_CONSTANTS.LIMITS.DEFAULT_GALLERY_LIMIT` left BOTH
 * calls in the same `Promise.all`, while the destructuring still bound only two
 * results. Every non-featured render therefore issued the gallery query twice
 * and threw one result away.
 *
 * The constant is itself 50, so the two calls were behaviourally identical and
 * nothing rendered differently — which is precisely why review kept sliding
 * past it and why the guard has to be a CALL COUNT. A duplicate whose result is
 * discarded is invisible to every assertion about output.
 */

import { GALLERY_CONSTANTS } from '@/lib/gallery/constants'

const HOST = 'example.com'

// Declared with a rest parameter so the module mock below can forward whatever
// the caller passed; the assertions are about the ARGUMENTS, so they must
// arrive intact rather than be swallowed by a zero-arity stub.
const getGalleryImages = vi.fn(async (..._args: unknown[]) => [])
const getFeaturedGalleryImages = vi.fn(async (..._args: unknown[]) => [])

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: HOST }),
}))

vi.mock('next/cache', () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  revalidateTag: () => {},
}))

vi.mock('@/lib/gallery/sanity', () => ({
  getGalleryImages: (...args: unknown[]) => getGalleryImages(...args),
  getFeaturedGalleryImages: (...args: unknown[]) =>
    getFeaturedGalleryImages(...args),
}))

vi.mock('@/lib/domain-verification/routing', () => ({
  isHostRoutable: async () => true,
}))

vi.mock('@/lib/sponsor-crm/sanity', () => ({
  getPublicSponsorsForConference: async () => [],
}))

// The conference document the domain resolves to. `domains` must contain the
// host or the routing gate would null it out and skip the gallery branch.
const CONFERENCE = {
  _id: 'conference-1',
  title: 'Example Conf',
  domains: [HOST],
}

// All THREE clients, not just the ones the module happens to use today.
// `getConferenceForDomain` swallows read errors and returns an empty
// conference, so a client missing from this mock does not surface as
// "undefined.fetch is not a function" — it surfaces as the gallery branch
// silently never running, i.e. as a confusing failure of the assertions below.
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { fetch: async () => CONFERENCE },
  clientReadCached: { fetch: async () => CONFERENCE },
  clientReadUncached: { fetch: async () => CONFERENCE },
}))

describe('getConferenceForCurrentDomain gallery fetching', () => {
  beforeEach(() => {
    getGalleryImages.mockClear()
    getFeaturedGalleryImages.mockClear()
  })

  it('reads the gallery exactly once per render', async () => {
    const { getConferenceForCurrentDomain } =
      await import('@/lib/conference/sanity')

    await getConferenceForCurrentDomain({ gallery: true })

    expect(getGalleryImages).toHaveBeenCalledTimes(1)
  })

  it('applies the shared default limit rather than a hardcoded one', async () => {
    const { getConferenceForCurrentDomain } =
      await import('@/lib/conference/sanity')

    await getConferenceForCurrentDomain({ gallery: true })

    // Pins the SHARED CONSTANT as the source of the limit, so a future change
    // to it cannot be silently undone by a hardcoded number reappearing here.
    // It does not — and cannot — catch the duplicate call: both copies passed
    // the same effective value. The call-count test above is what guards that.
    expect(getGalleryImages).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        limit: GALLERY_CONSTANTS.LIMITS.DEFAULT_GALLERY_LIMIT,
        conferenceId: CONFERENCE._id,
      }),
      expect.anything(),
    )
  })

  it('does not read the full gallery when only featured images are asked for', async () => {
    const { getConferenceForCurrentDomain } =
      await import('@/lib/conference/sanity')

    await getConferenceForCurrentDomain({ gallery: { featuredOnly: true } })

    expect(getGalleryImages).not.toHaveBeenCalled()
    expect(getFeaturedGalleryImages).toHaveBeenCalledTimes(1)
  })
})
