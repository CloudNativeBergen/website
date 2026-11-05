import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))

import { mergeConference, mergeConferences } from './merge'

describe('mergeConference & mergeConferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  const sanityConf = {
    _id: 'conf-test',
    title: 'Sanity Title',
    startDate: '2026-08-01',
    endDate: '2026-08-02',
    domains: ['test.example.com'],
  }

  it('uses D1-owned fields when the gateway returns values that differ from Sanity', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-test')

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            conference: {
              id: 'conf-test',
              title: 'D1 Title',
              startDate: '2026-08-10',
              endDate: '2026-08-12',
            },
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await mergeConference(sanityConf)
    expect(result.title).toBe('D1 Title')
    expect(result.startDate).toBe('2026-08-10')
    expect(result.endDate).toBe('2026-08-12')
  })

  it('falls back to Sanity date when D1 returns nullish endDate (never to now)', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-test')

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            conference: {
              id: 'conf-test',
              title: 'D1 Title',
              startDate: null,
              endDate: null,
            },
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await mergeConference(sanityConf)
    expect(result.title).toBe('D1 Title')
    expect(result.startDate).toBe('2026-08-01')
    expect(result.endDate).toBe('2026-08-02')
  })

  it('falls back to Sanity when unflagged', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'different-conf')

    const gatewayFetch = vi.fn()
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await mergeConference(sanityConf)
    expect(gatewayFetch).not.toHaveBeenCalled()
    expect(result).toBe(sanityConf)
  })

  it('falls back to Sanity when KONF_API_DISABLED=1', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-test')
    vi.stubEnv('KONF_API_DISABLED', '1')

    const gatewayFetch = vi.fn()
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await mergeConference(sanityConf)
    expect(gatewayFetch).not.toHaveBeenCalled()
    expect(result).toBe(sanityConf)
  })

  it('falls back to Sanity when gateway errors', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-test')

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ errors: [{ message: 'D1 unavailable' }] }),
        { status: 500 },
      ),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await mergeConference(sanityConf)
    expect(result.title).toBe('Sanity Title')
    expect(result.startDate).toBe('2026-08-01')
    expect(result.endDate).toBe('2026-08-02')
  })

  it('caches lookups across duplicates in mergeConferences', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-test')

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            conference: {
              id: 'conf-test',
              title: 'D1 Title',
              startDate: '2026-08-10',
              endDate: '2026-08-12',
            },
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const results = await mergeConferences([sanityConf, { ...sanityConf }])
    expect(results).toHaveLength(2)
    expect(results[0].endDate).toBe('2026-08-12')
    expect(results[1].endDate).toBe('2026-08-12')
    // Gateway should be called only once despite two conference entries
    expect(gatewayFetch).toHaveBeenCalledTimes(1)
  })
})
