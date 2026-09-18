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

/**
 * Run a refusal without letting the FIRST failed expectation hide the rest.
 *
 * Asserting `toThrow` first means a guard-removal mutation fails on "expected
 * to throw" — an absence — and the `h.commits` assertion that proves nothing
 * was destroyed never runs at all. Capturing both outcomes lets the
 * destruction check come first, so the test fails on state.
 */
async function attemptDelete(
  tree: NonNullable<Awaited<ReturnType<typeof readDeletionTree>>>,
  deletePlan = true,
) {
  const preview = (() => {
    try {
      deletionPreview(tree)
      return 'RESOLVED'
    } catch (error) {
      return (error as Error).message
    }
  })()
  const applied = await deletePlanTree({
    conferenceId: 'conf-A',
    tree,
    deletePlan,
  }).then(
    () => 'RESOLVED',
    (error: Error) => error.message,
  )
  return { preview, applied }
}

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
  it('refuses while an unpublished Studio document still references the plan', async () => {
    // marketingTask.campaign/.plan and marketingCampaign.plan are STRONG too,
    // and deletePlanTree only removes `drafts.<id>` for documents IN the tree.
    // A Studio document created and never published has no published twin, so
    // it is invisible to the tree and its strong reference refuses the delete
    // after the Task chunks have already committed — the round-1 catastrophe
    // through a second door.
    h.dataset.push(
      ...task(1),
      doc('drafts.studio-task', 'marketingTask', {
        campaign: ref('camp'),
        plan: ref('plan'),
        key: 'hand-made',
      }),
    )
    const tree = await readDeletionTree('conf-A')
    expect(tree!.strongOwnerRefs).toBe(1)
    const outcome = await attemptDelete(tree!)
    expect(h.commits).toBe(0)
    expect(byId('task-1')).toBeDefined()
    expect(byId('camp')).toBeDefined()
    expect(outcome.applied).toContain('old-style strong link')
    expect(outcome.preview).toContain('old-style strong link')
  })
  it('does not let an unrelated half-filled draft refuse a Campaign delete', async () => {
    // A campaign-scoped delete does not remove the plan, so the plan id is
    // never in the target set and a document referencing only the plan is not
    // a blocker. An earlier version passed a null plan id into GROQ, which
    // matched every document whose `plan` was unset and refused every Campaign
    // delete in the dataset.
    h.dataset.push(
      ...task(1),
      doc('drafts.unrelated', 'marketingTask', { key: 'no-refs-at-all' }),
      doc('drafts.other-plan', 'marketingTask', {
        campaign: ref('some-other-campaign'),
        plan: ref('some-other-plan'),
        key: 'another-edition',
      }),
    )
    const tree = await readDeletionTree('conf-A', 'camp')
    expect(tree!.strongOwnerRefs).toBe(0)
    expect(
      await deletePlanTree({
        conferenceId: 'conf-A',
        tree: tree!,
        deletePlan: false,
      }),
    ).toBe(true)
    expect(byId('task-1')).toBeUndefined()
    expect(byId('drafts.unrelated')).toBeDefined()
  })
  it('refuses on a foreign-edition Snapshot, and on a strong perTask Task link', async () => {
    // Round 7a. The snapshot count only looked at `campaign`, and only within
    // this conference — so a `conf-B` snapshot pointing at our Campaign, and a
    // strong `perTask[].task`, were each a live half-destroy on un-migrated
    // data. Both are counted now, at any conference, on either field.
    h.dataset.push(
      ...task(1),
      doc('foreign-snap', 'marketingSnapshot', {
        conference: ref('conf-B'),
        campaign: ref('camp'),
        date: '2027-01-01',
      }),
    )
    const foreign = await readDeletionTree('conf-A')
    expect(foreign!.strongOwnerRefs).toBe(1)
    expect((await attemptDelete(foreign!)).applied).toContain(
      'old-style strong link',
    )
    expect(h.commits).toBe(0)

    h.dataset.length = 0
    h.dataset.push(
      doc('plan', 'marketingPlan'),
      doc('camp', 'marketingCampaign', { key: 'cfp', plan: ref('plan') }),
      ...task(1),
      doc('per-task-snap', 'marketingSnapshot', {
        conference: ref('conf-A'),
        campaign: { ...ref('camp'), _weak: true },
        perTask: [{ _key: 'k', task: ref('task-1') }],
        date: '2027-01-01',
      }),
    )
    const perTask = await readDeletionTree('conf-A')
    expect(perTask!.strongOwnerRefs).toBe(1)
    expect((await attemptDelete(perTask!)).applied).toContain(
      'old-style strong link',
    )
    expect(h.commits).toBe(0)
    expect(byId('task-1')).toBeDefined()
  })
  it('refuses on a prerequisite link the delete would never unset', async () => {
    // Round 7b. `prerequisites` was skipped on EVERY document, but the delete
    // only unsets it on `survivingDependantIds` — which is conference-scoped
    // and excludes drafts and versions. A foreign holder was therefore neither
    // unset nor counted, reopening rounds 3 and 4 through that one field.
    h.dataset.push(
      ...task(1),
      doc('foreign-dependant', 'marketingTask', {
        conference: ref('conf-B'),
        campaign: { ...ref('other-camp'), _weak: true },
        plan: { ...ref('other-plan'), _weak: true },
        prerequisites: [ref('task-1')],
        key: 'another-edition',
      }),
    )
    const tree = await readDeletionTree('conf-A')
    expect(tree!.strongOwnerRefs).toBe(1)
    expect((await attemptDelete(tree!)).applied).toContain(
      'old-style strong link',
    )
    expect(h.commits).toBe(0)
    expect(byId('task-1')).toBeDefined()
  })
  it('refuses on a STRONG reference from a type no hand-written list named', async () => {
    // Round 6's door: a release version of a socialPostVariant still holding a
    // strong `post` reference. The preflight used to match only marketingTask
    // and marketingCampaign, so it counted zero and the delete destroyed six
    // Tasks before Sanity refused the post. `references()` finds it without
    // anyone having to think of `socialPostVariant` first.
    h.dataset.push(
      ...task(1),
      doc('versions.rel1.variant-1', 'socialPostVariant', {
        post: ref('post-1'),
        status: 'draft',
      }),
    )
    const tree = await readDeletionTree('conf-A')
    expect(tree!.strongOwnerRefs).toBe(1)
    const outcome = await attemptDelete(tree!)
    expect(h.commits).toBe(0)
    expect(byId('task-1')).toBeDefined()
    expect(byId('post-1')).toBeDefined()
    expect(outcome.applied).toContain('old-style strong link')
  })
  it('ignores that same reference once it is weak', async () => {
    h.dataset.push(
      ...task(1),
      doc('versions.rel1.variant-1', 'socialPostVariant', {
        post: { ...ref('post-1'), _weak: true },
        status: 'draft',
      }),
    )
    const tree = await readDeletionTree('conf-A')
    expect(tree!.strongOwnerRefs).toBe(0)
    expect(
      await deletePlanTree({
        conferenceId: 'conf-A',
        tree: tree!,
        deletePlan: true,
      }),
    ).toBe(true)
    expect(byId('task-1')).toBeUndefined()
  })
  it('refuses while a content release holds a version of a Task in the tree', async () => {
    // The third door. `publishedId()` maps `versions.<rel>.<taskId>` onto a
    // Task that IS in the tree, so it looked like a harmless twin — but
    // deletePlanTree only ever deletes `drafts.<id>`, never a release version.
    // The version survives holding a STRONG campaign reference, so the Task
    // chunks commit and the Campaign chunk is then refused. Worse than a draft:
    // Sanity's reference message is not a revision conflict, so it does not
    // even surface as "retry".
    h.dataset.push(
      ...task(1),
      doc('versions.rel1.task-1', 'marketingTask', {
        campaign: ref('camp'),
        plan: ref('plan'),
        key: 'in-a-release',
      }),
    )
    const tree = await readDeletionTree('conf-A')
    expect(tree!.strongOwnerRefs).toBe(1)
    const outcome = await attemptDelete(tree!)
    expect(h.commits).toBe(0)
    expect(byId('task-1')).toBeDefined()
    expect(byId('camp')).toBeDefined()
    expect(byId('plan')).toBeDefined()
    expect(outcome.applied).toContain('old-style strong link')
    expect(outcome.preview).toContain('old-style strong link')
  })
  it('catches a Studio draft whose plan and conference are not filled in yet', async () => {
    // The Studio saves a draft that fails `Rule.required()`, so a half-filled
    // Task can hold a strong `campaign` reference while carrying neither
    // `plan` nor `conference` — which is why the blocker read is keyed on ids
    // the scoped tree already admitted rather than on `conference._ref`.
    h.dataset.push(
      ...task(1),
      doc('drafts.half-filled', 'marketingTask', {
        campaign: ref('camp'),
        key: 'no-plan-no-conference',
      }),
    )
    const tree = await readDeletionTree('conf-A')
    expect(tree!.strongOwnerRefs).toBe(1)
    const outcome = await attemptDelete(tree!)
    expect(h.commits).toBe(0)
    expect(byId('task-1')).toBeDefined()
    expect(outcome.applied).toContain('old-style strong link')
  })
  it('ignores the draft twin of a document that IS in the tree', async () => {
    // Editing a published Task in the Studio creates `drafts.<taskId>`, which
    // deletePlanTree already removes. Refusing on those would block every
    // delete on any plan anyone had ever opened in the Studio.
    h.dataset.push(
      ...task(1),
      doc('drafts.task-1', 'marketingTask', {
        campaign: ref('camp'),
        plan: ref('plan'),
        key: 'edited',
      }),
    )
    const tree = await readDeletionTree('conf-A')
    expect(tree!.strongOwnerRefs).toBe(0)
    expect(() => deletionPreview(tree!)).not.toThrow()
    expect(
      await deletePlanTree({
        conferenceId: 'conf-A',
        tree: tree!,
        deletePlan: true,
      }),
    ).toBe(true)
    expect(byId('drafts.task-1')).toBeUndefined()
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
    expect(tree!.strongOwnerRefs).toBe(1)
    const outcome = await attemptDelete(tree!)
    // Destruction first: a guard-removal mutation must fail on STATE, not on
    // the absence of a thrown error.
    expect(h.commits).toBe(0)
    expect(byId('task-1')).toBeDefined()
    expect(byId('variant-1')).toBeDefined()
    expect(byId('camp')).toBeDefined()
    expect(byId('plan')).toBeDefined()
    expect(outcome.applied).toContain('052-weaken-snapshot-campaign-ref')
    expect(outcome.preview).toContain('052-weaken-snapshot-campaign-ref')
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
    expect(tree!.strongOwnerRefs).toBe(0)
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
    expect(weakened!.strongOwnerRefs).toBe(0)
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
