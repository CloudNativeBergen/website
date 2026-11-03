import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))
const sanityFetch = vi.fn()
vi.mock('../sanity/client', () => ({
  clientWrite: { fetch: (...a: unknown[]) => sanityFetch(...a) },
  clientReadCached: { fetch: (...a: unknown[]) => sanityFetch(...a) },
  clientReadUncached: { fetch: (...a: unknown[]) => sanityFetch(...a) },
}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
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
import { fetchKonfApiConference } from './konf-api'

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

describe('KONF_API_TENANTS', () => {
  it('flag off: Sanity only, no fetch', async () => {
    vi.stubEnv('KONF_API_TENANTS', '')
    const { conference } = await getConferenceForDomain('2026.example.com')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(conference.title).toBe('Sanity title')
  })

  it('uncached (admin) reads stay on Sanity', async () => {
    vi.stubEnv('KONF_API_TENANTS', 'conf-1')
    apiReply({ title: 'API title' })
    const { conference } = await getConferenceForDomain('2026.example.com', {
      uncached: true,
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(conference.title).toBe('Sanity title')
  })

  it('a title equal to the id is not merged', async () => {
    vi.stubEnv('KONF_API_TENANTS', 'conf-1')
    apiReply({ title: 'conf-1', city: 'Oslo' })
    const { conference } = await getConferenceForDomain('2026.example.com')
    expect(conference.title).toBe('Sanity title')
    expect(conference.city).toBe('Oslo')
  })

  it('an id mismatch falls back to Sanity', async () => {
    vi.stubEnv('KONF_API_TENANTS', 'conf-1')
    apiReply({ id: 'conf-other', title: 'API title' })
    const { conference } = await getConferenceForDomain('2026.example.com')
    expect(conference.title).toBe('Sanity title')
    expect(console.warn).toHaveBeenCalled()
  })

  it('other tenant listed: no fetch', async () => {
    vi.stubEnv('KONF_API_TENANTS', 'conf-other')
    await getConferenceForDomain('2026.example.com')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('flag on: merges API fields over Sanity', async () => {
    vi.stubEnv('KONF_API_TENANTS', ' org-1 ')
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
    expect(url).toBe('https://api.konf.app/graphql')
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
    vi.stubEnv('KONF_API_TENANTS', 'conf-1')
    const stored = [{ _type: 'homepageHero', _key: 'h', hidden: true }]
    sanityFetch.mockResolvedValue({ ...sanityDoc, homepageSections: stored })
    apiReply({ homepageSections: '[]' })
    const { conference } = await getConferenceForDomain('2026.example.com')
    expect(conference.homepageSections).toEqual(stored)
  })

  it('API error falls back to Sanity', async () => {
    vi.stubEnv('KONF_API_TENANTS', 'conf-1')
    fetchMock.mockResolvedValue(new Response('boom', { status: 502 }))
    const { conference, status } =
      await getConferenceForDomain('2026.example.com')
    expect(status).toBe('resolved')
    expect(conference.title).toBe('Sanity title')
    expect(console.warn).toHaveBeenCalled()
  })

  it('null conference falls back to Sanity', async () => {
    vi.stubEnv('KONF_API_TENANTS', 'conf-1')
    apiReply(null)
    const { conference } = await getConferenceForDomain('2026.example.com')
    expect(conference.title).toBe('Sanity title')
  })

  it('timeout falls back to Sanity', async () => {
    vi.stubEnv('KONF_API_TENANTS', 'conf-1')
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
