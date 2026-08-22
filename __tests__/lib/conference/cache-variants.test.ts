/**
 * THE CONFERENCE READ MUST NOT FORK ITS CACHE KEY ON CALLER FLAGS.
 *
 * `fetchConferenceData` is `'use cache'`, and the GROQ string is one of its
 * arguments — so it is part of the cache key. The query used to be composed
 * from the caller's option flags, which meant a domain held one cached copy of
 * the same document PER FLAG COMBINATION: twelve of them in production, each
 * re-read from Sanity on its own timer, in every region, all of them thrown
 * away together by a single `revalidateTag(conferenceTag(id))`. Sanity meters
 * REQUESTS, and this read is the project's largest line item against a quota
 * that is at 80%.
 *
 * That regression is completely invisible to every other test in the repo: a
 * flag that goes back to forking the query changes no output, no type and no
 * rendered page. It only multiplies the request count. So the guard has to
 * assert on the QUERY STRING IDENTITY across flag combinations, which is the
 * thing the cache key is actually built from.
 *
 * The second half pins the properties that a "just fetch everything once"
 * simplification would quietly destroy: the Host must stay an ARGUMENT to the
 * cached function (never read from `headers()` inside it, or one tenant's cache
 * entry is served on another tenant's domain), and both `domainTag` and
 * `conferenceTag` must stay on the entry.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const HOST = 'example.com'
const OTHER_HOST = 'other.example'
const CONFERENCE_ID = 'conference-1'
const OTHER_CONFERENCE_ID = 'conference-2'

const cacheTagSpy = vi.fn()
const cacheLifeSpy = vi.fn()

/**
 * Returns a document whose `_id` and `domains` follow the QUERY PARAMETERS, so
 * a test that mixes tenants fails on the wrong tenant's data rather than on a
 * fixture that was the same for everyone.
 */
function respond(args: unknown[]) {
  const params = args[1] as { domain?: string } | undefined
  const domain = params?.domain ?? HOST
  return {
    _id: domain === OTHER_HOST ? OTHER_CONFERENCE_ID : CONFERENCE_ID,
    title: `Conf for ${domain}`,
    domains: [domain],
  }
}

// Each client gets its OWN body. A `liveFetch` that delegated to `cdnFetch`
// would record a call on the CDN spy and make the routing assertions below
// pass or fail for the wrong reason.
const cdnFetch = vi.fn(async (...args: unknown[]) => respond(args))
const liveFetch = vi.fn(async (...args: unknown[]) => respond(args))

vi.mock('@/lib/sanity/client', () => ({
  clientReadCached: { fetch: (...a: unknown[]) => cdnFetch(...a) },
  clientReadUncached: { fetch: (...a: unknown[]) => liveFetch(...a) },
  clientWrite: { fetch: (...a: unknown[]) => cdnFetch(...a) },
}))

vi.mock('next/cache', () => ({
  cacheLife: (...a: unknown[]) => cacheLifeSpy(...a),
  cacheTag: (...a: unknown[]) => cacheTagSpy(...a),
  revalidateTag: () => {},
}))

// Deliberately THROWS. `fetchConferenceData` is a `'use cache'` body: it has no
// request scope, so reading the Host in there would be a tenant-isolation bug.
// If anything on this path starts calling `headers()` inside the cached
// function, the conference read fails loudly here instead of silently serving
// whichever tenant populated the entry.
vi.mock('next/headers', () => ({
  headers: async () => {
    throw new Error('headers() must not be reached from the cached read')
  },
}))

vi.mock('@/lib/domain-verification/routing', () => ({
  isHostRoutable: async () => true,
}))

vi.mock('@/lib/sponsor-crm/sanity', () => ({
  getPublicSponsorsForConference: async () => [],
}))

vi.mock('@/lib/gallery/sanity', () => ({
  getGalleryImages: async () => [],
  getFeaturedGalleryImages: async () => [],
}))

/** Every option combination that appears at a production call site. */
const SCHEDULE_FREE_COMBINATIONS = [
  {},
  { topics: true },
  { sponsors: true },
  { featuredSpeakers: true },
  { sponsorTiers: true },
  { organizers: true, sponsorTiers: true },
  { organizers: true, sponsorTiers: true, topics: true },
  { sponsors: true, sponsorTiers: true },
  { sponsors: true, sponsorTiers: true, organizers: true },
  { organizers: true, sponsors: true },
  { topics: true, gallery: true },
] as const

const SCHEDULE_COMBINATIONS = [
  { schedule: true },
  { schedule: true, confirmedTalksOnly: false },
  { organizers: true, schedule: true, featuredSpeakers: true },
  { organizers: true, schedule: true, topics: true, featuredSpeakers: true },
  {
    schedule: true,
    topics: true,
    sponsors: true,
    sponsorTiers: true,
    confirmedTalksOnly: false,
  },
  {
    organizers: true,
    sponsors: true,
    sponsorTiers: true,
    featuredSpeakers: true,
    featuredTalks: true,
    schedule: true,
    gallery: { featuredOnly: true },
  },
] as const

beforeEach(() => {
  cdnFetch.mockClear()
  liveFetch.mockClear()
  cacheTagSpy.mockClear()
  cacheLifeSpy.mockClear()
})

/** Run one flag combination and return the GROQ text it sent to Sanity. */
async function queryFor(options: Record<string, unknown>): Promise<string> {
  const { getConferenceForDomain } = await import('@/lib/conference/sanity')
  cdnFetch.mockClear()
  await getConferenceForDomain(HOST, options)
  // A combination that somehow issued no read would otherwise make every
  // comparison below trivially "equal" on `undefined`.
  expect(cdnFetch).toHaveBeenCalledTimes(1)
  return cdnFetch.mock.calls[0][0] as string
}

