/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

const h = vi.hoisted(() => ({
  dataset: [] as Record<string, unknown>[],
  commits: 0,
  failCommit: 0,
  beforeCommit: null as ((n: number) => void) | null,
}))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string, params: Record<string, unknown>) =>
      (await evaluate(parse(query), { dataset: h.dataset, params })).get(),
  },
  clientWrite: {
    transaction: () => {
      const operations: ((dataset: Record<string, unknown>[]) => void)[] = []
      const tx = {
        patch: (id: string, configure: (p: unknown) => unknown) => {
          let revision: string | undefined
          let fields: Record<string, unknown> = {}
          let paths: string[] = []
          const p = {
            ifRevisionId: (rev: string) => {
              revision = rev
              return p
            },
            set: (value: Record<string, unknown>) => {
              fields = value
              return p
            },
            unset: (value: string[]) => {
              paths = value
              return p
            },
          }
          configure(p)
          operations.push((dataset) => {
            const document = dataset.find((row) => row._id === id)
            if (!document || (revision && document._rev !== revision))
              throw Object.assign(new Error('revision mismatch'), {
                statusCode: 409,
              })
            Object.assign(document, fields)
            for (const path of paths) {
              const ref = path.match(/prerequisites\[_ref == "([^"]+)"\]/)?.[1]
              if (ref)
                document.prerequisites = (
                  (document.prerequisites ?? []) as { _ref: string }[]
                ).filter((item) => item._ref !== ref)
            }
            document._rev = `${document._rev}-changed`
          })
          return tx
        },
        delete: (id: string) => {
          operations.push((dataset) => {
            const index = dataset.findIndex((row) => row._id === id)
            if (index >= 0) dataset.splice(index, 1)
          })
          return tx
        },
        commit: async () => {
          h.commits++
          h.beforeCommit?.(h.commits)
          if (h.commits === h.failCommit)
            throw Object.assign(new Error('revision mismatch'), {
              statusCode: 409,
            })
          // Sanity transactions roll back the ENTIRE batch on a stale guard.
          const next = structuredClone(h.dataset)
          operations.forEach((operation) => operation(next))
          // Stored reference strength, not the Studio schema, blocks deletion.
          const deleted = new Set(
            h.dataset
              .filter(
                (row) => !next.some((remaining) => remaining._id === row._id),
              )
              .map((row) => row._id),
          )
          const assertReferences = (value: unknown): void => {
            if (!value || typeof value !== 'object') return
            if (Array.isArray(value)) {
              value.forEach(assertReferences)
              return
            }
            const object = value as Record<string, unknown>
            if (
              object._type === 'reference' &&
              object._weak !== true &&
              deleted.has(object._ref)
            ) {
              throw new Error(`strong reference still points at ${object._ref}`)
            }
            Object.values(object).forEach(assertReferences)
          }
          next.forEach(assertReferences)
          h.dataset = next
        },
      }
      return tx
    },
  },
}))

import { deletionPreview, deletePlanTree, readDeletionTree } from './index'
import { snapshotDocument } from '../snapshots/engine'

const ref = (_ref: string) => ({ _type: 'reference', _ref })
const doc = (
  _id: string,
  _type: string,
  fields: Record<string, unknown> = {},
) => ({ _id, _type, _rev: `rev-${_id}`, conference: ref('conf-A'), ...fields })
function task(n: number, status = 'draft', campaign = 'camp') {
  return [
    doc(`task-${n}`, 'marketingTask', {
      plan: ref('plan'),
      campaign: ref(campaign),
      variant: ref(`variant-${n}`),
    }),
    doc(`variant-${n}`, 'socialPostVariant', {
      post: ref(`post-${n}`),
      status,
      publishResult: { url: `https://bsky.app/post/${n}` },
      attempts: [{ outcome: 'published', at: '2026-09-01' }],
    }),
    doc(`post-${n}`, 'socialPost', { title: `Post ${n}` }),
  ]
}
const byId = (id: string) => h.dataset.find((row) => row._id === id)
beforeEach(() => {
  h.commits = 0
  h.failCommit = 0
  h.beforeCommit = null
  h.dataset = [
    doc('plan', 'marketingPlan'),
    doc('camp', 'marketingCampaign', { key: 'cfp', plan: ref('plan') }),
    doc('snap', 'marketingSnapshot', {
      campaignKey: 'cfp',
      campaign: { ...ref('old-camp'), _weak: true },
      primaryOutcomeValue: 42,
    }),
  ]
})

