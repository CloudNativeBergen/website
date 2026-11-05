/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))

const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...args: unknown[]) => fetchMock(...args) },
}))

import { channelCeilingWarnings } from './ceiling-check'

describe('ceiling-check D1 gateway values and fallbacks (#1997)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  const sanityConference = {
    _id: 'conf-1',
    domains: ['conf.example.com'],
    organization: { _ref: 'org-1' },
    startDate: '2027-09-01',
    endDate: '2027-09-03',
    cfpStartDate: '2027-01-01',
    cfpEndDate: '2027-03-01',
    cfpNotifyDate: '2027-04-01',
    programDate: '2027-05-01',
  }

  const variants = [
    {
      _id: 'v1',
      platform: 'linkedin',
      scheduledAt: '2027-06-10T08:00:00Z',
      postId: 'p1',
    },
    {
      _id: 'v2',
      platform: 'linkedin',
      scheduledAt: '2027-06-10T14:00:00Z',
      postId: 'p2',
    },
  ]

  it('uses merged D1 dates when flagged and differing D1 dates silence event-week ceiling warnings', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-1')

    fetchMock.mockResolvedValue({
      conference: structuredClone(sanityConference),
      variants,
      tasks: [],
    })

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            conference: {
              id: 'conf-1',
              startDate: '2027-06-10',
              endDate: '2027-06-12',
            },
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const warnings = await channelCeilingWarnings('conf-1')
    // With D1 dates (start: 2027-06-10), 2027-06-10 is within event week, so perDay warning is silenced
    expect(warnings).toEqual([])
  })

  it('falls back to Sanity dates when unflagged, issuing ceiling warnings', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'other-conf')

    fetchMock.mockResolvedValue({
      conference: structuredClone(sanityConference),
      variants,
      tasks: [],
    })

    const gatewayFetch = vi.fn()
    vi.stubGlobal('fetch', gatewayFetch)

    const warnings = await channelCeilingWarnings('conf-1')
    expect(gatewayFetch).not.toHaveBeenCalled()
    // With Sanity dates (start: 2027-09-01), 2027-06-10 is outside event week, so perDay warning triggers
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]).toContain('LinkedIn')
  })

  it('falls back to Sanity dates on gateway error', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-1')

    fetchMock.mockResolvedValue({
      conference: structuredClone(sanityConference),
      variants,
      tasks: [],
    })

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: 'D1 error' }] }), {
        status: 500,
      }),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const warnings = await channelCeilingWarnings('conf-1')
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]).toContain('LinkedIn')
  })
})
