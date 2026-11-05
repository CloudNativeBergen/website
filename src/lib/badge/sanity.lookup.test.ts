import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))

/**
 * #848. `getBadgeById` returned `{ error }` for BOTH "the read succeeded and
 * no badge has this id" and "the read failed", so `/api/badge/[id]/verify`
 * could only answer 404 — a definitive, cacheable "this credential does not
 * exist" — to an external verifier during a Sanity outage.
 *
 * These tests pin the classification at the source. Without them the route's
 * own tests would be asserting on a `reason` that the real loader might never
 * produce.
 */
const badgeFetch = vi.fn()
vi.mock('../sanity/client', () => ({
  clientRead: { fetch: (...a: unknown[]) => badgeFetch(...a) },
  clientWrite: { fetch: (...a: unknown[]) => badgeFetch(...a) },
  clientReadUncached: { fetch: (...a: unknown[]) => badgeFetch(...a) },
}))

import { getBadgeById, getBadgeSVGUrl } from './sanity'
import type { BadgeRecord } from './types'

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

describe('getBadgeById distinguishes absence from failure', () => {
  it('reports not-found when the read succeeded and matched nothing', async () => {
    badgeFetch.mockResolvedValue(null)

    const result = await getBadgeById('no-such-badge')

    expect(result.badge).toBeUndefined()
    expect(result.reason).toBe('not-found')
  })

  it('reports unavailable when the read threw', async () => {
    badgeFetch.mockRejectedValue(new Error('ECONNREFUSED sanity.io'))

    const result = await getBadgeById('real-badge')

    expect(result.badge).toBeUndefined()
    expect(result.reason).toBe('unavailable')
    // The two failures are no longer the same value — which is the whole fix.
    expect(result.reason).not.toBe('not-found')
  })

  it('carries no reason at all when a badge is found', async () => {
    badgeFetch.mockResolvedValue({ badgeId: 'real-badge' })

    const result = await getBadgeById('real-badge')

    expect(result.badge).toEqual({ badgeId: 'real-badge' })
    expect(result.reason).toBeUndefined()
    expect(result.error).toBeUndefined()
  })
})

describe('getBadgeSVGUrl', () => {
  const withUrl = (url: string) =>
    ({ bakedSvg: { asset: { url } } }) as unknown as BadgeRecord

  it('returns Sanity CDN URLs', () => {
    const url = 'https://cdn.sanity.io/files/p/d/x.svg'
    expect(getBadgeSVGUrl(withUrl(url))).toBe(url)
  })

  it('refuses any other host', () => {
    expect(getBadgeSVGUrl(withUrl('http://169.254.169.254/x'))).toBeNull()
    expect(getBadgeSVGUrl(withUrl('not a url'))).toBeNull()
  })
})

describe('getBadgeById D1 gateway values and fallbacks (#1997)', () => {
  const sanityConf = {
    _id: 'conf-a',
    title: 'Sanity Conference Title',
    city: 'Sanity City',
    country: 'Sanity Country',
    tagline: 'Sanity Tagline',
    startDate: '2026-08-01',
    endDate: '2026-08-02',
    domains: ['2026.example.com'],
    organization: { _ref: 'org-a' },
  }

  it('uses D1-owned fields when apiRead is on and values differ', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-a')
    badgeFetch.mockResolvedValue({
      _id: 'b-1',
      badgeId: 'badge-123',
      conference: structuredClone(sanityConf),
    })

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            conference: {
              id: 'conf-a',
              title: 'D1 Conference Title',
              city: 'D1 City',
              country: 'D1 Country',
              startDate: '2026-08-10',
              endDate: '2026-08-12',
            },
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await getBadgeById('badge-123')
    expect(result.badge).toBeDefined()
    const conf = result.badge?.conference as typeof sanityConf
    expect(conf.title).toBe('D1 Conference Title')
    expect(conf.city).toBe('D1 City')
    expect(conf.country).toBe('D1 Country')
    expect(conf.startDate).toBe('2026-08-10')
    expect(conf.endDate).toBe('2026-08-12')
    expect(conf.tagline).toBe('Sanity Tagline')
  })

  it('falls back to Sanity when apiRead is off', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'other-conf')
    badgeFetch.mockResolvedValue({
      _id: 'b-1',
      badgeId: 'badge-123',
      conference: structuredClone(sanityConf),
    })

    const gatewayFetch = vi.fn()
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await getBadgeById('badge-123')
    expect(gatewayFetch).not.toHaveBeenCalled()
    const conf = result.badge?.conference as typeof sanityConf
    expect(conf.title).toBe('Sanity Conference Title')
    expect(conf.city).toBe('Sanity City')
    expect(conf.startDate).toBe('2026-08-01')
  })

  it('falls back to Sanity when KONF_API_DISABLED=1', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-a')
    vi.stubEnv('KONF_API_DISABLED', '1')
    badgeFetch.mockResolvedValue({
      _id: 'b-1',
      badgeId: 'badge-123',
      conference: structuredClone(sanityConf),
    })

    const gatewayFetch = vi.fn()
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await getBadgeById('badge-123')
    expect(gatewayFetch).not.toHaveBeenCalled()
    const conf = result.badge?.conference as typeof sanityConf
    expect(conf.title).toBe('Sanity Conference Title')
    expect(conf.city).toBe('Sanity City')
  })

  it('falls back to Sanity when the gateway errors', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-a')
    badgeFetch.mockResolvedValue({
      _id: 'b-1',
      badgeId: 'badge-123',
      conference: structuredClone(sanityConf),
    })

    const gatewayFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ errors: [{ message: 'D1 unavailable' }] }),
          { status: 500 },
        ),
      )
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await getBadgeById('badge-123')
    const conf = result.badge?.conference as typeof sanityConf
    expect(conf.title).toBe('Sanity Conference Title')
    expect(conf.city).toBe('Sanity City')
    expect(conf.startDate).toBe('2026-08-01')
  })
})
