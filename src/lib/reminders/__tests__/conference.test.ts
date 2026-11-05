import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))

const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(...a) },
  clientWrite: {},
}))

import { resolveActiveReminderConferences } from '../conference'

describe('resolveActiveReminderConferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("queries with today's UTC date and returns ALL not-yet-ended editions ordered by start", async () => {
    fetchMock.mockResolvedValue([
      {
        _id: 'conf-a',
        title: 'A',
        startDate: '2026-08-01',
        endDate: '2026-08-02',
      },
      {
        _id: 'conf-b',
        title: 'B',
        startDate: '2026-09-10',
        endDate: '2026-09-11',
      },
    ])
    const result = await resolveActiveReminderConferences(
      new Date('2026-07-20T06:00:00Z'),
    )
    expect(result.map((c) => c._id)).toEqual(['conf-a', 'conf-b'])
    const [query, params] = fetchMock.mock.calls[0]
    expect(params.today).toBe('2026-07-20')
    expect(query).toContain('endDate >= $today')
    expect(query).toContain('order(startDate asc)')
    // Must NOT collapse to a single edition.
    expect(query).not.toContain('[0]')
  })

  it('BOUNDS the selection — an uncapped cron sweep is a latent incident', async () => {
    // A cron that selects every matching conference fans out unbounded work as
    // the tenant count grows. Mirrors MAX_CONVERSATIONS_PER_RUN in
    // src/lib/messaging/nudge.ts.
    fetchMock.mockResolvedValue([])
    await resolveActiveReminderConferences(new Date('2026-07-20T06:00:00Z'))
    const [query] = fetchMock.mock.calls[0]
    expect(query).toMatch(/order\(startDate asc\)\[0\.\.\.\d+\]/)
    // The cap must come AFTER the ordering, or it would slice an arbitrary set.
    expect(query.indexOf('order(startDate asc)')).toBeLessThan(
      query.indexOf('[0...'),
    )
  })

  it('returns an empty array when no conference is active', async () => {
    fetchMock.mockResolvedValue(null)
    expect(await resolveActiveReminderConferences(new Date())).toEqual([])
  })

  describe('D1 gateway values and fallbacks (#1997)', () => {
    const sanityConf = {
      _id: 'conf-a',
      title: 'Sanity Title A',
      startDate: '2026-08-01',
      endDate: '2026-08-02',
      programDate: '2026-07-01',
      travelSupportPaymentDate: '2026-07-15',
      domains: ['2026.example.com'],
    }

    it('uses D1-owned fields when the gateway returns values that differ from Sanity', async () => {
      vi.stubEnv('KONF_API_URL', 'https://api.example.com')
      vi.stubEnv('KONF_API_TENANTS', 'conf-a')
      fetchMock.mockResolvedValue([structuredClone(sanityConf)])

      const gatewayFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              conference: {
                id: 'conf-a',
                title: 'D1 Title A',
                startDate: '2026-08-10',
                endDate: '2026-08-12',
              },
            },
          }),
        ),
      )
      vi.stubGlobal('fetch', gatewayFetch)

      const result = await resolveActiveReminderConferences(
        new Date('2026-07-20T06:00:00Z'),
      )

      expect(result).toEqual([
        {
          _id: 'conf-a',
          title: 'D1 Title A',
          startDate: '2026-08-10',
          endDate: '2026-08-12',
          programDate: '2026-07-01',
          travelSupportPaymentDate: '2026-07-15',
        },
      ])
    })

    it('falls back to Sanity when KONF_API_DISABLED=1', async () => {
      vi.stubEnv('KONF_API_URL', 'https://api.example.com')
      vi.stubEnv('KONF_API_TENANTS', 'conf-a')
      vi.stubEnv('KONF_API_DISABLED', '1')
      fetchMock.mockResolvedValue([structuredClone(sanityConf)])

      const gatewayFetch = vi.fn()
      vi.stubGlobal('fetch', gatewayFetch)

      const result = await resolveActiveReminderConferences(
        new Date('2026-07-20T06:00:00Z'),
      )

      expect(gatewayFetch).not.toHaveBeenCalled()
      expect(result[0].title).toBe('Sanity Title A')
      expect(result[0].startDate).toBe('2026-08-01')
      expect(result[0].endDate).toBe('2026-08-02')
    })

    it('falls back to Sanity when the gateway errors', async () => {
      vi.stubEnv('KONF_API_URL', 'https://api.example.com')
      vi.stubEnv('KONF_API_TENANTS', 'conf-a')
      fetchMock.mockResolvedValue([structuredClone(sanityConf)])

      const gatewayFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ errors: [{ message: 'D1 unavailable' }] }),
          {
            status: 500,
          },
        ),
      )
      vi.stubGlobal('fetch', gatewayFetch)

      const result = await resolveActiveReminderConferences(
        new Date('2026-07-20T06:00:00Z'),
      )

      expect(result[0].title).toBe('Sanity Title A')
      expect(result[0].startDate).toBe('2026-08-01')
      expect(result[0].endDate).toBe('2026-08-02')
    })
  })
})
