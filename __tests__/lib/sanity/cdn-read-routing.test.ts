/**
 * WHICH CLIENT does each hot public read path actually use?
 *
 * `clientReadCached` and `clientReadUncached` are interchangeable at every call
 * site: same token, same access rights, same return type, same signature. The
 * ONLY difference is the host — and therefore which of Sanity's two separately
 * metered quotas the request bills. That makes a regression here completely
 * invisible: swapping the identifier back changes no output, no type, and no
 * existing assertion. It just quietly moves traffic onto the quota that is
 * near its limit.
 *
 * So the guard has to be about the IDENTITY OF THE CLIENT THAT RAN, which is
 * why each client below gets its own spy instead of the usual shared
 * `fetchMock`. Each case asserts BOTH that the CDN client ran AND that the
 * live-API client did not — a one-sided assertion would still pass if a call
 * site started reading through both.
 *
 * The inverse cases matter just as much: the homepage composer preview MUST
 * stay on the live API, because it exists to show an organizer the edit they
 * just saved. A future "let's cache this too" would break read-your-writes with
 * no failing test unless that direction is pinned as well.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const HOST = 'example.com'
const CONFERENCE_ID = 'conference-1'

const CONFERENCE = {
  _id: CONFERENCE_ID,
  title: 'Example Conf',
  // Must contain the host or the routability gate nulls the conference out and
  // the sponsor/gallery branches never run.
  domains: [HOST],
}

/**
 * Every client resolves a query to a plausible shape, so a case fails because
 * the WRONG CLIENT ran — never because a stub returned nothing and the code
 * bailed early. If these returned `undefined`, a mis-routed read and a crashed
 * read would look identical.
 */
function respond(query: unknown) {
  const q = String(query)
  if (q.includes('sponsorForConference')) return []
  if (q.includes('_type == "galleryImage"')) return []
  if (q.includes('_type == "speaker"')) return { name: 'A Speaker' }
  return CONFERENCE
}

// Rest parameters so the recorded calls keep BOTH the query and the params —
// the scoping assertions below read `calls[0][1]`, which a one-arity stub
// would silently drop.
const cdnFetch = vi.fn(async (...args: unknown[]) => respond(args[0]))
const liveFetch = vi.fn(async (...args: unknown[]) => respond(args[0]))
const writeFetch = vi.fn(async (...args: unknown[]) => respond(args[0]))

vi.mock('@/lib/sanity/client', () => ({
  clientReadCached: { fetch: (...a: unknown[]) => cdnFetch(...a) },
  clientReadUncached: { fetch: (...a: unknown[]) => liveFetch(...a) },
  clientWrite: { fetch: (...a: unknown[]) => writeFetch(...a) },
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: HOST }),
}))

vi.mock('next/cache', () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  revalidateTag: () => {},
}))

vi.mock('@/lib/domain-verification/routing', () => ({
  isHostRoutable: async () => true,
}))

beforeEach(() => {
  cdnFetch.mockClear()
  liveFetch.mockClear()
  writeFetch.mockClear()
})

describe('the conference document read behind every public page render', () => {
  it('reads through the CDN client, never the write client', async () => {
    const { getConferenceForDomain } = await import('@/lib/conference/sanity')

    await getConferenceForDomain(HOST)

    expect(cdnFetch).toHaveBeenCalledTimes(1)
    // This read used to run on a WRITE token against the live API on every
    // public page render, every OG route, the sitemap and the manifest.
    expect(writeFetch).not.toHaveBeenCalled()
    expect(liveFetch).not.toHaveBeenCalled()
  })

  it('scopes the tenant with an explicit GROQ parameter, not a baked-in literal', async () => {
    const { getConferenceForDomain } = await import('@/lib/conference/sanity')

    await getConferenceForDomain(HOST)

    // Load-bearing for the CDN specifically: a CDN response is cached against
    // the request URL, so two tenants share an entry only if they issue an
    // identical query. Scope must therefore travel as a PARAMETER (which is
    // part of that URL and discriminates the entry) and must never be derived
    // inside the query from ambient session state.
    const [query, params] = cdnFetch.mock.calls[0] as unknown as [
      string,
      unknown,
    ]
    expect(params).toMatchObject({ domain: HOST })
    expect(query).toContain('$domain')
    expect(query).not.toContain(HOST)
  })

  it('keeps the admin composer preview on the live API for read-your-writes', async () => {
    const { getConferenceForDomain } = await import('@/lib/conference/sanity')

    await getConferenceForDomain(HOST, { uncached: true })

    expect(liveFetch).toHaveBeenCalledTimes(1)
    expect(cdnFetch).not.toHaveBeenCalled()
  })
})