describe('deletion read and refusals', () => {
  it('reads one selected tenant tree with server-computed counts, preserved readings, and published values', async () => {
    h.dataset.push(
      ...task(1, 'published'),
      ...task(2, 'awaiting-manual'),
      doc('foreign', 'marketingTask', {
        conference: ref('conf-B'),
        plan: ref('plan'),
      }),
    )
    const tree = await readDeletionTree('conf-A', 'camp')
    expect(deletionPreview(tree!)).toEqual({
      campaigns: 1,
      tasks: 2,
      publishedTasks: 1,
      snapshots: 1,
      requiresTypedConfirmation: true,
    })
    expect(tree!.tasks.map((t) => t._id)).toEqual(['task-1', 'task-2'])
    const published = structuredClone(byId('variant-1'))
    expect(
      await deletePlanTree({
        conferenceId: 'conf-A',
        tree: tree!,
        deletePlan: false,
      }),
    ).toBe(true)
    expect(byId('variant-1')).toEqual(published)
    expect(byId('post-1')?.title).toBe('Post 1')
    expect(byId('snap')?.primaryOutcomeValue).toBe(42)
    expect(byId('plan')?.structurallyEdited).toBe(true)
    expect(
      h.dataset.filter((row) =>
        ['task-1', 'task-2', 'variant-2', 'post-2', 'camp'].includes(
          row._id as string,
        ),
      ),
    ).toEqual([])
  })
  it('refuses publishing BEFORE any destruction, with the exact actionable message', async () => {
    h.dataset.push(...task(1, 'publishing'))
    const tree = await readDeletionTree('conf-A')
    expect(() => deletionPreview(tree!)).toThrow(
      'The post is being published right now. Try again in a minute.',
    )
    await expect(
      deletePlanTree({ conferenceId: 'conf-A', tree: tree!, deletePlan: true }),
    ).rejects.toThrow(
      'The post is being published right now. Try again in a minute.',
    )
    expect(byId('variant-1')?.status).toBe('publishing')
    expect(h.commits).toBe(0)
  })
  it('retains a post with a surviving sibling and never deletes a foreign post', async () => {
    h.dataset.push(
      ...task(1),
      doc('other-variant', 'socialPostVariant', {
        post: ref('post-1'),
        status: 'published',
      }),
      ...task(2),
    )
    byId('post-2')!.conference = ref('conf-B')
    const tree = await readDeletionTree('conf-A')
    expect(
      await deletePlanTree({
        conferenceId: 'conf-A',
        tree: tree!,
        deletePlan: true,
      }),
    ).toBe(true)
    expect(byId('post-1')?.title).toBe('Post 1')
    expect(byId('other-variant')?.status).toBe('published')
    expect(byId('post-2')?.title).toBe('Post 2')
  })
  it('stored weak snapshot references permit deletion while a strong reference blocks it', async () => {
    const snapshot = snapshotDocument({
      campaign: {
        _id: 'camp',
        key: 'cfp',
        title: 'CFP',
        primaryOutcome: 'cfpSubmissions',
        startDate: '2026-01-01',
        endDate: '2026-02-01',
      },
      tasks: [],
      conferenceId: 'conf-A',
      date: '2026-02-01',
      takenAt: '2026-02-02T00:00:00Z',
      rows: [],
      proposals: [],
      tickets: [],
      engagement: new Map(),
      source: { posthog: 'ok', bluesky: 'ok' },
      now: new Date('2026-02-02T00:00:00Z'),
    })
    h.dataset.push({
      ...snapshot,
      campaign: { _type: 'reference', _ref: 'camp' },
    })
    const tree = await readDeletionTree('conf-A', 'camp')
    await expect(
      deletePlanTree({
        conferenceId: 'conf-A',
        tree: tree!,
        deletePlan: false,
      }),
    ).rejects.toThrow('strong reference still points at camp')
    expect(byId('camp')?.key).toBe('cfp')
    byId(snapshot._id)!.campaign = snapshot.campaign
    expect(
      await deletePlanTree({
        conferenceId: 'conf-A',
        tree: tree!,
        deletePlan: false,
      }),
    ).toBe(true)
    expect(byId(snapshot._id)?.campaignTitle).toBe('CFP')
    expect(byId(snapshot._id)?.primaryOutcomeValue).toBe(0)
    expect(byId('plan')?.structurallyEdited).toBe(true)
  })
  it('deletes draft twins and groups two selected variants sharing one post', async () => {
    h.dataset.push(...task(1), ...task(2))
    byId('variant-2')!.post = ref('post-1')
    h.dataset = h.dataset.filter((row) => row._id !== 'post-2')
    h.dataset.push(
      doc('drafts.task-1', 'marketingTask'),
      doc('drafts.variant-1', 'socialPostVariant'),
      doc('drafts.post-1', 'socialPost'),
      doc('drafts.camp', 'marketingCampaign'),
      doc('drafts.plan', 'marketingPlan'),
    )
    const tree = await readDeletionTree('conf-A')
    expect(deletionPreview(tree!).tasks).toBe(2)
    expect(
      await deletePlanTree({
        conferenceId: 'conf-A',
        tree: tree!,
        deletePlan: true,
      }),
    ).toBe(true)
    expect(h.dataset.map((row) => row._id)).toEqual(['snap'])
  })
  it('only unlinks surviving dependants, so selected dependant guards remain valid', async () => {
    h.dataset.push(
      ...task(1),
      ...task(2),
      doc('survivor', 'marketingTask', {
        campaign: ref('other-camp'),
        plan: ref('plan'),
        prerequisites: [ref('task-1'), ref('keep')],
      }),
    )
    byId('task-2')!.prerequisites = [ref('task-1')]
    const tree = await readDeletionTree('conf-A', 'camp')
    expect(
      await deletePlanTree({
        conferenceId: 'conf-A',
        tree: tree!,
        deletePlan: false,
      }),
    ).toBe(true)
    expect(byId('survivor')?.prerequisites).toEqual([ref('keep')])
    expect(byId('plan')?.structurallyEdited).toBe(true)
  })
  it('deduplicates a shared variant and retains one needed by a surviving Task', async () => {
    h.dataset.push(
      ...task(1),
      doc('task-shared', 'marketingTask', {
        campaign: ref('camp'),
        plan: ref('plan'),
        variant: ref('variant-1'),
      }),
    )
    let tree = await readDeletionTree('conf-A', 'camp')
    expect(
      await deletePlanTree({
        conferenceId: 'conf-A',
        tree: tree!,
        deletePlan: false,
      }),
    ).toBe(true)
    expect(h.dataset.map((row) => row._id).sort()).toEqual(['plan', 'snap'])
    h.dataset.push(
      doc('camp', 'marketingCampaign', { key: 'cfp', plan: ref('plan') }),
      ...task(2),
      doc('task-survives', 'marketingTask', {
        campaign: ref('other-camp'),
        plan: ref('plan'),
        variant: ref('variant-2'),
      }),
    )
    tree = await readDeletionTree('conf-A', 'camp')
    expect(
      await deletePlanTree({
        conferenceId: 'conf-A',
        tree: tree!,
        deletePlan: false,
      }),
    ).toBe(true)
    expect(byId('variant-2')?.status).toBe('draft')
    expect(byId('post-2')?.title).toBe('Post 2')
  })
})

