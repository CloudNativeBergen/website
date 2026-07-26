import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(...a) },
  clientWrite: {},
}))

import { resolveActiveReminderConferences } from '../conference'

describe('resolveActiveReminderConferences', () => {
  beforeEach(() => vi.clearAllMocks())

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

  it('returns an empty array when no conference is active', async () => {
    fetchMock.mockResolvedValue(null)
    expect(await resolveActiveReminderConferences(new Date())).toEqual([])
  })
})
