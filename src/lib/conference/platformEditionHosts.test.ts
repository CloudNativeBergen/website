/**
 * @vitest-environment node
 *
 * The transfer PLAN for the short `<org-slug>` address. The plan is what the
 * caller stages in one transaction, so its two halves — what the new edition
 * claims and what the previous holder releases — are asserted together: a plan
 * that claims without releasing duplicates a globally unique routing claim, and
 * one that releases without claiming loses the address entirely.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))

interface Holder {
  _id: string
  organization?: { _ref: string } | null
  organizationId: string | null
  startDate: string | null
  domains: string[]
}

let holders: Holder[] = []

const fetchMock = vi.fn(async () => holders)
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: () => fetchMock() },
}))

import { planEditionPlatformHosts } from './platformEditionHosts'

const ORG = 'org-cnb'

function plan(
  overrides: Partial<Parameters<typeof planEditionPlatformHosts>[0]> = {},
) {
  return planEditionPlatformHosts({
    orgSlug: 'cnb',
    organizationId: ORG,
    startDate: '2026-06-01',
    claimedDomains: holders.flatMap((h) => h.domains),
    ...overrides,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  holders = []
  vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.run')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('a first claim (nobody holds the short address)', () => {
  it('claims both hosts and releases nothing', async () => {
    expect(await plan()).toEqual({
      claim: ['cnb.konf.run', 'cnb-2026.konf.run'],
      releaseFrom: null,
      transferring: null,
      conflict: null,
    })
  })

  it('collapses to one host for an undated edition', async () => {
    expect(await plan({ startDate: null })).toEqual({
      claim: ['cnb.konf.run'],
      releaseFrom: null,
      transferring: null,
      conflict: null,
    })
  })
})

describe('a transfer (a previous edition holds the short address)', () => {
  beforeEach(() => {
    holders = [
      {
        _id: 'conference-2025',
        organizationId: ORG,
        startDate: '2025-06-01',
        domains: ['cnb.konf.run', 'cnb-2025.konf.run'],
      },
    ]
  })

  it('claims AND releases — never one without the other', async () => {
    const result = await plan()
    expect(result.claim).toContain('cnb.konf.run')
    expect(result.releaseFrom).toBe('conference-2025')
    expect(result.transferring).toBe('cnb.konf.run')
    expect(result.conflict).toBeNull()
  })

  it('moves ONLY the short address, never the permanent one', async () => {
    const result = await plan()
    // The previous edition keeps `cnb-2025.konf.run` forever — that is what
    // makes retiring it to a static archive safe.
    expect(result.transferring).not.toBe('cnb-2025.konf.run')
    expect(result.claim).not.toContain('cnb-2025.konf.run')
  })

  it('refuses to move it BACKWARDS to an earlier edition', async () => {
    const result = await plan({ startDate: '2024-06-01' })
    expect(result.claim).toEqual(['cnb-2024.konf.run'])
    expect(result.releaseFrom).toBeNull()
    expect(result.transferring).toBeNull()
  })

  it('orders two editions in one calendar year by their start dates', async () => {
    holders = [
      {
        _id: 'conference-spring',
        organizationId: ORG,
        startDate: '2026-03-01',
        domains: ['cnb.konf.run', 'cnb-2026.konf.run'],
      },
    ]
    // The autumn edition is later, so it takes the short address — but the
    // dated host is already held, so the whole thing is a conflict rather than
    // a silent double-claim of `cnb-2026.konf.run`.
    expect((await plan({ startDate: '2026-09-01' })).conflict).toBe(
      'cnb-2026.konf.run',
    )
  })

  it('refuses when the edition’s own permanent host is already held', async () => {
    holders = [
      {
        _id: 'conference-other',
        organizationId: ORG,
        startDate: '2026-06-01',
        domains: ['cnb-2026.konf.run'],
      },
    ]
    const result = await plan()
    expect(result.conflict).toBe('cnb-2026.konf.run')
    expect(result.claim).toEqual([])
    expect(result.releaseFrom).toBeNull()
  })
})

describe('a foreign holder', () => {
  it('is a CONFLICT, never a transfer', async () => {
    holders = [
      {
        _id: 'conference-foreign',
        organizationId: 'org-someone-else',
        startDate: '2020-01-01',
        domains: ['cnb.konf.run'],
      },
    ]
    const result = await plan()
    expect(result.conflict).toBe('cnb.konf.run')
    // Nothing is claimed and nothing is released: stealing a claim from another
    // tenant is worse than the new edition having no short address.
    expect(result.claim).toEqual([])
    expect(result.releaseFrom).toBeNull()
  })

  it('is a conflict even when the new edition is newer', async () => {
    holders = [
      {
        _id: 'conference-foreign',
        organizationId: 'org-someone-else',
        startDate: '2030-01-01',
        domains: ['cnb.konf.run'],
      },
    ]
    expect((await plan({ startDate: '2031-01-01' })).conflict).toBe(
      'cnb.konf.run',
    )
  })

  it('refuses a WILDCARD that would serve the minted host', async () => {
    const result = await plan({ claimedDomains: ['*.konf.run'] })
    expect(result.conflict).not.toBeNull()
    expect(result.claim).toEqual([])
  })
})

describe('nothing to mint', () => {
  it('mints nothing when the platform operates no zone', async () => {
    vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', '')
    expect(await plan()).toEqual({
      claim: [],
      releaseFrom: null,
      transferring: null,
      conflict: null,
    })
    // …and does not even look for a holder.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('mints nothing for a conference with no organization', async () => {
    expect((await plan({ organizationId: null })).claim).toEqual([])
    expect((await plan({ orgSlug: null })).claim).toEqual([])
  })

  it('mints nothing for a reserved org slug', async () => {
    expect((await plan({ orgSlug: 'admin' })).claim).toEqual([])
  })
})

describe('D1 gateway values and fallbacks (#1997)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('flagged: differing D1 startDate wins over Sanity (D1 later blocks transfer)', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conference-2025')

    // In Sanity, conference-2025 starts 2025-06-01 (earlier than the new 2026-06-01 edition).
    // In D1, conference-2025 starts 2027-06-01 (later than the new 2026-06-01 edition).
    holders = [
      {
        _id: 'conference-2025',
        organization: { _ref: ORG },
        organizationId: ORG,
        startDate: '2025-06-01',
        domains: ['cnb.konf.run', 'cnb-2025.konf.run'],
      },
    ]

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            conference: {
              id: 'conference-2025',
              startDate: '2027-06-01',
            },
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await plan()
    // Because D1 has startDate: '2027-06-01', the 2026 edition is earlier than the holder.
    // Bare host cnb.konf.run should NOT be claimed or transferred!
    expect(result.claim).toEqual(['cnb-2026.konf.run'])
    expect(result.releaseFrom).toBeNull()
    expect(result.transferring).toBeNull()
    expect(gatewayFetch).toHaveBeenCalled()
  })

  it('flagged: differing D1 startDate wins over Sanity (D1 earlier enables transfer)', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conference-2025')

    // In Sanity, conference-2025 starts 2027-06-01 (later than 2026-06-01).
    // In D1, conference-2025 was rescheduled to 2025-06-01 (earlier than 2026-06-01).
    holders = [
      {
        _id: 'conference-2025',
        organization: { _ref: ORG },
        organizationId: ORG,
        startDate: '2027-06-01',
        domains: ['cnb.konf.run', 'cnb-2025.konf.run'],
      },
    ]

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            conference: {
              id: 'conference-2025',
              startDate: '2025-06-01',
            },
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await plan()
    // Because D1 has startDate: '2025-06-01', the 2026 edition is later than the holder.
    // Bare host cnb.konf.run IS claimed and transferred from conference-2025!
    expect(result.claim).toContain('cnb.konf.run')
    expect(result.releaseFrom).toBe('conference-2025')
    expect(result.transferring).toBe('cnb.konf.run')
    expect(gatewayFetch).toHaveBeenCalled()
  })

  it('unflagged: gives Sanity with no gateway call', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'other-conf')

    holders = [
      {
        _id: 'conference-2025',
        organization: { _ref: ORG },
        organizationId: ORG,
        startDate: '2025-06-01',
        domains: ['cnb.konf.run', 'cnb-2025.konf.run'],
      },
    ]

    const gatewayFetch = vi.fn()
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await plan()
    expect(gatewayFetch).not.toHaveBeenCalled()
    // Sanity's 2025-06-01 is earlier than 2026-06-01 -> transfers bare host
    expect(result.claim).toContain('cnb.konf.run')
    expect(result.releaseFrom).toBe('conference-2025')
    expect(result.transferring).toBe('cnb.konf.run')
  })

  it('error: falls back to Sanity on gateway failure', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conference-2025')

    holders = [
      {
        _id: 'conference-2025',
        organization: { _ref: ORG },
        organizationId: ORG,
        startDate: '2025-06-01',
        domains: ['cnb.konf.run', 'cnb-2025.konf.run'],
      },
    ]

    const gatewayFetch = vi
      .fn()
      .mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await plan()
    // Falls back to Sanity startDate 2025-06-01 -> transfers bare host
    expect(result.claim).toContain('cnb.konf.run')
    expect(result.releaseFrom).toBe('conference-2025')
    expect(result.transferring).toBe('cnb.konf.run')
  })
})
