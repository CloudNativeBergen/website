/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

const h = vi.hoisted(() => {
  const ops: { id: string; rev?: string; set?: unknown }[] = []
  const state = { error: null as Error | null }
  const tx = {
    patch(
      id: string,
      fn: (p: {
        ifRevisionId: (rev: string) => { set: (value: unknown) => unknown }
      }) => unknown,
    ) {
      const op = { id } as (typeof ops)[number]
      const patch = {
        ifRevisionId(rev: string) {
          op.rev = rev
          return patch
        },
        set(set: unknown) {
          op.set = set
          return patch
        },
      }
      fn(patch)
      ops.push(op)
      return tx
    },
    async commit() {
      if (state.error) throw state.error
      return {}
    },
  }
  return { ops, state, tx, dataset: [] as Record<string, unknown>[] }
})
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string, params: Record<string, unknown>) =>
      (await evaluate(parse(query), { dataset: h.dataset, params })).get(),
  },
  clientWrite: { transaction: () => h.tx },
}))
import {
  applyRedates,
  getRedatablePlan,
  getRedateCandidates,
} from './redate-sanity'

const ref = (_ref: string) => ({ _type: 'reference', _ref })
const at = '2027-02-02T08:00:00.000Z'
beforeEach(() => {
  h.ops.length = 0
  h.dataset.length = 0
  h.state.error = null
  h.dataset.push(
    { _id: 'a', _type: 'conference', earlyBirdEndDate: '2027-02-02' },
    { _id: 'plan-a', _rev: 'rp', _type: 'marketingPlan', conference: ref('a') },
    { _id: 'plan-b', _rev: 'rb', _type: 'marketingPlan', conference: ref('b') },
    {
      _id: 'campaign-a',
      _rev: 'rc',
      _type: 'marketingCampaign',
      conference: ref('a'),
      plan: ref('plan-a'),
    },
    { _id: 'post-a', _rev: 'rpost', _type: 'socialPost', conference: ref('a') },
    {
      _id: 'variant-a',
      _rev: 'rv',
      _type: 'socialPostVariant',
      conference: ref('a'),
      post: ref('post-a'),
      status: 'draft',
      scheduledAt: at,
      usesCustomTime: false,
    },
    {
      _id: 'task-a',
      _rev: 'rt',
      _type: 'marketingTask',
      conference: ref('a'),
      plan: ref('plan-a'),
      variant: ref('variant-a'),
      kind: 'publishing',
      milestone: 'EARLY_BIRD_END',
      offsetDays: 0,
      plannedAt: at,
    },
    {
      _id: 'foreign-task',
      _type: 'marketingTask',
      conference: ref('b'),
      plan: ref('plan-a'),
    },
    {
      _id: 'foreign-campaign',
      _type: 'marketingCampaign',
      conference: ref('b'),
      plan: ref('plan-a'),
    },
  )
})
describe('re-date persistence', () => {
  it('reads one scoped snapshot including both variant and post revisions', async () => {
    const result = await getRedatablePlan('a')
    expect(result).toMatchObject({
      planId: 'plan-a',
      planRev: 'rp',
      conference: { earlyBirdEndDate: '2027-02-02' },
    })
    expect(result?.tasks.map((t) => t._id)).toEqual(['task-a'])
    expect(result?.campaigns.map((c) => c._id)).toEqual(['campaign-a'])
    expect(result?.tasks[0].variant).toMatchObject({
      _id: 'variant-a',
      _rev: 'rv',
      postId: 'post-a',
      postRev: 'rpost',
      scheduledAt: at,
    })
  })
  it.each(['variant-a', 'post-a'])(
    'refuses a foreign %s while retaining the own task',
    async (id) => {
      h.dataset.find((d) => d._id === id)!.conference = ref('b')
      const result = await getRedatablePlan('a')
      expect(result?.tasks.map((t) => [t._id, t.variant])).toEqual([
        ['task-a', null],
      ])
    },
  )
  it('patches every date and revision, including post and plan, in one transaction', async () => {
    expect(
      await applyRedates(
        {
          tasks: [
            {
              taskId: 'task-a',
              taskRev: 'rt',
              at,
              provisional: false,
              variant: {
                id: 'variant-a',
                rev: 'rv',
                postId: 'post-a',
                postRev: 'rpost',
              },
            },
            {
              taskId: 'task-work',
              taskRev: 'rw',
              at,
              provisional: false,
              variant: null,
            },
          ],
          campaigns: [
            {
              id: 'campaign-a',
              rev: 'rc',
              startDate: '2027-02-02',
              endDate: '2027-03-02',
              provisional: false,
            },
          ],
        },
        { planId: 'plan-a', planRev: 'rp' },
        at,
      ),
    ).toBe(true)
    expect(h.ops).toEqual([
      { id: 'plan-a', rev: 'rp', set: { lastRedatedAt: at } },
      { id: 'variant-a', rev: 'rv', set: { scheduledAt: at } },
      { id: 'post-a', rev: 'rpost', set: { defaultScheduledAt: at } },
      { id: 'task-a', rev: 'rt', set: { plannedAt: at, provisional: false } },
      {
        id: 'task-work',
        rev: 'rw',
        set: { dueAt: at, plannedAt: at, provisional: false },
      },
      {
        id: 'campaign-a',
        rev: 'rc',
        set: {
          startDate: '2027-02-02',
          endDate: '2027-03-02',
          provisional: false,
        },
      },
    ])
  })
  it('stamps an unchanged plan so fair rotation advances', async () => {
    expect(
      await applyRedates(
        { tasks: [], campaigns: [] },
        { planId: 'plan-a', planRev: 'rp' },
        at,
      ),
    ).toBe(true)
    expect(h.ops).toEqual([
      { id: 'plan-a', rev: 'rp', set: { lastRedatedAt: at } },
    ])
  })
  it('maps revision conflict to a retryable result', async () => {
    h.state.error = Object.assign(new Error('conflict'), { statusCode: 409 })
    expect(
      await applyRedates(
        { tasks: [], campaigns: [] },
        { planId: 'plan-a', planRev: 'rp' },
        at,
      ),
    ).toBe(false)
  })
  it('lists work independently of conference end dates, including legacy missing custom-time flags', async () => {
    delete h.dataset.find((d) => d._id === 'variant-a')!.usesCustomTime
    expect(await getRedateCandidates()).toEqual([
      { planId: 'plan-a', conferenceId: 'a', lastRedatedAt: null },
    ])
  })
  it.each([
    ['variant-a', 'usesCustomTime', true],
    ['variant-a', 'status', 'scheduled'],
    ['variant-a', 'scheduledAt', '2027-03-02T08:00:00.000Z'],
    ['post-a', 'conference', ref('b')],
  ])(
    'leaves only genuinely movable work eligible (%s.%s)',
    async (id, key, value) => {
      h.dataset.find((d) => d._id === id)![key] = value
      h.dataset.push({
        _id: 'work-b',
        _type: 'marketingTask',
        conference: ref('b'),
        plan: ref('plan-b'),
        milestone: 'EARLY_BIRD_END',
        offsetDays: 0,
        kind: 'asset',
        status: 'open',
        dueAt: at,
        plannedAt: at,
      })
      expect((await getRedateCandidates()).map((p) => p.planId)).toEqual([
        'plan-b',
      ])
    },
  )
})
