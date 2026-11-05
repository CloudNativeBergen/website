import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('next/cache', () => ({
  unstable_noStore: () => {},
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

const fetch = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => fetch(...a) },
}))
const notify = vi.fn()
vi.mock('@/lib/slack/notify', () => ({
  notifyOverdueInvoices: (...a: unknown[]) => notify(...a),
}))

import { GET } from './route'

const req = (headers?: Record<string, string>) =>
  new Request('https://x.dev/api/cron/overdue-invoices', {
    headers,
  }) as unknown as Parameters<typeof GET>[0]
const auth = { authorization: 'Bearer s3cret' }
const OLD = process.env.CRON_SECRET

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 's3cret'
  notify.mockResolvedValue(true)
})
afterEach(() => {
  process.env.CRON_SECRET = OLD
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('/api/cron/overdue-invoices', () => {
  it('returns 401 without the secret and reads nothing', async () => {
    expect((await GET(req())).status).toBe(401)
    expect((await GET(req({ authorization: 'Bearer no' }))).status).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('posts only for conferences with a sales channel and overdue invoices', async () => {
    fetch
      .mockResolvedValueOnce([
        {
          _id: 'c1',
          title: 'One',
          domains: ['one.dev'],
          salesNotificationChannel: '#sales',
        },
        { _id: 'c2', title: 'Two', domains: ['two.dev'] },
        {
          _id: 'c3',
          title: 'Three',
          domains: ['three.dev'],
          salesNotificationChannel: '#s3',
        },
      ])
      .mockResolvedValueOnce([
        {
          sponsorName: 'Acme',
          invoiceStatus: 'sent',
          invoiceDueAt: '2000-01-01',
          invoicePaidAt: null,
          contractValue: 100,
          contractCurrency: 'NOK',
        },
      ])
      .mockResolvedValueOnce([])
    vi.useFakeTimers({ now: new Date('2000-01-02T08:00:00Z') })
    const res = await GET(req(auth))
    vi.useRealTimers()

    expect(await res.json()).toEqual({ success: true, posted: 1, failed: 0 })
    // c2 has no channel: its invoices are never read.
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(fetch.mock.calls[1][1]).toEqual({ conferenceId: 'c1' })
    expect(fetch.mock.calls[2][1]).toEqual({ conferenceId: 'c3' })
    expect(notify).toHaveBeenCalledTimes(1)
    const sent = JSON.stringify(notify.mock.calls[0][0])
    expect(sent).toContain('https://one.dev/admin/sponsors/invoices')
    expect(notify.mock.calls[0][0].text).toContain('One')
    // Conference candidates are fetched defined(endDate) and filtered in code
    expect(fetch.mock.calls[0][0]).toContain('defined(endDate)')
    // Studio drafts would duplicate conferences and invoice rows.
    expect(fetch.mock.calls[0][0]).toContain('!(_id in path("drafts.**"))')
    expect(fetch.mock.calls[1][0]).toContain('!(_id in path("drafts.**"))')
    expect(fetch.mock.calls[0][1]).toEqual({})
  })

  describe('D1 gateway values and fallbacks (#1997)', () => {
    it('uses D1 title and endDate when tenant has apiRead enabled', async () => {
      vi.stubEnv('KONF_API_URL', 'https://api.example.com')
      vi.stubEnv('KONF_API_TENANTS', 'c1')

      fetch
        .mockResolvedValueOnce([
          {
            _id: 'c1',
            title: 'Sanity Title',
            endDate: '2000-01-01',
            domains: ['one.dev'],
            salesNotificationChannel: '#sales',
          },
        ])
        .mockResolvedValueOnce([
          {
            sponsorName: 'Acme',
            invoiceStatus: 'sent',
            invoiceDueAt: '2000-01-01',
            invoicePaidAt: null,
            contractValue: 100,
            contractCurrency: 'NOK',
          },
        ])

      const gatewayFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              conference: {
                id: 'c1',
                title: 'D1 Title One',
                endDate: '2000-01-02',
              },
            },
          }),
        ),
      )
      vi.stubGlobal('fetch', gatewayFetch)

      vi.useFakeTimers({ now: new Date('2000-01-02T08:00:00Z') })
      const res = await GET(req(auth))
      vi.useRealTimers()

      expect(await res.json()).toEqual({ success: true, posted: 1, failed: 0 })
      expect(notify).toHaveBeenCalledTimes(1)
      expect(notify.mock.calls[0][0].text).toContain('D1 Title One')
    })

    it('excludes conference when D1 endDate is older than 90 days', async () => {
      vi.stubEnv('KONF_API_URL', 'https://api.example.com')
      vi.stubEnv('KONF_API_TENANTS', 'c1')

      fetch.mockResolvedValueOnce([
        {
          _id: 'c1',
          title: 'Sanity Title',
          endDate: '2000-01-01',
          domains: ['one.dev'],
          salesNotificationChannel: '#sales',
        },
      ])

      const gatewayFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              conference: {
                id: 'c1',
                title: 'D1 Title One',
                // Ended 100 days before 2000-01-02
                endDate: '1999-09-01',
              },
            },
          }),
        ),
      )
      vi.stubGlobal('fetch', gatewayFetch)

      vi.useFakeTimers({ now: new Date('2000-01-02T08:00:00Z') })
      const res = await GET(req(auth))
      vi.useRealTimers()

      expect(await res.json()).toEqual({ success: true, posted: 0, failed: 0 })
      expect(notify).not.toHaveBeenCalled()
    })
  })
})
