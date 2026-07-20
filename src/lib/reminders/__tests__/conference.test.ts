import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(...a) },
  clientWrite: {},
}))

import { resolveActiveReminderConference } from '../conference'

describe('resolveActiveReminderConference', () => {
  beforeEach(() => vi.clearAllMocks())

  it("queries with today's UTC date and orders by earliest not-yet-ended start", async () => {
    fetchMock.mockResolvedValue({
      _id: 'conf-next',
      title: 'Next',
      startDate: '2026-09-10',
      endDate: '2026-09-11',
    })
    const result = await resolveActiveReminderConference(
      new Date('2026-07-20T06:00:00Z'),
    )
    expect(result?._id).toBe('conf-next')
    const [query, params] = fetchMock.mock.calls[0]
    expect(params.today).toBe('2026-07-20')
    expect(query).toContain('endDate >= $today')
    expect(query).toContain('order(startDate asc)')
  })

  it('returns null when no conference is active', async () => {
    fetchMock.mockResolvedValue(null)
    expect(await resolveActiveReminderConference(new Date())).toBeNull()
  })
})
