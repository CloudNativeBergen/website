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

  it('returns ALL not-yet-ended editions ordered by start', async () => {
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
      {
        _id: 'conf-past',
        title: 'Past',
        startDate: '2026-06-01',
        endDate: '2026-06-02',
      },
    ])
    const result = await resolveActiveReminderConferences(
      new Date('2026-07-20T06:00:00Z'),
    )
    expect(result.map((c) => c._id)).toEqual(['conf-a', 'conf-b'])
    const [query] = fetchMock.mock.calls[0]
    expect(query).toContain('*[_type == "conference"]')
    // Must NOT collapse to a single edition.
    expect(query).not.toContain('[0]')
  })

  it('BOUNDS the selection — an uncapped cron sweep is a latent incident', async () => {
    // 60 active conferences, capped at 50 in code
    const many = Array.from({ length: 60 }, (_, i) => ({
      _id: `conf-${i}`,
      title: `Conf ${i}`,
      startDate: `2026-08-${String(i + 1).padStart(2, '0')}`,
      endDate: '2026-10-01',
    }))
    fetchMock.mockResolvedValue(many)
    const result = await resolveActiveReminderConferences(
      new Date('2026-07-20T06:00:00Z'),
    )
    expect(result).toHaveLength(50)
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

    it('filters and sorts on merged D1 dates when flagged and values differ', async () => {
      vi.stubEnv('KONF_API_URL', 'https://api.example.com')
      vi.stubEnv('KONF_API_TENANTS', 'conf-past,conf-late')

      // conf-past has Sanity endDate < today (2026-07-20), but D1 moves it to >= today.
      // conf-late has Sanity startDate after conf-a, but D1 moves it before conf-a.
      const confPast = {
        _id: 'conf-past',
        title: 'Sanity Past',
        startDate: '2026-07-01',
        endDate: '2026-07-10',
        domains: ['past.example.com'],
      }
      const confLate = {
        _id: 'conf-late',
        title: 'Sanity Late',
        startDate: '2026-09-01',
        endDate: '2026-09-02',
        domains: ['late.example.com'],
      }

      fetchMock.mockResolvedValue([
        structuredClone(sanityConf),
        confPast,
        confLate,
      ])

      const gatewayFetch = vi.fn().mockImplementation(async (_url, options) => {
        const origin = (options?.headers as Record<string, string>)?.origin
        if (origin === 'https://past.example.com') {
          return new Response(
            JSON.stringify({
              data: {
                conference: {
                  id: 'conf-past',
                  title: 'D1 Rescheduled',
                  startDate: '2026-07-22',
                  endDate: '2026-07-24',
                },
              },
            }),
          )
        }
        if (origin === 'https://late.example.com') {
          return new Response(
            JSON.stringify({
              data: {
                conference: {
                  id: 'conf-late',
                  title: 'D1 Early',
                  startDate: '2026-07-25',
                  endDate: '2026-07-26',
                },
              },
            }),
          )
        }
        return new Response(JSON.stringify({ data: { conference: null } }), {
          status: 404,
        })
      })
      vi.stubGlobal('fetch', gatewayFetch)

      const result = await resolveActiveReminderConferences(
        new Date('2026-07-20T06:00:00Z'),
      )

      // Expected order:
      // 1. conf-past (D1 start: 2026-07-22)
      // 2. conf-late (D1 start: 2026-07-25)
      // 3. conf-a (Sanity start: 2026-08-01)
      expect(result.map((c) => c._id)).toEqual([
        'conf-past',
        'conf-late',
        'conf-a',
      ])
      expect(result[0].title).toBe('D1 Rescheduled')
      expect(result[1].title).toBe('D1 Early')
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