describe('the public sponsor band', () => {
  it('reads through the CDN client by default', async () => {
    const { getPublicSponsorsForConference } =
      await import('@/lib/sponsor-crm/sanity')

    await getPublicSponsorsForConference(CONFERENCE_ID)

    expect(cdnFetch).toHaveBeenCalledTimes(1)
    expect(liveFetch).not.toHaveBeenCalled()

    const [query, params] = cdnFetch.mock.calls[0] as unknown as [
      string,
      unknown,
    ]
    expect(params).toEqual({ conferenceId: CONFERENCE_ID })
    expect(query).toContain('$conferenceId')
    expect(query).not.toContain(CONFERENCE_ID)
  })

  it('falls back to the live API when the caller opts out', async () => {
    const { getPublicSponsorsForConference } =
      await import('@/lib/sponsor-crm/sanity')

    await getPublicSponsorsForConference(CONFERENCE_ID, { useCache: false })

    expect(liveFetch).toHaveBeenCalledTimes(1)
    expect(cdnFetch).not.toHaveBeenCalled()
  })
})

describe('a full public render that asks for sponsors', () => {
  it('issues no live-API read at all', async () => {
    const { getConferenceForDomain } = await import('@/lib/conference/sanity')

    await getConferenceForDomain(HOST, { sponsors: true })

    // Two reads on this path — the conference document and the sponsor band —
    // and both must land on the CDN quota. Asserting the live/write spies are
    // untouched is the whole point: it fails if EITHER read regresses.
    expect(cdnFetch).toHaveBeenCalledTimes(2)
    expect(liveFetch).not.toHaveBeenCalled()
    expect(writeFetch).not.toHaveBeenCalled()
  })

  it('sends both reads to the live API when the composer preview asks', async () => {
    const { getConferenceForDomain } = await import('@/lib/conference/sanity')

    await getConferenceForDomain(HOST, { sponsors: true, uncached: true })

    expect(liveFetch).toHaveBeenCalledTimes(2)
    expect(cdnFetch).not.toHaveBeenCalled()
  })
})

describe('the public speaker profile', () => {
  it('reads through the CDN client', async () => {
    const { getPublicSpeaker } = await import('@/lib/speaker/sanity')

    await getPublicSpeaker(CONFERENCE_ID, 'a-speaker')

    expect(cdnFetch).toHaveBeenCalledTimes(1)
    expect(liveFetch).not.toHaveBeenCalled()
  })
})

describe('the public gallery reads', () => {
  it('default to the CDN client', async () => {
    const { getGalleryImages } = await import('@/lib/gallery/sanity')

    await getGalleryImages({ conferenceId: CONFERENCE_ID })

    expect(cdnFetch).toHaveBeenCalledTimes(1)
    expect(liveFetch).not.toHaveBeenCalled()
  })

  it('honour an explicit opt-out back to the live API', async () => {
    const { getGalleryImages } = await import('@/lib/gallery/sanity')

    await getGalleryImages({ conferenceId: CONFERENCE_ID }, { useCache: false })

    expect(liveFetch).toHaveBeenCalledTimes(1)
    expect(cdnFetch).not.toHaveBeenCalled()
  })
})
