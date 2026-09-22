import { describe, expect, it } from 'vitest'
import { expandTemplate, type SeedConference } from './seed'
import { BUILTIN_TEMPLATE } from './template'
import { resolveAllMilestones, type MilestoneSource } from './milestones'
import {
  planRedates,
  type RedatableTask,
  type RedatableCampaign,
} from './redate'
import { sequentialShortCodes } from './short-code'

const conference: SeedConference = {
  _id: 'conf-A',
  title: 'Cloud Native Bergen 2027',
  city: 'Bergen',
  baseUrl: 'https://cloudnativebergen.dev',
  cfpStartDate: '2027-01-10',
  cfpEndDate: '2027-03-01',
  cfpNotifyDate: '2027-04-01',
  programDate: '2027-04-20',
  startDate: '2027-06-10',
  endDate: '2027-06-11',
}

function fixture() {
  let n = 0
  const seed = expandTemplate({
    template: BUILTIN_TEMPLATE,
    conference,
    includeOptional: [],
    ownerId: 'owner',
    now: '2026-09-14T10:00:00.000Z',
    newShortCode: sequentialShortCodes(),
    newId: (type) => `${type}.${++n}`,
  })
  const tasks: RedatableTask[] = seed.tasks.map((task) => {
    const variant = seed.variants.find((v) => v._id === task.variantId)
    return {
      ...task,
      _rev: `rev-${task._id}`,
      milestone: task.milestone ?? null,
      offsetDays: task.offsetDays ?? null,
      dueAt: task.dueAt ?? null,
      status: task.status ?? null,
      approvedAt: null,
      plannedAt: variant?.scheduledAt ?? task.dueAt ?? null,
      variant: variant
        ? {
            ...variant,
            _rev: 'variant-rev',
            usesCustomTime: false,
            postRev: 'post-rev',
          }
        : null,
    }
  })
  return {
    tasks,
    campaigns: seed.campaigns.map((c) => ({ ...c, _rev: `rev-${c._id}` })),
    task(key: string) {
      return tasks[seed.tasks.findIndex((t) => t.key === key)]
    },
  }
}

function run(
  tasks: RedatableTask[],
  source: MilestoneSource,
  campaigns: RedatableCampaign[] = [],
) {
  return planRedates({
    tasks,
    campaigns,
    milestones: resolveAllMilestones({ ...conference, ...source }),
  })
}

/** Observe resulting stored values, so a guard's removal fails on the moved value. */
function resultingTask(task: RedatableTask, source: MilestoneSource) {
  const patch = run([task], source).tasks.find((p) => p.taskId === task._id)
  return {
    at: patch?.at ?? task.variant?.scheduledAt ?? task.dueAt,
    provisional: patch?.provisional ?? task.provisional,
    plannedAt: patch?.at ?? task.plannedAt,
  }
}

const ticketDate = {
  ticketTargets: { enabled: true, salesStartDate: '2027-03-30' },
}

