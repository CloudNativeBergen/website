/**
 * THE WEEKLY-UPDATE CRON SELECTION MUST BE BOUNDED.
 *
 * `getConferencesForWeeklyUpdate` selected every conference with a sales channel
 * and no `[0...N]` cap, then dropped the finished ones in JS. That is an
 * unbounded read AND an unbounded fan-out (a Slack post plus a status summary
 * per conference) that grows with the tenant count — the same latent incident
 * `MAX_CONVERSATIONS_PER_RUN` (`src/lib/messaging/nudge.ts`) and
 * `MAX_CONFERENCES_PER_RUN` (`src/lib/messaging/retention.ts`) already close.
 *
 * The cap is only safe because the query ALSO narrows to plausibly-active
 * editions first: over an `order(startDate asc)` list, a bare cap would be spent
 * entirely on the oldest, long-finished conferences and starve every live one.
 * Both halves are asserted here, plus the invariant that the GROQ pre-filter is
 * strictly LOOSER than `isConferenceOver` so it can never drop a conference the
 * JS filter would have kept.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const liveFetch = vi.fn()

vi.mock('@/lib/sanity/client', () => ({
  clientReadCached: { fetch: vi.fn() },
  clientReadUncached: { fetch: (...a: unknown[]) => liveFetch(...a) },
  clientWrite: { fetch: vi.fn() },
}))

vi.mock('next/cache', () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  revalidateTag: () => {},
}))

vi.mock('next/headers', () => ({
  headers: async () => new Map(),
}))

vi.mock('@/lib/domain-verification/routing', () => ({
  isHostRoutable: async () => true,
}))

vi.mock('@/lib/sponsor-crm/sanity', () => ({
  getPublicSponsorsForConference: async () => [],
}))

vi.mock('@/lib/gallery/sanity', () => ({
  getGalleryImages: async () => [],
  getFeaturedGalleryImages: async () => [],
}))

import { getConferencesForWeeklyUpdate } from '@/lib/conference/sanity'

function queryOf(): string {
  return liveFetch.mock.calls[0][0] as string
}

function paramsOf(): Record<string, unknown> {
  return liveFetch.mock.calls[0][1] as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  liveFetch.mockResolvedValue([])
})

describe('getConferencesForWeeklyUpdate — bounded cron selection', () => {
  it('caps the selection in GROQ, after the ordering', async () => {
    await getConferencesForWeeklyUpdate()
    const query = queryOf()
    expect(query).toMatch(/order\(startDate asc\)\[0\.\.\.\d+\]/)
    expect(query.indexOf('order(startDate asc)')).toBeLessThan(
      query.indexOf('[0...'),
    )
  })

  it('narrows to plausibly-active editions so the cap is not spent on dead ones', async () => {
    await getConferencesForWeeklyUpdate()
    expect(queryOf()).toContain('endDate >= $cutoff')
    expect(paramsOf().cutoff).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('uses a cutoff STRICTLY LOOSER than isConferenceOver (a day before today)', async () => {
    // `isConferenceOver` is `now >= endDate + 1 day`, so a conference ending
    // today is still live. The cutoff is one day earlier again, so anything the
    // query removes is over under any timezone reading and the JS filter stays
    // the authority.
    await getConferencesForWeeklyUpdate()
    const cutoff = paramsOf().cutoff as string
    const today = new Date().toISOString().slice(0, 10)
    expect(cutoff < today).toBe(true)
    const daysApart =
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${cutoff}T00:00:00Z`)) /
      86_400_000
    expect(daysApart).toBeLessThanOrEqual(1)
  })

  it('still keeps a conference that ends TODAY (the JS filter is unchanged)', async () => {
    const today = new Date().toISOString().slice(0, 10)
    liveFetch.mockResolvedValue([
      { _id: 'c-live', title: 'Live', endDate: today },
    ])
    const result = await getConferencesForWeeklyUpdate()
    expect(result.map((c) => c._id)).toEqual(['c-live'])
  })

  it('still drops a conference that has ended, even if the query returned it', async () => {
    liveFetch.mockResolvedValue([
      { _id: 'c-over', title: 'Over', endDate: '2020-01-01' },
      { _id: 'c-future', title: 'Future', endDate: '2999-01-01' },
    ])
    const result = await getConferencesForWeeklyUpdate()
    expect(result.map((c) => c._id)).toEqual(['c-future'])
  })

  it('still requires a non-empty sales notification channel', async () => {
    await getConferencesForWeeklyUpdate()
    expect(queryOf()).toContain('salesNotificationChannel != ""')
  })
})
