import { describe, expect, it } from 'vitest'
import { planStamps, type LegacyTask } from './plan'

const conference = {
  cfpStartDate: '2026-01-12',
  cfpEndDate: '2026-03-12',
  cfpNotifyDate: '2026-04-12',
  programDate: '2026-05-12',
  startDate: '2026-06-12',
  endDate: '2026-06-13',
}

function task(over: Partial<LegacyTask> = {}): LegacyTask {
  return {
    _id: 'task-1',
    _rev: 'rev-1',
    kind: 'publishing',
    channel: 'linkedin',
    milestone: 'TICKETS_OPEN',
    offsetDays: 0,
    ...over,
  }
}

function apply(tasks: LegacyTask[], source = conference) {
  const stamps = new Map(planStamps(tasks, source).map((p) => [p.id, p.at]))
  return tasks.map((t) => ({
    ...t,
    plannedAt: stamps.get(t._id) ?? t.plannedAt,
  }))
}

describe('legacy Task plannedAt adoption', () => {
  it('stamps the currently resolved anchor, preserving a hand-moved instant', () => {
    const tasks = [
      { ...task(), scheduledAt: '2026-03-20T07:00:00.000Z' },
      {
        ...task({ _id: 'hand-moved' }),
        scheduledAt: '2026-03-23T10:30:00.000Z',
      },
    ]
    expect(apply(tasks).map((t) => t.plannedAt)).toEqual([
      '2026-03-20T07:00:00.000Z',
      '2026-03-20T07:00:00.000Z',
    ])
    expect(tasks[1].scheduledAt).toBe('2026-03-23T10:30:00.000Z')
    expect(planStamps(tasks, conference)[1]).toEqual({
      id: 'hand-moved',
      rev: 'rev-1',
      at: '2026-03-20T07:00:00.000Z',
    })
  })

  it('uses the configured salesStartDate and canonical Oslo channel/work slots', () => {
    const source = {
      ...conference,
      ticketTargets: { enabled: true, salesStartDate: '2026-04-02' },
    }
    expect(
      planStamps(
        [
          task(),
          task({ _id: 'bluesky', channel: 'bluesky' }),
          task({
            _id: 'work',
            kind: 'studioRender',
            channel: null,
            offsetDays: -1,
          }),
        ],
        source,
      ).map((p) => p.at),
    ).toEqual([
      '2026-04-02T06:00:00.000Z',
      '2026-04-02T16:00:00.000Z',
      '2026-04-01T07:00:00.000Z',
    ])
  })

  it('preserves existing stamps and skips de-anchored Tasks while adopting eligible siblings', () => {
    const tasks = [
      task(),
      task({ _id: 'existing', plannedAt: '2026-02-01T08:00:00.000Z' }),
      task({ _id: 'no-milestone', milestone: null }),
      task({ _id: 'no-offset', offsetDays: null }),
      task({ _id: 'drafts.task' }),
      task({ _id: 'versions.release.task' }),
    ]
    expect(
      apply(tasks).map((t) => ({ id: t._id, at: t.plannedAt ?? null })),
    ).toEqual([
      { id: 'task-1', at: '2026-03-20T07:00:00.000Z' },
      { id: 'existing', at: '2026-02-01T08:00:00.000Z' },
      { id: 'no-milestone', at: null },
      { id: 'no-offset', at: null },
      { id: 'drafts.task', at: null },
      { id: 'versions.release.task', at: null },
    ])
    expect(apply(apply(tasks))).toEqual(apply(tasks))
  })
})