describe('planRedates', () => {
  it('moves the open LinkedIn Event to salesStartDate at the work slot and clears its flag', () => {
    expect(resultingTask(fixture().task('linkedinEvent'), ticketDate)).toEqual({
      at: '2027-03-30T07:00:00.000Z',
      plannedAt: '2027-03-30T07:00:00.000Z',
      provisional: false,
    })
  })

  it('keeps an approved open Task at its unchanged instant and flag', () => {
    const task = {
      ...fixture().task('linkedinEvent'),
      approvedAt: '2027-03-01T12:00:00.000Z',
    }
    expect(resultingTask(task, ticketDate)).toEqual({
      at: '2027-03-18T08:00:00.000Z',
      plannedAt: '2027-03-18T08:00:00.000Z',
      provisional: true,
    })
  })

  it.each(['done', 'skipped'] as const)(
    'keeps a %s Task at its unchanged instant and flag',
    (status) => {
      expect(
        resultingTask(
          { ...fixture().task('linkedinEvent'), status },
          ticketDate,
        ),
      ).toEqual({
        at: '2027-03-18T08:00:00.000Z',
        plannedAt: '2027-03-18T08:00:00.000Z',
        provisional: true,
      })
    },
  )

  it('moves draft publishing Tasks at each channel slot with post and variant revisions', () => {
    const fixturePlan = fixture()
    for (const [channel, at] of [
      ['linkedin', '2027-03-30T06:00:00.000Z'],
      ['bluesky', '2027-03-30T16:00:00.000Z'],
    ] as const) {
      const task = fixturePlan.task(`ticketsOpen:${channel}`)
      expect(run([task], ticketDate).tasks).toEqual([
        {
          taskId: task._id,
          taskRev: task._rev,
          at,
          provisional: false,
          variant: {
            id: task.variant!._id,
            rev: 'variant-rev',
            postId: task.variant!.postId,
            postRev: 'post-rev',
          },
        },
      ])
    }
  })

  it.each([
    'scheduled',
    'publishing',
    'awaiting-manual',
    'published',
    'failed',
  ] as const)(
    'keeps a %s variant at its unchanged instant and flag',
    (status) => {
      const task = fixture().task('ticketsOpen:linkedin')
      task.variant!.status = status
      expect(resultingTask(task, ticketDate)).toEqual({
        at: '2027-03-18T07:00:00.000Z',
        plannedAt: '2027-03-18T07:00:00.000Z',
        provisional: true,
      })
    },
  )

  it('keeps a custom-time draft even when it still equals plannedAt', () => {
    const task = fixture().task('ticketsOpen:linkedin')
    task.variant!.usesCustomTime = true
    expect(resultingTask(task, ticketDate)).toEqual({
      at: '2027-03-18T07:00:00.000Z',
      plannedAt: '2027-03-18T07:00:00.000Z',
      provisional: true,
    })
  })

  it('keeps a post-default hand move despite usesCustomTime being false', () => {
    const task = fixture().task('ticketsOpen:linkedin')
    task.variant!.scheduledAt = '2027-03-18T11:30:00.000Z'
    expect(resultingTask(task, ticketDate)).toEqual({
      at: '2027-03-18T11:30:00.000Z',
      plannedAt: '2027-03-18T07:00:00.000Z',
      provisional: true,
    })
  })

  it('keeps a hand-moved work Task despite a surviving anchor', () => {
    const task = {
      ...fixture().task('linkedinEvent'),
      dueAt: '2027-03-19T11:00:00.000Z',
    }
    expect(resultingTask(task, ticketDate)).toEqual({
      at: '2027-03-19T11:00:00.000Z',
      plannedAt: '2027-03-18T08:00:00.000Z',
      provisional: true,
    })
  })

  it('does not adopt a legacy Task without plannedAt', () => {
    const task = { ...fixture().task('linkedinEvent'), plannedAt: null }
    expect(resultingTask(task, ticketDate)).toEqual({
      at: '2027-03-18T08:00:00.000Z',
      plannedAt: null,
      provisional: true,
    })
  })

  it.each([{ milestone: null }, { offsetDays: null }])(
    'keeps a de-anchored Task at its chosen instant',
    (anchor) => {
      const task = { ...fixture().task('linkedinEvent'), ...anchor }
      expect(resultingTask(task, ticketDate)).toEqual({
        at: '2027-03-18T08:00:00.000Z',
        plannedAt: '2027-03-18T08:00:00.000Z',
        provisional: true,
      })
    },
  )

  it('re-dates a real early-bird milestone and restores fallback when cleared', () => {
    const task = fixture().task('earlyBirdReminder2w:bluesky')
    const changed = resultingTask(task, { earlyBirdEndDate: '2027-05-01' })
    expect(changed).toEqual({
      at: '2027-04-17T16:00:00.000Z',
      plannedAt: '2027-04-17T16:00:00.000Z',
      provisional: false,
    })
    task.variant!.scheduledAt = changed.at!
    task.plannedAt = changed.plannedAt
    task.provisional = changed.provisional
    expect(resultingTask(task, { earlyBirdEndDate: null })).toEqual({
      at: '2027-04-06T16:00:00.000Z',
      plannedAt: '2027-04-06T16:00:00.000Z',
      provisional: true,
    })
  })

  it('clears a provisional flag even when the newly set date matches the fallback', () => {
    expect(
      resultingTask(fixture().task('linkedinEvent'), {
        ticketTargets: { enabled: true, salesStartDate: '2027-03-18' },
      }),
    ).toEqual({
      at: '2027-03-18T08:00:00.000Z',
      plannedAt: '2027-03-18T08:00:00.000Z',
      provisional: false,
    })
  })

  it('re-materializes campaign windows and is idempotent after applying patches', () => {
    const data = fixture()
    const campaign = data.campaigns.find((c) => c.key === 'earlyBird')!
    const task = data.task('linkedinEvent')
    const source = { ...ticketDate, earlyBirdEndDate: '2027-05-01' }
    const plan = run([task], source, [campaign])
    expect(plan.campaigns).toEqual([
      {
        id: campaign._id,
        rev: campaign._rev,
        startDate: '2027-03-30',
        endDate: '2027-05-01',
        provisional: false,
      },
    ])
    expect(plan.tasks[0].at).toBe('2027-03-30T07:00:00.000Z')
    const appliedTask = {
      ...task,
      dueAt: plan.tasks[0].at,
      plannedAt: plan.tasks[0].at,
      provisional: false,
    }
    const appliedCampaign = { ...campaign, ...plan.campaigns[0] }
    expect(run([appliedTask], source, [appliedCampaign])).toEqual({
      tasks: [],
      campaigns: [],
    })
    expect(run([], source, [appliedCampaign])).toEqual({
      tasks: [],
      campaigns: [],
    })
  })

  it('skips an unanchored Campaign instead of failing the whole plan', () => {
    // The Studio schema does not require Campaign anchors, so a repair edit
    // can clear one. `resolveAnchor` then read `.date` off an undefined
    // Milestone entry and threw, and because the planner is one pass over the
    // whole plan, that one Campaign stopped every OTHER Campaign and Task in
    // the edition from being re-dated — on settings saves and on every cron
    // tick alike. The Task loop has always skipped its own unanchored case.
    const data = fixture()
    const anchored = data.campaigns.find((c) => c.key === 'earlyBird')!
    const unanchored = {
      ...data.campaigns.find((c) => c.key !== 'earlyBird')!,
      startMilestone: null,
      endMilestone: null,
      startOffsetDays: null,
      endOffsetDays: null,
    }
    const task = data.task('linkedinEvent')
    const source = { ...ticketDate, earlyBirdEndDate: '2027-05-01' }
    const plan = run([task], source, [unanchored, anchored])
    expect(plan.campaigns.map((c) => c.id)).toEqual([anchored._id])
    expect(plan.tasks[0].at).toBe('2027-03-30T07:00:00.000Z')
  })
})
