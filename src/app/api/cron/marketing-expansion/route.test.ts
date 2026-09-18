import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  expansion: vi.fn(),
  redate: vi.fn(),
  eligible: vi.fn(),
  expanding: vi.fn(),
  order: [] as string[],
}))
vi.mock('next/cache', () => ({ unstable_noStore: () => {} }))
vi.mock('@/lib/marketing/expansion-run', () => ({
  resolveExpansionConferences: h.expanding,
  runPlanExpansion: h.expansion,
}))
vi.mock('@/lib/marketing/redate-run', () => ({
  resolveRedateConferences: h.eligible,
  redatePlanForConference: h.redate,
}))
import { GET } from './route'

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'cron-secret')
  vi.clearAllMocks()
  h.order.length = 0
  h.expanding.mockResolvedValue([])
  h.eligible.mockResolvedValue([
    { planId: 'plan-old', conferenceId: 'conf-old' },
  ])
  h.redate.mockResolvedValue({
    ok: true,
    movedTaskIds: ['recording-task'],
    movedVariantIds: ['recording-variant'],
    warnings: ['Bluesky exceeds its daily ceiling'],
  })
})
afterEach(() => vi.unstubAllEnvs())

it('re-dates a plan even when no edition qualifies for expansion', async () => {
  const response = await GET(
    new Request('https://example.org/api/cron/marketing-expansion', {
      headers: { authorization: 'Bearer cron-secret' },
    }) as Parameters<typeof GET>[0],
  )
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    success: true,
    redates: [
      {
        conferenceId: 'conf-old',
        movedTaskIds: ['recording-task'],
        movedVariantIds: ['recording-variant'],
        warnings: ['Bluesky exceeds its daily ceiling'],
      },
    ],
  })
  expect(h.redate).toHaveBeenCalledWith('conf-old')
})

it('re-dates an edition BEFORE expanding it, so slots are allocated against the new dates', async () => {
  // Expansion allocates each new post a slot from `planOccupancy`, which counts
  // existing Tasks at their STORED dates. Re-dating only afterwards meant a
  // Milestone changed in the Studio produced occupancy computed from positions
  // the Tasks were about to leave: the new post took a day that looked free,
  // the existing post then moved onto that same day, and the two collided on a
  // day the ceiling should have kept clear. Order is the whole fix, so order is
  // what this asserts.
  h.expanding.mockResolvedValue([
    { planId: 'plan-new', conferenceId: 'conf-new' },
  ])
  h.eligible.mockResolvedValue([])
  h.redate.mockImplementation(async (id: string) => {
    h.order.push(`redate:${id}`)
    return { ok: true, movedTaskIds: [], movedVariantIds: [], warnings: [] }
  })
  h.expansion.mockImplementation(async () => {
    h.order.push('expand:conf-new')
    return { created: 1, warnings: [] }
  })
  const response = await GET(
    new Request('https://example.org/api/cron/marketing-expansion', {
      headers: { authorization: 'Bearer cron-secret' },
    }) as Parameters<typeof GET>[0],
  )
  expect(response.status).toBe(200)
  expect(h.order).toEqual(['redate:conf-new', 'expand:conf-new'])
})

it('skips expansion for an edition whose re-date did not complete, and carries on', async () => {
  // Expanding against stale positions is the bug, so an edition whose re-date
  // could not complete must not expand.
  //
  // The failure is reported as `ok: false`, NOT as a throw:
  // `redatePlanForConference` handles its own failures and returns the same
  // empty moved-id lists whether it threw, lost compare-and-set twice, or found
  // nothing to move. An earlier version of this test made the mock throw, which
  // the real function never does — so it proved the route handled a failure
  // shape that cannot occur, while the one that can went straight through.
  h.expanding.mockResolvedValue([
    { planId: 'plan-a', conferenceId: 'conf-a' },
    { planId: 'plan-b', conferenceId: 'conf-b' },
  ])
  h.eligible.mockResolvedValue([])
  h.redate.mockImplementation(async (id: string) => ({
    ok: id !== 'conf-a',
    movedTaskIds: [],
    movedVariantIds: [],
    warnings: [],
  }))
  h.expansion.mockImplementation(async (plan: { conferenceId: string }) => {
    h.order.push(plan.conferenceId)
    return { created: 1, warnings: [] }
  })
  const response = await GET(
    new Request('https://example.org/api/cron/marketing-expansion', {
      headers: { authorization: 'Bearer cron-secret' },
    }) as Parameters<typeof GET>[0],
  )
  expect(h.order).toEqual(['conf-b'])
  expect(await response.json()).toMatchObject({
    summary: { conferences: 2, failed: 1, created: 1 },
    results: [
      {
        conferenceId: 'conf-a',
        ok: false,
        error: expect.stringContaining('stale dates'),
      },
      { conferenceId: 'conf-b', ok: true, created: 1 },
    ],
  })
})

it('re-dates an edition once when it both expands and is in the sweep', async () => {
  h.expanding.mockResolvedValue([{ planId: 'plan-x', conferenceId: 'conf-x' }])
  h.eligible.mockResolvedValue([{ planId: 'plan-x', conferenceId: 'conf-x' }])
  h.expansion.mockResolvedValue({ created: 0, warnings: [] })
  const response = await GET(
    new Request('https://example.org/api/cron/marketing-expansion', {
      headers: { authorization: 'Bearer cron-secret' },
    }) as Parameters<typeof GET>[0],
  )
  expect(h.redate).toHaveBeenCalledTimes(1)
  expect((await response.json()).redates).toHaveLength(1)
})
