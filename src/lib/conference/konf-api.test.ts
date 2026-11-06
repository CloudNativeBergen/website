import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('./konf-api', async (orig) => ({
  ...(await orig<object>()),
  rolloutFlags: (await import('../../../__tests__/helpers/rolloutFlags'))
    .fakeRolloutFlags,
}))
import { flagTenants } from '../../../__tests__/helpers/rolloutFlags'
const sanityFetch = vi.fn()
vi.mock('../sanity/client', () => ({
  clientWrite: { fetch: (...a: unknown[]) => sanityFetch(...a) },
  clientReadCached: { fetch: (...a: unknown[]) => sanityFetch(...a) },
  clientReadUncached: { fetch: (...a: unknown[]) => sanityFetch(...a) },
}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
// No real signing here: the members-only read only checks the key is set.
vi.mock('@/lib/konf-api/client', async (orig) => ({
  ...(await orig<typeof import('@/lib/konf-api/client')>()),
  konfApiHeaders: async (host: string) => ({
    'content-type': 'application/json',
    origin: `https://${host}`,
  }),
}))
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }))
vi.mock('@/lib/gallery/sanity', () => ({
  getGalleryImages: vi.fn(async () => []),
  getFeaturedGalleryImages: vi.fn(async () => []),
}))
vi.mock('@/lib/sponsor-crm/sanity', () => ({
  getPublicSponsorsForConference: vi.fn(async () => []),
}))

import { cacheLife, cacheTag } from 'next/cache'
import { getConferenceForDomain } from './sanity'
import { fetchKonfApiConference, TICKET_SETUP_FIELDS } from './konf-api'
import { isCfpOpen } from './state'

/**
 * `'use cache'` is a compiler directive that vitest does not transform, so the
 * cache is emulated (as in provisioning/cache/invalidate/coherence.test.ts):
 * memoize on the arguments, and store only when the body resolves. That is
 * Next's contract for a throwing body, not something proved here.
 */
const entries = new Map<string, unknown>()
async function cachedApiRead(host: string, id: string) {
  const key = `${host}|${id}`
  if (entries.has(key)) return entries.get(key)
  const value = await fetchKonfApiConference(host, id)
  entries.set(key, value)
  return value
}

const sanityDoc = {
  _id: 'conf-1',
  organization: { _ref: 'org-1' },
  title: 'Sanity title',
  city: 'Bergen',
  domains: ['2026.example.com'],
  cfpEmail: 'cfp@example.com',
  theme: { primaryColor: '#000000', accentColor: '#111111' },
}

const fetchMock = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  sanityFetch.mockResolvedValue(structuredClone(sanityDoc))
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const apiReply = (conference: Record<string, unknown> | null) =>
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        data: { conference: conference && { id: 'conf-1', ...conference } },
      }),
    ),
  )