describe('conference read cache-key fragmentation', () => {
  it('issues ONE query text for every combination that needs no schedule', async () => {
    const queries = new Set<string>()
    for (const options of SCHEDULE_FREE_COMBINATIONS) {
      queries.add(await queryFor(options))
    }

    // The number is the assertion. Eleven distinct production call-site
    // combinations, one cache entry.
    expect(queries.size).toBe(1)
  })

  it('issues ONE query text for every combination that needs the schedule', async () => {
    const queries = new Set<string>()
    for (const options of SCHEDULE_COMBINATIONS) {
      queries.add(await queryFor(options))
    }

    expect(queries.size).toBe(1)
  })

  it('collapses the whole production matrix onto exactly two cache entries', async () => {
    const queries = new Set<string>()
    for (const options of [
      ...SCHEDULE_FREE_COMBINATIONS,
      ...SCHEDULE_COMBINATIONS,
    ]) {
      queries.add(await queryFor(options))
    }

    // Two, not one: the schedule tree is the heaviest section and only six of
    // ~153 call sites read it (see the tier note in `./query.ts`). Two, not
    // twelve: nothing else may fork the key.
    expect(queries.size).toBe(2)
  })

  it('does not put confirmedTalksOnly in the query — it is applied after the read', async () => {
    const confirmed = await queryFor({ schedule: true })
    const all = await queryFor({ schedule: true, confirmedTalksOnly: false })

    expect(confirmed).toBe(all)
    // The GROQ predicate this replaced. Its return would re-fork the key.
    expect(confirmed).not.toContain('talk->status ==')
  })

  it('keeps the schedule tier a strict superset of the core tier', async () => {
    // The two tiers must not drift into two independently-edited queries: a
    // field added to one and forgotten in the other is `undefined` at runtime,
    // never an error (AGENTS.md).
    const { CONFERENCE_QUERY_CORE, CONFERENCE_QUERY_FULL } =
      await import('@/lib/conference/query')
    const scheduleless = CONFERENCE_QUERY_FULL.replace(
      /,\n\s*"schedules": schedules\[\]->[\s\S]*?\| order\(date asc\)/,
      '',
    )

    expect(scheduleless).toBe(CONFERENCE_QUERY_CORE)
    expect(CONFERENCE_QUERY_FULL).toContain('"schedules": schedules[]->')
    expect(CONFERENCE_QUERY_CORE).not.toContain('schedules[]->')
  })
})

describe('tenant safety of the cached conference read', () => {
  it('takes the host as an argument, so two domains never share an entry', async () => {
    const { getConferenceForDomain } = await import('@/lib/conference/sanity')

    const one = await getConferenceForDomain(HOST, { schedule: true })
    const two = await getConferenceForDomain(OTHER_HOST, { schedule: true })

    // Same query text (the collapse), DIFFERENT parameters (the isolation).
    // The parameters are what keeps the two tenants on separate cache entries
    // now that the query no longer varies.
    expect(cdnFetch.mock.calls[0][0]).toBe(cdnFetch.mock.calls[1][0])
    expect(cdnFetch.mock.calls[0][1]).toMatchObject({ domain: HOST })
    expect(cdnFetch.mock.calls[1][1]).toMatchObject({ domain: OTHER_HOST })

    // And the resolved documents did not cross over.
    expect(one.conference._id).toBe(CONFERENCE_ID)
    expect(two.conference._id).toBe(OTHER_CONFERENCE_ID)
  })

  it('never bakes the host into the query text', async () => {
    const query = await queryFor({})

    expect(query).toContain('$domain')
    expect(query).toContain('$wildcardSubdomain')
    expect(query).not.toContain(HOST)
  })

  it('tags the entry with BOTH the domain and the resolved conference', async () => {
    const { getConferenceForDomain } = await import('@/lib/conference/sanity')

    await getConferenceForDomain(HOST)

    const tags = cacheTagSpy.mock.calls.map((c) => c[0])
    // `domainTag` is reachable before the read resolves (invalidation by host);
    // `conferenceTag` is what every conference mutation revalidates. Losing
    // either leaves a class of edit unable to reach this entry.
    expect(tags).toContain(`domain:${HOST}`)
    expect(tags).toContain(`sanity:conference-${CONFERENCE_ID}`)
  })

  it('keeps a longer window than an hour but no longer a hard ceiling than a day', async () => {
    const { getConferenceForDomain } = await import('@/lib/conference/sanity')

    await getConferenceForDomain(HOST)

    const profile = cacheLifeSpy.mock.calls[0][0] as {
      revalidate: number
      expire: number
    }
    // The request-count lever. Below 6h and the quota saving shrinks.
    expect(profile.revalidate).toBeGreaterThanOrEqual(60 * 60 * 6)
    // The safety bound. `cacheLife('days')` would put this at 604800, and the
    // speaker/talk mutations that never revalidate `conferenceTag` (plus the
    // absent Sanity Studio webhook) make that a week-long staleness bug.
    expect(profile.expire).toBeLessThanOrEqual(60 * 60 * 24)
  })

  it('reads through the CDN client, and the composer preview stays on the live API', async () => {
    const { getConferenceForDomain } = await import('@/lib/conference/sanity')

    await getConferenceForDomain(HOST)
    expect(cdnFetch).toHaveBeenCalledTimes(1)
    expect(liveFetch).not.toHaveBeenCalled()

    cdnFetch.mockClear()
    await getConferenceForDomain(HOST, { uncached: true })
    expect(liveFetch).toHaveBeenCalledTimes(1)
    expect(cdnFetch).not.toHaveBeenCalled()
  })
})
