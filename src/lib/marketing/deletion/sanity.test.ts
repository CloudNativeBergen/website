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
        create: (document: Record<string, unknown>) => {
          operations.push((dataset) => {
            if (dataset.some((row) => row._id === document._id)) {
              throw Object.assign(
                new Error(`document ${document._id} already exists`),
                { statusCode: 409 },
              )
            }
            dataset.push({
              ...structuredClone(document),
              _rev: `rev-${document._id}`,
            })
          })
          return tx
        },
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
import { commitSeedPlan, getPlanView } from '../sanity'
import { expandTemplate } from '../seed'
import { BUILTIN_TEMPLATE } from '../template'
import { buildReport, reportRange } from '../report/model'

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
  it('refuses while any Snapshot still holds a STRONG campaign reference, before destroying a single Task', async () => {
    // Sanity will not delete a document a strong reference points at, and
    // deletion commits its Task chunks FIRST. Without this refusal the Tasks
    // are destroyed and the Campaign chunk then fails with a 409 that reads as
    // an ordinary revision conflict — so the organizer retries forever while
    // the plan is already unrecoverable.
    h.dataset.push(
      ...task(1),
      doc('legacy-snap', 'marketingSnapshot', {
        campaignKey: 'cfp',
        // No `_weak`: written before migration 052.
        campaign: ref('camp'),
        primaryOutcomeValue: 7,
      }),
    )
    const tree = await readDeletionTree('conf-A')
    expect(tree!.strongSnapshots).toBe(1)
    expect(() => deletionPreview(tree!)).toThrow(
      '052-weaken-snapshot-campaign-ref',
    )
    await expect(
      deletePlanTree({ conferenceId: 'conf-A', tree: tree!, deletePlan: true }),
    ).rejects.toThrow('052-weaken-snapshot-campaign-ref')
    // The load-bearing assertions: nothing was committed and the tree stands.
    expect(h.commits).toBe(0)
    expect(byId('task-1')).toBeDefined()
    expect(byId('variant-1')).toBeDefined()
    expect(byId('camp')).toBeDefined()
    expect(byId('plan')).toBeDefined()
  })
  it('deletes once every Snapshot reference has been weakened by the migration', async () => {
    h.dataset.push(
      ...task(1),
      doc('legacy-snap', 'marketingSnapshot', {
        campaignKey: 'cfp',
        campaign: { ...ref('camp'), _weak: true },
        primaryOutcomeValue: 7,
      }),
    )
    const tree = await readDeletionTree('conf-A')
    expect(tree!.strongSnapshots).toBe(0)
    expect(
      await deletePlanTree({
        conferenceId: 'conf-A',
        tree: tree!,
        deletePlan: true,
      }),
    ).toBe(true)
    expect(byId('task-1')).toBeUndefined()
    expect(byId('camp')).toBeUndefined()
    expect(byId('plan')).toBeUndefined()
    // The reading itself survives the plan that produced it.
    expect(byId('legacy-snap')?.primaryOutcomeValue).toBe(7)
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
    // The block is now raised by `deletionPreview` up front, not by Sanity
    // after the Task chunks have already committed. `h.commits` is the
    // assertion that matters: the refusal costs nothing.
    const before = h.commits
    await expect(
      deletePlanTree({
        conferenceId: 'conf-A',
        tree: tree!,
        deletePlan: false,
      }),
    ).rejects.toThrow('052-weaken-snapshot-campaign-ref')
    expect(h.commits).toBe(before)
    expect(byId('camp')?.key).toBe('cfp')
    byId(snapshot._id)!.campaign = snapshot.campaign
    const weakened = await readDeletionTree('conf-A', 'camp')
    expect(weakened!.strongSnapshots).toBe(0)
    expect(
      await deletePlanTree({
        conferenceId: 'conf-A',
        tree: weakened!,
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

describe('delete and seed again', () => {
  it('reuses the deterministic plan id while preserving published proof and keyed measurement', async () => {
    h.dataset = []
    let sequence = 0
    // One real Campaign/beat exercises the same writers and joins without
    // making groq-js scan the entire conference template under suite contention.
    const cfpRecipe = BUILTIN_TEMPLATE.campaigns.find((c) => c.key === 'cfp')!
    const template = {
      ...BUILTIN_TEMPLATE,
      campaigns: [
        {
          ...cfpRecipe,
          recipes: cfpRecipe.recipes.filter((r) => r.beat === 'cfpOpen'),
        },
      ],
    }
    const seed = () =>
      expandTemplate({
        template,
        conference: {
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
        },
        includeOptional: [],
        ownerId: 'owner',
        now: '2026-09-14T10:00:00Z',
        newId: (type) => `${type}.${++sequence}`,
      })
    const original = seed()
    expect(await commitSeedPlan(original)).toEqual({ committed: true })
    expect(original.plan._id).toBe('marketingPlan.conf-A')
    // This exercises create's actual collision behavior, not an assumed ID.
    expect(await commitSeedPlan(seed())).toEqual({
      committed: false,
      reason: 'exists',
    })
    const variantId = original.variants[0]._id
    const postId = original.variants[0].postId
    const attempts = [
      {
        _key: 'published-attempt',
        at: '2027-01-15T10:00:00Z',
        outcome: 'published',
        url: 'https://bsky.app/profile/event/post/123',
      },
    ]
    Object.assign(byId(variantId)!, {
      status: 'published',
      attempts,
      publishResult: {
        url: 'https://bsky.app/profile/event/post/123',
        externalId: 'irreversible-proof',
      },
    })
    const published = structuredClone(byId(variantId))
    const post = structuredClone(byId(postId))
    const campaign = original.campaigns.find((c) => c.key === 'cfp')!
    const snapshot = snapshotDocument({
      campaign,
      tasks: [],
      conferenceId: 'conf-A',
      date: '2027-03-01',
      takenAt: '2027-03-02T04:00:00Z',
      now: new Date('2027-03-02T04:00:00Z'),
      proposals: [{ createdAt: '2027-01-15T12:00:00Z', utmCampaign: 'cfp' }],
      tickets: [],
      rows: [],
      engagement: new Map(),
      source: { posthog: 'ok', bluesky: 'ok' },
    })
    h.dataset.push({ ...snapshot })
    const tree = await readDeletionTree('conf-A')
    expect(deletionPreview(tree!).publishedTasks).toBe(1)
    expect(
      await deletePlanTree({
        conferenceId: 'conf-A',
        tree: tree!,
        deletePlan: true,
      }),
    ).toBe(true)
    expect(byId(variantId)).toEqual(published)
    expect(byId(postId)).toEqual(post)
    expect(byId(snapshot._id)).toMatchObject({
      campaignKey: 'cfp',
      campaignTitle: campaign.title,
      campaignPrimaryOutcome: 'cfpSubmissions',
      primaryOutcomeValue: 1,
    })
    const replacement = seed()
    expect(await commitSeedPlan(replacement)).toEqual({ committed: true })
    expect(replacement.plan._id).toBe(original.plan._id)
    expect(replacement.campaigns.find((c) => c.key === 'cfp')?._id).not.toBe(
      campaign._id,
    )
    expect(byId(variantId)?.publishResult).toEqual({
      url: 'https://bsky.app/profile/event/post/123',
      externalId: 'irreversible-proof',
    })
    expect(byId(variantId)?.attempts).toEqual(attempts)
    const plan = await getPlanView('conf-A')
    const report = buildReport({
      conference: { id: 'conf-A', title: 'Event' },
      plan,
      snapshots: [snapshot],
      range: reportRange(plan!.campaigns, '2027-06-10', {}),
      today: '2027-03-02',
    })
    expect(report.summary.find((c) => c.key === 'cfp')).toMatchObject({
      value: 1,
      primaryOutcome: 'cfpSubmissions',
    })
  })
})
