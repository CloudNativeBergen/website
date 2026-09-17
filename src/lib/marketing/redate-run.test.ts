/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RedatablePlanSnapshot } from './redate-sanity'
const h = vi.hoisted(() => ({
  read: vi.fn(),
  apply: vi.fn(),
  candidates: vi.fn(),
  warnings: vi.fn(),
}))
vi.mock('./redate-sanity', () => ({
  getRedatablePlan: h.read,
  applyRedates: h.apply,
  getRedateCandidates: h.candidates,
}))
vi.mock('./ceiling-check', () => ({ ceilingWarningsFor: h.warnings }))
import { redatePlanForConference, resolveRedateConferences } from './redate-run'

const originalAt = '2027-01-01T07:00:00.000Z'
function snapshot(date = '2027-02-02', rev = 'rp'): RedatablePlanSnapshot {
  return {
    planId: 'plan-a',
    planRev: rev,
    conference: {
      startDate: '2027-05-01',
      endDate: '2027-05-02',
      cfpStartDate: '2027-01-01',
      cfpEndDate: '2027-02-01',
      cfpNotifyDate: '2027-03-01',
      programDate: '2027-04-01',
      earlyBirdEndDate: date,
    },
    campaigns: [],
    tasks: [
      {
        _id: 'task-a',
        _rev: 'rt',
        kind: 'publishing',
        channel: 'linkedin',
        milestone: 'EARLY_BIRD_END',
        offsetDays: 0,
        provisional: true,
        plannedAt: originalAt,
        dueAt: null,
        status: null,
        approvedAt: null,
        variant: {
          _id: 'variant-a',
          _rev: 'rv',
          status: 'draft',
          scheduledAt: originalAt,
          usesCustomTime: false,
          postId: 'post-a',
          postRev: 'rpost',
        },
      },
    ],
  }
}
beforeEach(() => {
  vi.resetAllMocks()
  h.read.mockResolvedValue(snapshot())
  h.apply.mockResolvedValue(true)
  h.warnings.mockResolvedValue(['LinkedIn ceiling exceeded'])
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
describe('never-failing re-date orchestration', () => {
  it('moves the exact instant and clears the flag before reporting affected ceilings', async () => {
    expect(await redatePlanForConference('a')).toEqual({
      movedTaskIds: ['task-a'],
      movedVariantIds: ['variant-a'],
      warnings: ['LinkedIn ceiling exceeded'],
    })
    expect(h.apply.mock.calls[0][0].tasks[0]).toMatchObject({
      taskId: 'task-a',
      at: '2027-02-02T07:00:00.000Z',
      provisional: false,
    })
    expect(h.warnings).toHaveBeenCalledWith('a', { variantIds: ['variant-a'] })
  })
  it('re-reads the entire snapshot and recomputes from fresh milestones after a conflict', async () => {
    h.read
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot('2027-03-03', 'rp2'))
    h.apply.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    expect(await redatePlanForConference('a')).toMatchObject({
      movedTaskIds: ['task-a'],
    })
    expect(h.read).toHaveBeenCalledTimes(2)
    expect(
      h.apply.mock.calls.map(([plan, source]) => [
        plan.tasks[0].at,
        plan.tasks[0].provisional,
        source.planRev,
      ]),
    ).toEqual([
      ['2027-02-02T07:00:00.000Z', false, 'rp'],
      ['2027-03-03T07:00:00.000Z', false, 'rp2'],
    ])
  })
  it('gives up after exactly two conflicts without failing the saved settings', async () => {
    h.apply.mockResolvedValue(false)
    expect(await redatePlanForConference('a')).toEqual({
      movedTaskIds: [],
      movedVariantIds: [],
      warnings: [],
    })
    expect(h.read).toHaveBeenCalledTimes(2)
    expect(h.apply).toHaveBeenCalledTimes(2)
    expect(console.error).toHaveBeenCalledWith(
      'Marketing re-date conflicted twice',
      { conferenceId: 'a' },
    )
  })
  it.each(['read', 'apply', 'warnings'] as const)(
    'contains %s failures',
    async (boundary) => {
      h[boundary].mockRejectedValue(new Error('offline'))
      expect(await redatePlanForConference('a')).toEqual({
        movedTaskIds: [],
        movedVariantIds: [],
        warnings: [],
      })
      expect(console.error).toHaveBeenCalledWith(
        'Marketing re-date failed',
        expect.objectContaining({ conferenceId: 'a' }),
      )
    },
  )
  it('rotates every eligible edition fairly, capped at 50 independently of expansion', async () => {
    h.candidates.mockResolvedValue(
      Array.from({ length: 52 }, (_, n) => ({
        planId: `plan-${String(n).padStart(2, '0')}`,
        conferenceId: `conference-${n}`,
        lastRedatedAt:
          n === 51
            ? null
            : `2027-01-${String(n + 1).padStart(2, '0')}T00:00:00.000Z`,
      })),
    )
    const result = await resolveRedateConferences()
    expect(result.map((p) => p.conferenceId)).toEqual([
      'conference-51',
      ...Array.from({ length: 49 }, (_, n) => `conference-${n}`),
    ])
  })
})

describe('failed-plan rotation', () => {
  it.each(['missing conference', 'invalid milestones', 'write failure'])(
    'advances 50 plans with %s so the healthy 51st runs next',
    async (failure) => {
      const waiting = Array.from({ length: 51 }, (_, n) => ({
        planId: `plan-${String(n).padStart(2, '0')}`,
        conferenceId: `conference-${n}`,
        lastRedatedAt: null as string | null,
      }))
      h.candidates.mockImplementation(async () =>
        waiting.map((row) => ({ ...row })),
      )
      h.read.mockImplementation(async (conferenceId: string) => {
        const row = waiting.find((row) => row.conferenceId === conferenceId)!
        const source = snapshot()
        source.planId = row.planId
        if (conferenceId !== 'conference-50') {
          if (failure === 'missing conference') source.conference = null
          if (failure === 'invalid milestones')
            source.conference = { startDate: 'bad' }
        }
        return source
      })
      h.apply.mockImplementation(async (plan, source) => {
        if (
          failure === 'write failure' &&
          source.planId !== 'plan-50' &&
          plan.tasks.length
        )
          throw new Error('task deleted')
        waiting.find((row) => row.planId === source.planId)!.lastRedatedAt =
          '2027-04-01T00:00:00.000Z'
        return true
      })
      const first = await resolveRedateConferences()
      expect(first.map((row) => row.conferenceId)).toEqual(
        Array.from({ length: 50 }, (_, n) => `conference-${n}`),
      )
      for (const row of first) await redatePlanForConference(row.conferenceId)
      const second = await resolveRedateConferences()
      expect(second[0]).toEqual({
        planId: 'plan-50',
        conferenceId: 'conference-50',
      })
      expect(await redatePlanForConference(second[0].conferenceId)).toEqual({
        movedTaskIds: ['task-a'],
        movedVariantIds: ['variant-a'],
        warnings: ['LinkedIn ceiling exceeded'],
      })
      expect(h.apply.mock.calls.at(-1)?.[0].tasks[0]).toMatchObject({
        at: '2027-02-02T07:00:00.000Z',
        provisional: false,
      })
    },
  )
  it('contains failure of the fallback stamp too', async () => {
    h.read.mockResolvedValue({ ...snapshot(), conference: null })
    h.apply.mockRejectedValue(new Error('offline'))
    expect(await redatePlanForConference('a')).toEqual({
      movedTaskIds: [],
      movedVariantIds: [],
      warnings: [],
    })
    expect(h.apply).toHaveBeenCalledWith(
      { tasks: [], campaigns: [] },
      expect.objectContaining({ planId: 'plan-a', planRev: 'rp' }),
    )
    expect(console.error).toHaveBeenCalledWith(
      'Marketing re-date rotation failed',
      expect.objectContaining({ conferenceId: 'a' }),
    )
  })
})
