import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))

const sanityFetch = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadCached: { fetch: (...args: unknown[]) => sanityFetch(...args) },
}))

import { cacheLife, cacheTag } from 'next/cache'
import { conferenceTag, domainTag } from '@/lib/cache/tags'
import {
  resolveConferenceVisibility,
  isConferenceUnlisted,
  CONFERENCE_VISIBILITY_VALUES,
  getDiscoveryVisibilityForDomain,
} from '../visibility'

describe('resolveConferenceVisibility — absent-means-live', () => {
  it('treats an ABSENT field as live (legacy conferences stay public)', () => {
    expect(resolveConferenceVisibility({})).toBe('live')
    expect(resolveConferenceVisibility({ visibility: undefined })).toBe('live')
    expect(resolveConferenceVisibility({ visibility: null })).toBe('live')
  })

  it('treats null/undefined conference as live', () => {
    expect(resolveConferenceVisibility(null)).toBe('live')
    expect(resolveConferenceVisibility(undefined)).toBe('live')
  })

  it('resolves an explicit "live" to live', () => {
    expect(resolveConferenceVisibility({ visibility: 'live' })).toBe('live')
  })

  it('resolves ONLY the explicit "unlisted" string to unlisted', () => {
    expect(resolveConferenceVisibility({ visibility: 'unlisted' })).toBe(
      'unlisted',
    )
  })

  it('treats any unknown value as live (fail-open to public per the rule)', () => {
    expect(resolveConferenceVisibility({ visibility: 'private' })).toBe('live')
    expect(resolveConferenceVisibility({ visibility: 'draft' })).toBe('live')
    expect(resolveConferenceVisibility({ visibility: '' })).toBe('live')
  })
})

describe('isConferenceUnlisted', () => {
  it('is true only for an explicit unlisted conference', () => {
    expect(isConferenceUnlisted({ visibility: 'unlisted' })).toBe(true)
  })

  it('is false for live, absent, null and unknown', () => {
    expect(isConferenceUnlisted({ visibility: 'live' })).toBe(false)
    expect(isConferenceUnlisted({})).toBe(false)
    expect(isConferenceUnlisted(null)).toBe(false)
    expect(isConferenceUnlisted({ visibility: 'nope' })).toBe(false)
  })
})

describe('CONFERENCE_VISIBILITY_VALUES', () => {
  it('lists both values, trial (unlisted) first', () => {
    expect([...CONFERENCE_VISIBILITY_VALUES]).toEqual(['unlisted', 'live'])
  })
})

describe('getDiscoveryVisibilityForDomain D1 gateway values and fallbacks (#1997)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  const sanityConf = {
    _id: 'conf-1',
    visibility: 'live',
    domains: ['conf.example.com'],
    organization: { _ref: 'org-1' },
  }

  it('flagged: differing D1 unlisted wins over Sanity live', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-1')
    sanityFetch.mockResolvedValueOnce(structuredClone(sanityConf))

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            conference: {
              id: 'conf-1',
              visibility: 'unlisted',
            },
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await getDiscoveryVisibilityForDomain('conf.example.com')
    expect(result).toEqual({ discoverable: false })
    expect(gatewayFetch).toHaveBeenCalled()
  })

  it('flagged: differing D1 live wins over Sanity unlisted', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-1')
    sanityFetch.mockResolvedValueOnce({
      ...structuredClone(sanityConf),
      visibility: 'unlisted',
    })

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            conference: {
              id: 'conf-1',
              visibility: 'live',
            },
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await getDiscoveryVisibilityForDomain('conf.example.com')
    expect(result).toEqual({ discoverable: true })
    expect(gatewayFetch).toHaveBeenCalled()
  })

  it('flagged: a malformed D1 visibility keeps Sanity unlisted', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-1')
    sanityFetch.mockResolvedValueOnce({
      ...structuredClone(sanityConf),
      visibility: 'unlisted',
    })
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              data: { conference: { id: 'conf-1', visibility: '' } },
            }),
          ),
        ),
    )

    const result = await getDiscoveryVisibilityForDomain('conf.example.com')
    expect(result).toEqual({ discoverable: false })
  })

  // Without KONF_SITE_SIGNING_KEY the flags read returns the env lists early,
  // so this proves only that the conference read is skipped for an unflagged
  // tenant, not that no flags request is ever made.
  it('unflagged: gives Sanity with no conference read', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'other-conf')
    sanityFetch.mockResolvedValueOnce(structuredClone(sanityConf))

    const gatewayFetch = vi.fn()
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await getDiscoveryVisibilityForDomain('conf.example.com')
    expect(gatewayFetch).not.toHaveBeenCalled()
    expect(result).toEqual({ discoverable: true })
  })

  it('unflagged: keeps unlisted Sanity conference unlisted with no gateway call', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'other-conf')
    sanityFetch.mockResolvedValueOnce({
      ...structuredClone(sanityConf),
      visibility: 'unlisted',
    })

    const gatewayFetch = vi.fn()
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await getDiscoveryVisibilityForDomain('conf.example.com')
    expect(gatewayFetch).not.toHaveBeenCalled()
    expect(result).toEqual({ discoverable: false })
  })

  it('error: falls back to Sanity on gateway 500 response', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-1')
    sanityFetch.mockResolvedValueOnce(structuredClone(sanityConf))

    const gatewayFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ errors: [{ message: 'D1 unavailable' }] }),
          { status: 500 },
        ),
      )
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await getDiscoveryVisibilityForDomain('conf.example.com')
    expect(result).toEqual({ discoverable: true })
  })

  it('never makes an unpublished conference public by accident on gateway error', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-1')
    sanityFetch.mockResolvedValueOnce({
      ...structuredClone(sanityConf),
      visibility: 'unlisted',
    })

    const gatewayFetch = vi
      .fn()
      .mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await getDiscoveryVisibilityForDomain('conf.example.com')
    // MUST remain discoverable: false — never fail open to public:
    expect(result).toEqual({ discoverable: false })
  })

  it('never makes an unpublished conference public by accident when unflagged', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'other-conf')
    sanityFetch.mockResolvedValueOnce({
      ...structuredClone(sanityConf),
      visibility: 'unlisted',
    })

    const gatewayFetch = vi.fn()
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await getDiscoveryVisibilityForDomain('conf.example.com')
    expect(gatewayFetch).not.toHaveBeenCalled()
    expect(result).toEqual({ discoverable: false })
  })

  it('fails closed (discoverable: false) when Sanity row is null or read throws', async () => {
    sanityFetch.mockResolvedValueOnce(null)
    expect(
      await getDiscoveryVisibilityForDomain('missing.example.com'),
    ).toEqual({ discoverable: false })

    sanityFetch.mockRejectedValueOnce(new Error('Sanity lake unreachable'))
    expect(await getDiscoveryVisibilityForDomain('broken.example.com')).toEqual(
      {
        discoverable: false,
      },
    )
  })

  it('preserves exact cache tags and cacheLife', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-1')
    sanityFetch.mockResolvedValueOnce(structuredClone(sanityConf))

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            conference: {
              id: 'conf-1',
              visibility: 'live',
            },
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    await getDiscoveryVisibilityForDomain('conf.example.com')
    expect(cacheLife).toHaveBeenCalledWith('hours')
    expect(cacheTag).toHaveBeenCalledWith('content:conferences')
    expect(cacheTag).toHaveBeenCalledWith(domainTag('conf.example.com'))
    expect(cacheTag).toHaveBeenCalledWith(conferenceTag('conf-1'))
  })
})
