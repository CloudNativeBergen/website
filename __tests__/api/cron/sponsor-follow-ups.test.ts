/**
 * @vitest-environment node
 *
 * The sponsor-follow-ups cron (#1687 N1): one Slack alert per passed
 * follow-up date, stamped into `followUpAlertedFor` so a rerun is silent.
 */
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  docs: [] as Array<Record<string, string>>,
  alert: vi.fn(),
  query: '',
}))

// A tiny store: the query's past-date and not-yet-alerted filter,
// and a patch that stamps the doc.
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: async (query: string) =>
      (h.query = query) &&
      h.docs.filter(
        (d) =>
          new Date(d.nextFollowUpAt) < new Date() &&
          d.nextFollowUpAt !== d.followUpAlertedFor,
      ),
    patch: (id: string) => ({
      ifRevisionId: () => ({
        set: (sets: Record<string, string>) => ({
          commit: async () =>
            Object.assign(
              h.docs.find((d) => d._id === id)!,
              sets,
            ),
        }),
      }),
    }),
  },
}))
vi.mock('@/lib/sponsor-crm/slack-alerts', () => ({
  alertSponsorOwner: (...args: unknown[]) => h.alert(...args),
}))
vi.mock('next/cache', () => ({ unstable_noStore: vi.fn() }))

import { GET } from '@/app/api/cron/sponsor-follow-ups/route'

const run = (auth = 'Bearer s') =>
  GET(
    new NextRequest('http://localhost/api/cron/sponsor-follow-ups', {
      headers: { authorization: auth },
    }),
  )

describe('api/cron/sponsor-follow-ups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 's'
    h.docs = [
      { _id: 'past', _rev: 'r', nextFollowUpAt: '2020-01-01' },
      { _id: 'future', _rev: 'r', nextFollowUpAt: '2999-01-01' },
    ]
  })

  it('rejects a wrong bearer', async () => {
    expect((await run('Bearer x')).status).toBe(401)
    expect(h.alert).not.toHaveBeenCalled()
  })

  it('alerts once per passed follow-up date, not again on a rerun', async () => {
    await run()
    expect(h.alert).toHaveBeenCalledTimes(1)
    expect(h.alert.mock.calls[0][0]).toBe('past')
    expect(h.docs[0].followUpAlertedFor).toBe('2020-01-01')

    await run()
    expect(h.alert).toHaveBeenCalledTimes(1)

    // A new follow-up date that has passed alerts again.
    h.docs[0].nextFollowUpAt = '2021-01-01'
    await run()
    expect(h.alert).toHaveBeenCalledTimes(2)
  })

  it('names the follow-up by its Oslo date', async () => {
    // 23:30Z on 31 Dec is already 1 Jan in Oslo.
    h.docs = [
      { _id: 'late', _rev: 'r', nextFollowUpAt: '2020-12-31T23:30:00Z' },
    ]
    await run()
    expect(h.alert.mock.calls[0][2]).toContain('2021-01-01')
  })

  it('skips closed-lost sponsors but keeps closed-won ones', async () => {
    await run()
    expect(h.query).toContain('status != "closed-lost"')
    expect(h.query).not.toContain('closed-won')
    expect(h.query).toContain('dateTime(nextFollowUpAt) < dateTime(now())')
  })
})
