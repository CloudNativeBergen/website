// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'
const h = vi.hoisted(() => ({
  docs: [] as Record<string, unknown>[],
  guards: [] as string[],
}))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string, params: Record<string, unknown>) =>
      (await evaluate(parse(query), { dataset: h.docs, params })).get(),
  },
  clientWrite: {
    transaction: () => {
      const writes: (() => void)[] = []
      const tx = {
        create: (doc: Record<string, unknown>) => {
          writes.push(() => {
            h.docs.push(doc)
          })
          return tx
        },
        patch: (id: string, fn: (p: unknown) => unknown) => {
          const p = {
            ifRevisionId: (rev: string) => {
              h.guards.push(rev)
              return p
            },
            set: (fields: Record<string, unknown>) => {
              writes.push(() =>
                Object.assign(
                  h.docs.find((d) => d._id === id)!,
                  fields,
                ),
              )
              return p
            },
            unset: (fields: string[]) => {
              writes.push(() => {
                for (const field of fields)
                  delete h.docs.find((d) => d._id === id)![field]
              })
              return p
            },
          }
          fn(p)
          return tx
        },
        commit: async () => {
          writes.forEach((w) => w())
          return {}
        },
      }
      return tx
    },
  },
}))
import {
  readCampaignForEditing,
  updateCampaign,
  createCampaign,
  campaignWindow,
} from './campaign'
import { resolveAllMilestones } from '../milestones'
const conference = {
  cfpStartDate: '2027-01-01',
  cfpEndDate: '2027-02-01',
  cfpNotifyDate: '2027-03-01',
  programDate: '2027-04-01',
  startDate: '2027-06-01',
  endDate: '2027-06-02',
}
const ref = (_ref: string) => ({ _type: 'reference', _ref })
beforeEach(() => {
  h.guards.length = 0
  h.docs = [
    {
      _id: 'plan',
      _type: 'marketingPlan',
      conference: ref('conf'),
      structurallyEdited: false,
    },
    {
      _id: 'campaign',
      _rev: 'c-rev',
      _type: 'marketingCampaign',
      conference: ref('conf'),
      plan: ref('plan'),
      key: 'cfp',
      title: 'CFP',
      primaryOutcome: 'cfpSubmissions',
      startDate: '2027-01-01',
      endDate: '2027-02-01',
    },
    {
      _id: 'task',
      _type: 'marketingTask',
      campaign: ref('campaign'),
      dueAt: '2027-01-03T10:00:00Z',
    },
  ]
})
it('materializes the exact new window and leaves an out-of-band Task date untouched', async () => {
  const window = campaignWindow(
    {
      startMilestone: 'CFP_OPEN',
      startOffsetDays: 10,
      endMilestone: 'EARLY_BIRD_END',
      endOffsetDays: 0,
    },
    resolveAllMilestones(conference),
  )
  expect(window).toMatchObject({
    startDate: '2027-01-11',
    endDate: '2027-04-01',
    provisional: true,
  })
  await updateCampaign('campaign', 'c-rev', 'plan', {
    ...window,
    title: 'Edited',
  })
  expect(h.docs.find((d) => d._id === 'campaign')).toMatchObject({
    startDate: '2027-01-11',
    endDate: '2027-04-01',
    provisional: true,
    title: 'Edited',
    key: 'cfp',
  })
  expect(h.docs.find((d) => d._id === 'task')?.dueAt).toBe(
    '2027-01-03T10:00:00Z',
  )
  expect(h.docs.find((d) => d._id === 'plan')?.structurallyEdited).toBe(true)
  expect(h.guards).toEqual(['c-rev'])
})
it('creates a custom Campaign and records structural divergence in the same transaction', async () => {
  const window = campaignWindow(
    {
      startMilestone: 'CFP_OPEN',
      startOffsetDays: 0,
      endMilestone: 'CFP_CLOSE',
      endOffsetDays: 0,
    },
    resolveAllMilestones(conference),
  )
  await createCampaign({
    _id: 'custom',
    planId: 'plan',
    conferenceId: 'conf',
    key: 'custom-uuid',
    title: 'Custom',
    primaryOutcome: 'cfpSubmissions',
    target: 0,
    outcomeTargetPage: null,
    triggers: [],
    optional: false,
    ...window,
  })
  expect(h.docs.find((d) => d._id === 'custom')).toMatchObject({
    key: 'custom-uuid',
    target: 0,
    optional: false,
    triggers: [],
  })
  expect(h.docs.find((d) => d._id === 'plan')?.structurallyEdited).toBe(true)
})
it('reads editing metadata only in the owning conference', async () => {
  expect(await readCampaignForEditing('campaign', 'conf')).toMatchObject({
    _rev: 'c-rev',
    key: 'cfp',
    planId: 'plan',
  })
  expect(await readCampaignForEditing('campaign', 'foreign')).toBeNull()
})

it('using the plan does not mark structural divergence: assign, reschedule, approve, complete and skip', async () => {
  const { updateTaskFields, setTaskDate, approveTask } =
    await import('../sanity')
  await updateTaskFields('task', 'r', { assignee: ref('organizer') })
  expect(h.docs.find((d) => d._id === 'task')?.assignee).toEqual(
    ref('organizer'),
  )
  expect(h.docs.find((d) => d._id === 'plan')?.structurallyEdited).toBe(false)
  await setTaskDate({
    taskId: 'task',
    taskRev: 'r',
    at: '2027-01-05T10:00:00Z',
    variant: null,
  })
  expect(h.docs.find((d) => d._id === 'task')?.dueAt).toBe(
    '2027-01-05T10:00:00Z',
  )
  expect(h.docs.find((d) => d._id === 'plan')?.structurallyEdited).toBe(false)
  await approveTask({
    taskId: 'task',
    taskRev: 'r',
    by: 'organizer',
    at: '2027-01-04T10:00:00Z',
    variant: null,
  })
  expect(h.docs.find((d) => d._id === 'task')?.approvedAt).toBe(
    '2027-01-04T10:00:00Z',
  )
  expect(h.docs.find((d) => d._id === 'plan')?.structurallyEdited).toBe(false)
  for (const status of ['done', 'skipped']) {
    await updateTaskFields('task', 'r', { status })
    expect(h.docs.find((d) => d._id === 'task')?.status).toBe(status)
    expect(h.docs.find((d) => d._id === 'plan')?.structurallyEdited).toBe(false)
  }
})
