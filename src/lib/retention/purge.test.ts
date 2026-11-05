/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  fetch: vi.fn(),
  deleted: [] as string[],
  commit: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock('@/lib/sanity/client', () => {
  const tx = {
    delete: (id: string) => {
      h.deleted.push(id)
      return tx
    },
    commit: h.commit,
  }
  return {
    clientReadUncached: { fetch: h.fetch },
    clientWrite: { transaction: () => tx },
  }
})

import {
  deleteExpiredMarketingSnapshots,
  deleteExpiredReminderLogs,
} from './purge'

beforeEach(() => {
  h.fetch.mockReset()
  h.commit.mockReset()
  h.deleted.length = 0
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('deleteExpiredReminderLogs', () => {
  it('scopes each read to its conference and isolates failures', async () => {
    h.fetch
      .mockResolvedValueOnce([
        { _id: 'c1', endDate: '2020-01-01' },
        { _id: 'c2', endDate: '2020-01-01' },
        { _id: 'c3', endDate: '2020-01-01' },
      ])
      .mockResolvedValueOnce(['a', 'b'])
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(['c'])
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await deleteExpiredReminderLogs()).toEqual({ deleted: 3 })
    expect(h.deleted).toEqual(['a', 'b', 'c'])
    expect(h.commit).toHaveBeenCalledTimes(2)
    const [query, params] = h.fetch.mock.calls[1]
    expect(query).toContain('conference._ref == $conferenceId')
    expect(query).toContain('[0...200]')
    expect(params).toMatchObject({
      conferenceId: 'c1',
      type: 'scheduledReminderLog',
    })
  })

  it('writes nothing on a dry run', async () => {
    h.fetch
      .mockResolvedValueOnce([{ _id: 'c1', endDate: '2020-01-01' }])
      .mockResolvedValueOnce(['a'])
    expect(await deleteExpiredReminderLogs(true)).toEqual({ deleted: 1 })
    expect(h.commit).not.toHaveBeenCalled()
  })

  it('purges marketing snapshots the same way', async () => {
    h.fetch
      .mockResolvedValueOnce([{ _id: 'c1', endDate: '2020-01-01' }])
      .mockResolvedValueOnce(['s'])
    expect(await deleteExpiredMarketingSnapshots()).toEqual({ deleted: 1 })
    expect(h.fetch.mock.calls[1][1]).toMatchObject({
      type: 'marketingSnapshot',
    })
    expect(h.deleted).toEqual(['s'])
  })

  describe('D1 gateway values and fallbacks (#1997)', () => {
    it('uses D1 endDate when tenant has apiRead enabled (postponed edition is spared)', async () => {
      vi.stubEnv('KONF_API_URL', 'https://api.example.com')
      vi.stubEnv('KONF_API_TENANTS', 'c1')

      // Sanity endDate is old (2020-01-01), but D1 postponed to 2099-01-01
      h.fetch.mockResolvedValueOnce([
        {
          _id: 'c1',
          endDate: '2020-01-01',
          domains: ['c1.example.com'],
        },
      ])

      const gatewayFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              conference: {
                id: 'c1',
                title: 'CND 2099',
                endDate: '2099-01-01',
              },
            },
          }),
        ),
      )
      vi.stubGlobal('fetch', gatewayFetch)

      const result = await deleteExpiredReminderLogs()
      expect(result).toEqual({ deleted: 0 })
      expect(h.deleted).toEqual([])
    })

    it('uses D1 endDate when tenant has apiRead enabled (an EARLIER D1 date never widens the purge)', async () => {
      vi.stubEnv('KONF_API_URL', 'https://api.example.com')
      vi.stubEnv('KONF_API_TENANTS', 'c1')

      // Sanity endDate is future (2099-01-01), but D1 ended 2020-01-01
      h.fetch
        .mockResolvedValueOnce([
          {
            _id: 'c1',
            endDate: '2099-01-01',
            domains: ['c1.example.com'],
          },
        ])
        .mockResolvedValueOnce(['log-1'])

      const gatewayFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              conference: {
                id: 'c1',
                title: 'CND 2020',
                endDate: '2020-01-01',
              },
            },
          }),
        ),
      )
      vi.stubGlobal('fetch', gatewayFetch)

      const result = await deleteExpiredReminderLogs()
      expect(gatewayFetch).toHaveBeenCalled()
      expect(result).toEqual({ deleted: 0 })
      expect(h.deleted).toEqual([])
    })

    it('falls back to Sanity endDate when tenant is unflagged', async () => {
      vi.stubEnv('KONF_API_URL', 'https://api.example.com')
      vi.stubEnv('KONF_API_TENANTS', 'other-conf')

      h.fetch
        .mockResolvedValueOnce([
          {
            _id: 'c1',
            endDate: '2020-01-01',
            domains: ['c1.example.com'],
          },
        ])
        .mockResolvedValueOnce(['log-1'])

      const gatewayFetch = vi.fn()
      vi.stubGlobal('fetch', gatewayFetch)

      const result = await deleteExpiredReminderLogs()
      expect(gatewayFetch).not.toHaveBeenCalled()
      expect(result).toEqual({ deleted: 1 })
      expect(h.deleted).toEqual(['log-1'])
    })
  })

  it.each([
    ['rejects (timeout)', () => Promise.reject(new Error('timeout'))],
    ['answers 500', () => Promise.resolve(new Response('x', { status: 500 }))],
    [
      'answers an unparsable date',
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: { conference: { id: 'c1', endDate: '0' } },
            }),
          ),
        ),
    ],
  ])(
    'a D1 path that %s purges only what Sanity alone would',
    async (_n, gateway) => {
      vi.stubEnv('KONF_API_URL', 'https://api.example.com')
      vi.stubEnv('KONF_API_TENANTS', 'c1,c2')
      h.fetch
        .mockResolvedValueOnce([
          { _id: 'c1', endDate: '2099-01-01', domains: ['c1.example.com'] },
          { _id: 'c2', endDate: '2020-01-01', domains: ['c2.example.com'] },
        ])
        .mockResolvedValueOnce(['old-log'])
      vi.stubGlobal('fetch', vi.fn(gateway))
      expect(await deleteExpiredReminderLogs()).toEqual({ deleted: 1 })
      expect(h.deleted).toEqual(['old-log'])
      expect(h.fetch.mock.calls[1][1]).toMatchObject({ conferenceId: 'c2' })
    },
  )
})