describe('api_read', () => {
  it('flag off: Sanity only, no fetch', async () => {
    flagTenants('apiRead', '')
    const { conference } = await getConferenceForDomain('2026.example.com')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(conference.title).toBe('Sanity title')
  })

  it('uncached plus flagged with differing D1 gives D1', async () => {
    flagTenants('apiRead', 'conf-1')
    apiReply({ title: 'API title', city: 'Trondheim' })
    const { conference } = await getConferenceForDomain('2026.example.com', {
      uncached: true,
    })
    expect(fetchMock).toHaveBeenCalled()
    expect(conference.title).toBe('API title')
    expect(conference.city).toBe('Trondheim')
    expect(conference.cfpEmail).toBe('cfp@example.com')
  })

  it('uncached plus unflagged gives Sanity with no conference read', async () => {
    flagTenants('apiRead', '')
    const { conference } = await getConferenceForDomain('2026.example.com', {
      uncached: true,
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(conference.title).toBe('Sanity title')
    expect(conference.city).toBe('Bergen')
  })

  it('uncached plus error gives Sanity', async () => {
    flagTenants('apiRead', 'conf-1')
    fetchMock.mockResolvedValue(new Response('boom', { status: 502 }))
    const { conference, status } = await getConferenceForDomain(
      '2026.example.com',
      { uncached: true },
    )
    expect(status).toBe('resolved')
    expect(conference.title).toBe('Sanity title')
    expect(conference.city).toBe('Bergen')
    expect(console.warn).toHaveBeenCalled()
  })

  it('a title equal to the id is not merged', async () => {
    flagTenants('apiRead', 'conf-1')
    apiReply({ title: 'conf-1', city: 'Oslo' })
    const { conference } = await getConferenceForDomain('2026.example.com')
    expect(conference.title).toBe('Sanity title')
    expect(conference.city).toBe('Oslo')
  })

  it('an id mismatch falls back to Sanity', async () => {
    flagTenants('apiRead', 'conf-1')
    apiReply({ id: 'conf-other', title: 'API title' })
    const { conference } = await getConferenceForDomain('2026.example.com')
    expect(conference.title).toBe('Sanity title')
    expect(console.warn).toHaveBeenCalled()
  })

  it('preview without KONF_API_URL: no fetch, Sanity only', async () => {
    flagTenants('apiRead', 'org-1')
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('KONF_API_URL', '')
    const { conference } = await getConferenceForDomain('2026.example.com')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(conference.title).toBe('Sanity title')
  })

  it('preview with KONF_API_URL: calls it', async () => {
    flagTenants('apiRead', 'org-1')
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('KONF_API_URL', 'https://preview.example/graphql')
    apiReply({ title: 'API title' })
    await getConferenceForDomain('2026.example.com')
    expect(fetchMock.mock.calls[0][0]).toBe('https://preview.example/graphql')
  })

  it('other tenant listed: no fetch', async () => {
    flagTenants('apiRead', 'conf-other')
    await getConferenceForDomain('2026.example.com')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('flag on: merges API fields over Sanity', async () => {
    flagTenants('apiRead', ' org-1 ')
    apiReply({
      title: 'API title',
      city: null,
      primaryColor: '#ffffff',
      accentColor: null,
      socialLinks: ['https://x.example'],
      homepageSections: '[{"_type":"homepageHero","_key":"h"}]',
    })
    const { conference } = await getConferenceForDomain('2026.example.com')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.konf.app/graphql') // VERCEL_ENV unset
    expect(init.headers.origin).toBe('https://2026.example.com')
    expect(conference.title).toBe('API title')
    expect(conference.city).toBe('Bergen')
    expect(conference.cfpEmail).toBe('cfp@example.com')
    expect(conference.theme).toEqual({
      primaryColor: '#ffffff',
      accentColor: '#111111',
    })
    expect(conference.socialLinks).toEqual(['https://x.example'])
    expect(conference.homepageSections).toEqual([
      { _type: 'homepageHero', _key: 'h' },
    ])
  })

  it('an empty block list keeps the Sanity composition', async () => {
    flagTenants('apiRead', 'conf-1')
    const stored = [{ _type: 'homepageHero', _key: 'h', hidden: true }]
    sanityFetch.mockResolvedValue({ ...sanityDoc, homepageSections: stored })
    apiReply({ homepageSections: '[]' })
    const { conference } = await getConferenceForDomain('2026.example.com')
    expect(conference.homepageSections).toEqual(stored)
  })

  it('API error falls back to Sanity', async () => {
    flagTenants('apiRead', 'conf-1')
    fetchMock.mockResolvedValue(new Response('boom', { status: 502 }))
    const { conference, status } =
      await getConferenceForDomain('2026.example.com')
    expect(status).toBe('resolved')
    expect(conference.title).toBe('Sanity title')
    expect(console.warn).toHaveBeenCalled()
  })

  it('null conference falls back to Sanity', async () => {
    flagTenants('apiRead', 'conf-1')
    apiReply(null)
    const { conference } = await getConferenceForDomain('2026.example.com')
    expect(conference.title).toBe('Sanity title')
  })

  it('timeout falls back to Sanity', async () => {
    flagTenants('apiRead', 'conf-1')
    fetchMock.mockImplementation(
      (_: string, init: RequestInit) =>
        new Promise((_r, reject) =>
          init.signal!.addEventListener('abort', () =>
            reject(init.signal!.reason),
          ),
        ),
    )
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
      const c = new AbortController()
      setTimeout(() => c.abort(new Error('timeout')), 5)
      return c.signal
    })
    const { conference } = await getConferenceForDomain('2026.example.com')
    expect(timeout).toHaveBeenCalledWith(2000)
    expect(conference.title).toBe('Sanity title')
    expect(console.warn).toHaveBeenCalled()
  })
})

describe('fetchKonfApiConference caching', () => {
  beforeEach(() => entries.clear())

  it('uses the same cacheLife and tags as the Sanity conference read', async () => {
    await getConferenceForDomain('2026.example.com')
    const sanityTags = vi.mocked(cacheTag).mock.calls.map((c) => c[0])
    const sanityLife = vi.mocked(cacheLife).mock.calls[0][0]
    vi.mocked(cacheTag).mockClear()
    vi.mocked(cacheLife).mockClear()

    apiReply({ title: 'API title' })
    await fetchKonfApiConference('2026.example.com', 'conf-1')
    expect(vi.mocked(cacheTag).mock.calls.map((c) => c[0])).toEqual(sanityTags)
    expect(vi.mocked(cacheLife).mock.calls[0][0]).toBe(sanityLife)
  })

  it('a cached second read does not fetch', async () => {
    apiReply({ title: 'API title' })
    await cachedApiRead('2026.example.com', 'conf-1')
    await cachedApiRead('2026.example.com', 'conf-1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('a failed read throws, so it is not cached and the next read fetches', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 502 }))
    await expect(cachedApiRead('2026.example.com', 'conf-1')).rejects.toThrow()
    apiReply({ title: 'API title' })
    await expect(cachedApiRead('2026.example.com', 'conf-1')).resolves.toEqual({
      id: 'conf-1',
      title: 'API title',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('logs the real cause inside the cached body, before production redacts it', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 401 }))
    await expect(
      fetchKonfApiConference('2026.example.com', 'conf-1'),
    ).rejects.toThrow()
    expect(console.warn).toHaveBeenCalledWith(
      '[konf-api] read failed for 2026.example.com: Error: HTTP 401',
    )
  })

  it('an id mismatch throws inside the cached body, so it is not stored', async () => {
    apiReply({ id: 'conf-other' })
    await expect(cachedApiRead('2026.example.com', 'conf-1')).rejects.toThrow(
      'id mismatch',
    )
    expect(entries.size).toBe(0)
  })

  it.each(['[{"_type":', '{"_type":"homepageHero"}'])(
    'malformed homepageSections %s throws inside the cached body',
    async (homepageSections) => {
      apiReply({ homepageSections })
      await expect(
        cachedApiRead('2026.example.com', 'conf-1'),
      ).rejects.toThrow()
      expect(entries.size).toBe(0)
    },
  )

  it('a null conference throws too', async () => {
    apiReply(null)
    await expect(
      fetchKonfApiConference('2026.example.com', 'conf-1'),
    ).rejects.toThrow('conference is null')
  })
})

describe('lifecycleStatus from tenant-directory (#1997)', () => {
  /** One gateway answer carrying both root fields, as the gateway sends it. */
  function reply(lifecycle: unknown, conference: unknown = { id: 'conf-1' }) {
    fetchMock.mockImplementation(async () =>
      lifecycle instanceof Response
        ? lifecycle
        : new Response(
            JSON.stringify({
              data: { conference, conferenceLifecycle: lifecycle },
            }),
          ),
    )
  }
  const withSanity = (lifecycleStatus?: string) =>
    sanityFetch.mockResolvedValue({
      ...structuredClone(sanityDoc),
      lifecycleStatus,
    })

  it('unflagged: keeps Sanity and reads nothing', async () => {
    withSanity('cancelled')
    reply('live')
    const { conference } = await getConferenceForDomain('2026.example.com')
    expect(conference.lifecycleStatus).toBe('cancelled')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['cancelled', undefined, 'cancelled'],
    ['archived', 'cancelled', 'archived'],
    ['live', 'archived', undefined],
  ])('flagged: D1 %s over Sanity %s gives %s', async (d1, sanity, want) => {
    flagTenants('apiRead', 'conf-1')
    withSanity(sanity)
    reply(d1)
    const { conference } = await getConferenceForDomain('2026.example.com')
    expect(conference.lifecycleStatus).toBe(want)
  })

  it('flagged: merges even when the public conference read is null', async () => {
    flagTenants('apiRead', 'conf-1')
    withSanity(undefined)
    reply('cancelled', null)
    const { conference } = await getConferenceForDomain('2026.example.com')
    expect(conference.lifecycleStatus).toBe('cancelled')
    expect(conference.title).toBe('Sanity title')
    // One gateway call: the lifecycle rides the conference query.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('flagged: a null conference and a live lifecycle still falls back', async () => {
    flagTenants('apiRead', 'conf-1')
    withSanity('cancelled')
    reply('live', null)
    const { conference } = await getConferenceForDomain('2026.example.com')
    expect(conference.lifecycleStatus).toBe('cancelled')
  })

  it.each([
    ['an HTTP error', new Response('boom', { status: 502 })],
    [
      'a GraphQL error',
      new Response(JSON.stringify({ errors: [{ message: 'x' }] })),
    ],
    ['a null (draft) answer', null],
    ['an unknown value', 'bogus'],
  ])('flagged: %s keeps Sanity', async (_, d1) => {
    flagTenants('apiRead', 'conf-1')
    withSanity('archived')
    reply(d1)
    const { conference } = await getConferenceForDomain('2026.example.com')
    expect(conference.lifecycleStatus).toBe('archived')
  })
})

describe('settings phase 1 read flip (#2019)', () => {
  // Sanity has the CFP closed and registration off.
  const closed = {
    ...sanityDoc,
    cfpStartDate: '2000-01-01',
    cfpEndDate: '2000-02-01',
    registrationEnabled: false,
    ticketCustomization: { heroHeadline: 'H', showVanityMetrics: false },
  }
  beforeEach(() => {
    flagTenants('apiRead', 'conf-1')
    sanityFetch.mockResolvedValue(structuredClone(closed))
  })

  it.each([
    ['null', null],
    ['an impossible date', '2099-02-30'],
    ['an out-of-range date', '9999-99-99'],
    ['a datetime', '2099-12-31T00:00:00Z'],
    ['free text', 'soon'],
    ['a number', 4102444800000],
  ])('a D1 cfpEndDate of %s keeps the Sanity CFP closed', async (_, bad) => {
    apiReply({ cfpEndDate: bad, cfpStartDate: 'later' })
    const { conference } = await getConferenceForDomain('2026.example.com')
    expect(conference.cfpEndDate).toBe('2000-02-01')
    expect(conference.cfpStartDate).toBe('2000-01-01')
    expect(isCfpOpen(conference)).toBe(false)
  })

  it.each([
    ['null', null],
    ['a string', 'true'],
    ['a number', 1],
  ])(
    'a D1 registrationEnabled of %s keeps Sanity registration off',
    async (_, bad) => {
      apiReply({ registrationEnabled: bad })
      const { conference } = await getConferenceForDomain('2026.example.com')
      expect(conference.registrationEnabled).toBe(false)
    },
  )

  it('valid D1 values win: D1 is the source once Sanity stops being written', async () => {
    apiReply({
      cfpEndDate: '2099-12-31',
      registrationCloseDate: '2099-01-01',
      registrationEnabled: true,
      organizer: 'D1 Org',
      socialHashtag: '#d1',
      showVanityMetrics: true,
    })
    const { conference } = await getConferenceForDomain('2026.example.com')
    expect(isCfpOpen(conference)).toBe(true)
    expect(conference.registrationCloseDate).toBe('2099-01-01')
    expect(conference.registrationEnabled).toBe(true)
    expect(conference.organizer).toBe('D1 Org')
    expect(conference.socialHashtag).toBe('#d1')
    expect(conference.ticketCustomization).toEqual({
      heroHeadline: 'H',
      showVanityMetrics: true,
    })
  })

  it('never asks the cached anonymous read for members-only settings', async () => {
    apiReply({})
    await getConferenceForDomain('2026.example.com')
    const { query } = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(query).toContain('cfpEndDate')
    for (const f of [
      'organizerAddress',
      'organizerOrgNumber',
      'analyticsPirschCode',
      'travelSupportBudget',
    ])
      expect(query).not.toContain(f)
  })
})

describe('settings phase 3 read flip (#2080)', () => {
  // Sanity: workshop sign-up closed, early access for one type only.
  const closed = {
    ...sanityDoc,
    ticketingProvider: 'checkin',
    publicFreeTicketIds: [1],
    workshopRegistrationStart: '2000-01-01T08:00:00Z',
    workshopRegistrationEnd: '2000-02-01T08:00:00Z',
    workshopEarlyAccessTicketTypes: ['Sanity pass'],
    checkinCustomerId: 1,
    checkinEventId: 11,
    ticketCapacity: 100,
    ticketTypeRoles: [{ _key: 'k', typeName: 'Sanity', admits: true }],
  }
  const NOW = new Date('2026-06-01T00:00:00Z')
  // A fresh Response per call, with only the fields that query asked for, as
  // the gateway answers: the public and the members-only read both fetch.
  const apiReply = (conference: Record<string, unknown>) =>
    fetchMock.mockImplementation(async (_: unknown, init: RequestInit) => {
      const { query } = JSON.parse(String(init.body)) as { query: string }
      const asked = Object.fromEntries(
        Object.entries(conference).filter(([k]) =>
          new RegExp(`\\b${k}\\b`).test(query),
        ),
      )
      return new Response(
        JSON.stringify({ data: { conference: { id: 'conf-1', ...asked } } }),
      )
    })
  const read = (includeTicketSetup = false) =>
    getConferenceForDomain('2026.example.com', { includeTicketSetup })
  beforeEach(() => {
    vi.stubEnv('KONF_API_TENANTS', 'conf-1')
    sanityFetch.mockResolvedValue(structuredClone(closed))
  })

  it('a valid D1 vendor wins; a bad one keeps Sanity', async () => {
    apiReply({ ticketingProvider: 'tito' })
    expect((await read()).conference.ticketingProvider).toBe('tito')
    apiReply({ ticketingProvider: 'eventbrite' })
    expect((await read()).conference.ticketingProvider).toBe('checkin')
  })

  it('never reads the windows, early-access types or free tickets from D1: their writers can leave D1 ahead of Sanity', async () => {
    const { workshopRegistrationWindow } =
      await import('@/lib/workshop/registration-window')
    apiReply({
      publicFreeTicketIds: [7],
      workshopRegistrationStart: '2026-01-01T08:00:00Z',
      workshopRegistrationEnd: '2099-01-01T08:00:00Z',
      workshopEarlyAccessTicketTypes: ['D1 pass'],
    })
    const { conference } = await read(true)
    expect(conference.workshopRegistrationEnd).toBe('2000-02-01T08:00:00Z')
    expect(
      workshopRegistrationWindow(conference, { now: NOW, earlyAccess: true })
        .status,
    ).toBe('closed')
    expect(conference.workshopEarlyAccessTicketTypes).toEqual(['Sanity pass'])
    expect(conference.publicFreeTicketIds).toEqual([1])
    const queries = fetchMock.mock.calls.map(
      ([, init]) => JSON.parse(init.body).query as string,
    )
    for (const q of queries)
      for (const f of [
        'publicFreeTicketIds',
        'workshopRegistration',
        'workshopEarlyAccessTicketTypes',
      ])
        expect(q).not.toContain(f)
  })

  it('reads the members-only fields in a separate request, never in the cached anonymous query', async () => {
    vi.stubEnv('KONF_SITE_SIGNING_KEY', '{"kid":"k"}')
    apiReply({ ticketCapacity: 500 })
    await read(true)
    const queries = fetchMock.mock.calls.map(
      ([, init]) => JSON.parse(init.body).query as string,
    )
    const pub = queries.find((q) => q.includes('conferenceLifecycle'))!
    expect(pub).toContain('ticketingProvider')
    for (const f of [
      'checkinCustomerId',
      'ticketCapacity',
      'ticketTargetsEnabled',
      'workshopReminder',
    ])
      expect(pub).not.toContain(f)
    expect(queries.some((q) => q.includes('ticketTargetCurve'))).toBe(true)
  })

  it('a public read (no includeTicketSetup) neither fetches nor carries the members-only fields', async () => {
    vi.stubEnv('KONF_SITE_SIGNING_KEY', '{"kid":"k"}')
    apiReply({ ticketCapacity: 500 })
    const { conference } = await read()
    for (const k of TICKET_SETUP_FIELDS)
      expect(conference, k).not.toHaveProperty(k)
    const queries = fetchMock.mock.calls.map(
      ([, init]) => JSON.parse(init.body).query as string,
    )
    expect(queries.some((q) => q.includes('ticketCapacity'))).toBe(false)
  })

  describe('members-only fields, server side', () => {
    beforeEach(() => vi.stubEnv('KONF_SITE_SIGNING_KEY', '{"kid":"k"}'))

    it('valid D1 values win for capacity, targets and the customer id; the binding and roles stay on Sanity', async () => {
      apiReply({
        checkinCustomerId: 2,
        checkinEventId: 9,
        ticketCapacity: 500,
        ticketTargetsEnabled: true,
        ticketSalesStartDate: '2026-01-15',
        ticketTargetCurve: 'linear',
        ticketTargetMilestones: [
          { date: '2026-03-01', targetPercentage: 50, label: null },
        ],
        ticketTypeRoles: [{ typeName: 'D1', grantsWorkshop: true }],
      })
      const { conference } = await read(true)
      expect(conference.checkinCustomerId).toBe(2)
      expect(conference.ticketCapacity).toBe(500)
      expect(conference.ticketTargets).toEqual({
        enabled: true,
        salesStartDate: '2026-01-15',
        targetCurve: 'linear',
        milestones: [{ date: '2026-03-01', targetPercentage: 50, label: '' }],
      })
      expect(conference.checkinEventId).toBe(11)
      expect(conference.ticketTypeRoles).toEqual(closed.ticketTypeRoles)
    })

    it('a bad or null value keeps Sanity', async () => {
      apiReply({ ticketCapacity: -5, ticketTargetCurve: 'zigzag' })
      const { conference } = await read(true)
      expect(conference.ticketCapacity).toBe(100)
      expect(conference.ticketTargets).toBeUndefined()
    })

    it('a failed members-only read keeps Sanity and the public merge', async () => {
      fetchMock.mockImplementation(async (_: unknown, init: RequestInit) =>
        String(init.body).includes('ticketTargetCurve')
          ? new Response('boom', { status: 500 })
          : new Response(
              JSON.stringify({
                data: {
                  conference: { id: 'conf-1', ticketingProvider: 'tito' },
                },
              }),
            ),
      )
      const { conference } = await read(true)
      expect(conference.ticketingProvider).toBe('tito')
      expect(conference.ticketCapacity).toBe(100)
    })
  })

  it('an unflagged tenant never calls the gateway', async () => {
    vi.stubEnv('KONF_API_TENANTS', '')
    const { conference } = await read(true)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(conference.ticketingProvider).toBe('checkin')
    expect(conference.ticketCapacity).toBe(100)
  })
})
