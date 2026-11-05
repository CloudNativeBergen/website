import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))

const h = vi.hoisted(() => ({ flagsThrow: false }))
vi.mock('@/lib/conference/konf-api', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/conference/konf-api')>()
  return {
    ...actual,
    rolloutFlags: (...args: Parameters<typeof actual.rolloutFlags>) =>
      h.flagsThrow
        ? Promise.reject(new Error('flags down'))
        : actual.rolloutFlags(...args),
  }
})

import {
  gateEndDate,
  mergeConference,
  mergeConferences,
  purgeEndDate,
} from './merge'
import { isConferenceOver } from './state'

describe('gateEndDate (proposal editing gate)', () => {
  it.each([
    ['D1 missing', '2024-05-01', undefined, '2024-05-01'],
    ['D1 null', '2024-05-01', null, '2024-05-01'],
    ['D1 unparsable', '2024-05-01', 'soon', '2024-05-01'],
    ['D1 invalid calendar date', '2024-05-01', '2024-13-45', '2024-05-01'],
    ['D1 later: keep Sanity', '2024-05-01', '2099-01-01', '2024-05-01'],
    ['D1 earlier: take D1', '2024-05-01', '2020-01-01', '2020-01-01'],
    ['Sanity missing: take D1', null, '2020-01-01', '2020-01-01'],
  ])('%s', (_name, sanity, d1, want) => {
    expect(gateEndDate(sanity, d1)).toBe(want)
  })

  it('a later or bad D1 end date never reopens editing of an ended conference', () => {
    for (const d1 of ['2099-12-31', 'soon', null, undefined]) {
      const endDate = gateEndDate('2020-01-01', d1) as string
      expect(isConferenceOver({ endDate })).toBe(true)
    }
  })
})

describe('purgeEndDate', () => {
  it.each([
    ['D1 missing', '2024-05-01', undefined, '2024-05-01'],
    ['D1 null', '2024-05-01', null, '2024-05-01'],
    ['D1 unparsable', '2024-05-01', 'soon', '2024-05-01'],
    ['D1 empty', '2024-05-01', '', '2024-05-01'],
    ['D1 not a string', '2024-05-01', 20240501, '2024-05-01'],
    ['D1 invalid calendar date', '2024-05-01', '2024-13-45', '2024-05-01'],
    ['D1 earlier: keep Sanity', '2024-05-01', '2020-01-01', '2024-05-01'],
    ['D1 later: take D1', '2024-05-01', '2025-01-01', '2025-01-01'],
    ['Sanity unparsable stays as before', 'x', '2025-01-01', 'x'],
  ])('%s', (_name, sanity, d1, want) => {
    expect(purgeEndDate(sanity, d1)).toBe(want)
  })
})

describe('mergeConference & mergeConferences', () => {
  beforeEach(() => {
    h.flagsThrow = false
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

    const gatewayFetch = vi
      .fn()
      .mockResolvedValue(
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

  it('falls back to Sanity when the gateway fetch rejects (timeout)', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-test')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')),
    )
    expect(await mergeConference(sanityConf)).toEqual(sanityConf)
  })

  it('falls back to Sanity when the flag lookup itself throws', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-test')
    h.flagsThrow = true
    const gatewayFetch = vi.fn()
    vi.stubGlobal('fetch', gatewayFetch)
    expect(await mergeConferences([sanityConf])).toEqual([sanityConf])
    expect(gatewayFetch).not.toHaveBeenCalled()
  })
})
