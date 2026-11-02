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

import { getConferenceForDomain } from './sanity'

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

const apiReply = (conference: unknown) =>
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ data: { conference } })),
  )

describe('KONF_API_TENANTS', () => {
  it('flag off: Sanity only, no fetch', async () => {
    vi.stubEnv('KONF_API_TENANTS', '')
    const { conference } = await getConferenceForDomain('2026.example.com')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(conference.title).toBe('Sanity title')
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