describe('transaction boundary safety', () => {
  it('a publisher claim at a chunk boundary rolls back the entire Task bundle', async () => {
    for (let n = 0; n < 15; n++) h.dataset.push(...task(n))
    const tree = await readDeletionTree('conf-A')
    h.beforeCommit = (n) => {
      if (n === 2) {
        byId('variant-6')!._rev = 'publisher-claim'
        byId('variant-6')!.status = 'publishing'
      }
    }
    expect(
      await deletePlanTree({
        conferenceId: 'conf-A',
        tree: tree!,
        deletePlan: true,
      }),
    ).toBe(false)
    expect(byId('variant-6')?.status).toBe('publishing')
    expect(byId('post-6')?.title).toBe('Post 6')
    expect(byId('task-6')?._id).toBe('task-6')
    expect(byId('plan')?._id).toBe('plan')
  })
  it('records divergence in the first destructive campaign chunk, including partial failure and retry', async () => {
    for (let n = 0; n < 15; n++) h.dataset.push(...task(n))
    const tree = await readDeletionTree('conf-A', 'camp')
    h.failCommit = 2
    expect(
      await deletePlanTree({
        conferenceId: 'conf-A',
        tree: tree!,
        deletePlan: false,
      }),
    ).toBe(false)
    expect(byId('plan')?.structurallyEdited).toBe(true)
    expect(byId('camp')?.key).toBe('cfp')
    h.failCommit = 0
    const remaining = await readDeletionTree('conf-A', 'camp')
    expect(
      await deletePlanTree({
        conferenceId: 'conf-A',
        tree: remaining!,
        deletePlan: false,
      }),
    ).toBe(true)
    expect(h.dataset.map((row) => row._id).sort()).toEqual(['plan', 'snap'])
    expect(byId('plan')?.structurallyEdited).toBe(true)
  })
  it('partial failure retains the plan and a fresh read completes the remainder', async () => {
    for (let n = 0; n < 15; n++) h.dataset.push(...task(n))
    const tree = await readDeletionTree('conf-A')
    h.failCommit = 2
    expect(
      await deletePlanTree({
        conferenceId: 'conf-A',
        tree: tree!,
        deletePlan: true,
      }),
    ).toBe(false)
    expect(byId('plan')?._id).toBe('plan')
    expect(
      h.dataset.filter((row) => row._type === 'marketingTask').length,
    ).toBeGreaterThan(0)
    h.failCommit = 0
    const remaining = await readDeletionTree('conf-A')
    expect(
      await deletePlanTree({
        conferenceId: 'conf-A',
        tree: remaining!,
        deletePlan: true,
      }),
    ).toBe(true)
    expect(h.dataset.map((row) => row._id)).toEqual(['snap'])
    expect(byId('snap')?.primaryOutcomeValue).toBe(42)
  })
})
