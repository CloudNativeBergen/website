import 'server-only'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { groq } from 'next-sanity'
import { scopedFetch } from '@/lib/sanity/scoped'
import { getCurrentDateTime } from '@/lib/time'
import { commitOrConflict } from '../sanity'
import { deletionPreview } from './preview'
import type { DeletionTask, DeletionTree } from './types'

/** One consistent preview read, repeated immediately before destruction. */
export async function readDeletionTree(
  conferenceId: string,
  campaignId?: string,
): Promise<DeletionTree | null> {
  const tree = await scopedFetch<Omit<DeletionTree, 'strongOwnerRefs'> | null>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "marketingPlan" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]{
      "plan": { _id, _rev },
      "campaigns": *[_type == "marketingCampaign" && conference._ref == $conferenceId && plan._ref == ^._id && (!defined($campaignId) || _id == $campaignId) && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{_id, _rev, key},
      "tasks": *[_type == "marketingTask" && conference._ref == $conferenceId && plan._ref == ^._id && (!defined($campaignId) || campaign._ref == $campaignId) && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{
        _id, _rev,
        "survivingDependantIds": *[_type == "marketingTask" && conference._ref == $conferenceId && ^._id in prerequisites[]._ref && (plan._ref != ^.plan._ref || (defined($campaignId) && campaign._ref != $campaignId)) && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]._id,
        "variant": select(variant->conference._ref == $conferenceId => variant->{
          _id, _rev, status, "postId": post._ref,
          "ownPost": post->conference._ref == $conferenceId,
          "siblingVariantIds": *[_type == "socialPostVariant" && conference._ref == $conferenceId && post._ref == ^.post._ref && _id != ^._id && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]._id,
          "survivingTaskIds": *[_type == "marketingTask" && conference._ref == $conferenceId && variant._ref == ^._id && (plan._ref != ^.^.plan._ref || (defined($campaignId) && campaign._ref != $campaignId)) && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]._id
        })
      },
      "snapshots": count(*[_type == "marketingSnapshot" && conference._ref == $conferenceId && !(_id in path("drafts.**")) && !(_id in path("versions.**")) && (!defined($campaignId) || campaign._ref == $campaignId || campaignKey in *[_type == "marketingCampaign" && conference._ref == $conferenceId && _id == $campaignId].key)])
    }`,
    { campaignId: campaignId ?? null },
    { cache: 'no-store' },
  )
  if (!tree) return null
  // groq-global-scoped: a by-id existence check on `drafts.<id>` for Task ids
  // the conference-scoped read above already admitted. Draft twins carry the
  // same tenancy as their published document by construction.
  const twinQuery = groq`*[_id in $ids]._id`
  const twins = new Set(
    (await clientReadUncached.fetch<string[] | null>(
      twinQuery,
      { ids: tree.tasks.map((task) => `drafts.${task._id}`) },
      { cache: 'no-store' },
    )) ?? [],
  )
  for (const task of tree.tasks)
    task.hasDraftTwin = twins.has(`drafts.${task._id}`)
  return {
    ...tree,
    strongOwnerRefs: await countBlockingRefs(tree, campaignId),
  }
}

/**
 * The variant and post ids the delete actually removes.
 *
 * The preflight must target these and no others: a post retained because a
 * surviving sibling still needs it is not deleted, so a strong reference to it
 * is not a blocker, and counting it refused legitimate deletes. Shared with
 * `deletePlanTree` so the two cannot disagree about what is going.
 */
function removedMedia(tasks: DeletionTask[]): {
  variants: Set<string>
  posts: Set<string>
} {
  const variants = new Set<string>()
  const posts = new Set<string>()
  for (const group of taskGroups(tasks)) {
    const byId = new Map(
      group.flatMap((task) =>
        task.variant ? [[task.variant._id, task.variant] as const] : [],
      ),
    )
    const deletable = new Set(
      [...byId.values()]
        .filter(
          (variant) =>
            variant.status !== 'published' &&
            variant.survivingTaskIds.length === 0,
        )
        .map((variant) => variant._id),
    )
    for (const variant of byId.values()) {
      if (!deletable.has(variant._id)) continue
      variants.add(variant._id)
      if (
        variant.postId &&
        variant.ownPost === true &&
        variant.siblingVariantIds.every((id) => deletable.has(id))
      )
        posts.add(variant.postId)
    }
  }
  return { variants, posts }
}

function holdsStrongRefTo(
  value: unknown,
  deleted: Set<string>,
  skipPrerequisites: boolean,
): boolean {
  if (Array.isArray(value))
    return value.some((entry) =>
      holdsStrongRefTo(entry, deleted, skipPrerequisites),
    )
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (
    typeof record._ref === 'string' &&
    deleted.has(record._ref) &&
    record._weak !== true
  )
    return true
  return Object.entries(record).some(
    ([key, entry]) =>
      key !== '_ref' &&
      // `prerequisites` is skipped ONLY on documents the delete actually
      // unlinks. Skipping the key everywhere reopened rounds 3 and 4 through
      // the one field the walk refused to look at: `survivingDependantIds` is
      // conference-scoped and excludes drafts and versions, so a foreign,
      // draft or release-version holder was never unset AND never counted.
      !(key === 'prerequisites' && skipPrerequisites) &&
      holdsStrongRefTo(entry, deleted, skipPrerequisites),
  )
}

/**
 * References that would still REFUSE the delete — found generically.
 *
 * Sanity will not delete a document a STRONG reference points at, and deletion
 * commits its Task chunks first, so any strong referrer left standing destroys
 * the Tasks and then wedges the plan for good. SIX review rounds each found a
 * different referrer that a hand-written list had missed: a Snapshot, an
 * unpublished Studio draft, a content-release version, a document of another
 * edition, a post variant, and a variant again through a field the list did not
 * name. Enumerating referrers is the game that keeps losing.
 *
 * So this does not enumerate. `references()` asks Sanity which documents point
 * at the ids being deleted — any type, any field, any depth — and the returned
 * documents are walked for a reference to one of those ids that is not weak.
 * A new schema field, or a type nobody thought of, is covered for free.
 *
 * Deliberately unfiltered by `conference._ref` and by `drafts`/`versions`
 * paths: a half-filled Studio draft carries no conference, a release version is
 * a real blocker, and a foreign-edition document pointing in here is a case
 * round 4 found. Scoped instead by ids the conference-scoped tree already
 * admitted.
 *
 * `marketingSnapshot` is counted rather than walked, because a conference
 * accrues thousands of them; that count names both of its reference fields
 * explicitly and is unscoped by conference. Every other referrer type is small
 * in number, and after migration 052 there are none at all.
 */
async function countBlockingRefs(
  tree: Omit<DeletionTree, 'strongOwnerRefs'>,
  campaignId?: string,
): Promise<number> {
  const campaignIds = tree.campaigns.map((campaign) => campaign._id)
  const removed = removedMedia(tree.tasks)
  // Only a whole-plan delete removes the plan, so only then can a reference TO
  // the plan block anything.
  const planId = campaignId ? null : tree.plan._id
  const ours = [
    ...campaignIds,
    ...tree.tasks.map((task) => task._id),
    // The posts and variants the delete removes are targets too: round 6's
    // door was a release-version variant holding a strong `post` reference,
    // which nothing saw because posts were not in this list. Only the ones
    // actually removed — a post kept for a surviving sibling blocks nothing.
    ...removed.variants,
    ...removed.posts,
    ...(planId ? [planId] : []),
  ]
  if (ours.length === 0) return 0
  // `drafts.<id>` twins go with their published document, so they never block.
  // A `versions.<release>.<id>` does NOT — nothing deletes a content release.
  const deleted = [...ours, ...ours.map((id) => `drafts.${id}`)]
  // groq-global-scoped: keyed to ids the conference-scoped tree read above
  // already admitted. A blocking referrer may carry no `conference` of its own,
  // which is why this cannot filter on one.
  const query = groq`*[references($ours) && !(_id in $deleted) && _type != "marketingSnapshot"]`
  // Snapshots are counted rather than walked: a conference accrues thousands,
  // and `references()` would return every one of them. The count is explicit
  // about BOTH of its reference fields and is unscoped by conference —
  // previously it checked only `campaign`, and only within this conference, so
  // a strong `perTask[].task` and a foreign-edition snapshot were each a live
  // half-destroy on un-migrated data.
  // groq-global-scoped: matched on ids the conference-scoped tree read above
  // already admitted; a blocking Snapshot may belong to another edition, which
  // is exactly the case this has to see.
  const snapshotQuery = groq`count(*[_type == "marketingSnapshot" && ((defined(campaign._ref) && campaign._ref in $ours && campaign._weak != true) || count(perTask[defined(task._ref) && task._ref in $ours && task._weak != true]) > 0)])`
  const [referrers, blockingSnapshots] = await Promise.all([
    clientReadUncached.fetch<Record<string, unknown>[] | null>(
      query,
      { ours, deleted },
      { cache: 'no-store' },
    ),
    clientReadUncached.fetch<number | null>(
      snapshotQuery,
      { ours },
      { cache: 'no-store' },
    ),
  ])
  const target = new Set(ours)
  // The documents whose prerequisite links the delete unsets for itself.
  const unlinked = new Set(
    tree.tasks.flatMap((task) => task.survivingDependantIds),
  )
  return (
    (blockingSnapshots ?? 0) +
    (referrers ?? []).filter((referrer) =>
      holdsStrongRefTo(
        referrer,
        target,
        unlinked.has(referrer._id as string) ||
          deleted.includes(referrer._id as string),
      ),
    ).length
  )
}

// An operation bundle is indivisible: a revision guard never commits before
// its deletion. Shared variants/posts connect Tasks into the same bundle.
type Transaction = ReturnType<typeof clientWrite.transaction>
type Operation = (transaction: Transaction) => void
const BATCH_SIZE = 50

function taskGroups(tasks: DeletionTask[]): DeletionTask[][] {
  const groups: DeletionTask[][] = []
  for (const task of tasks) {
    const matches = groups.filter(
      (group) =>
        task.variant &&
        group.some(
          (member) =>
            member.variant &&
            (member.variant._id === task.variant!._id ||
              (task.variant!.postId &&
                member.variant.postId === task.variant!.postId)),
        ),
    )
    if (matches.length === 0) groups.push([task])
    else {
      const merged = [task, ...matches.flat()]
      for (const match of matches) groups.splice(groups.indexOf(match), 1)
      groups.push(merged)
    }
  }
  return groups
}

/**
 * A failed chunk leaves the plan owning the remainder. Re-read and retry;
 * campaigns are removed only after Tasks, and the plan is always last.
 */
export async function deletePlanTree(input: {
  conferenceId: string
  tree: DeletionTree
  deletePlan: boolean
}): Promise<boolean> {
  const { tree } = input
  deletionPreview(tree)
  const now = getCurrentDateTime()
  const chunks: Operation[][] = []
  // EVERY intra-set prerequisite link goes first, in its own chunks, before a
  // single document is deleted.
  //
  // `prerequisites` between two Tasks that are BOTH being deleted is the one
  // strong reference the preflight cannot see: it excludes referrers that are
  // themselves in the delete set, which would be right if this were one
  // transaction. It is not — the work is chunked, so a Task deleted in chunk 1
  // is still strongly referenced by a Task waiting in chunk 3, and Sanity
  // refuses that chunk. The Template emits exactly this shape for every
  // studioRender→publishing pair, and a retry can never help: re-reading
  // shifts the chunk window and the blocked pair stays split.
  //
  // `survivingDependantIds` does not cover it — that is only for dependants in
  // ANOTHER plan or Campaign. And these cannot simply be widened into the task
  // bundles: a dependant whose chunk already committed is gone, and patching a
  // missing document fails the whole transaction. Hence a separate, earlier
  // pass, with no revision guard because these documents are about to go.
  // This pass also carries each Task's compare-and-set: it is the first thing
  // that touches the document, so guarding here proves the Task has not changed
  // since the tree was read. The later bundles therefore delete without a Task
  // revision guard — they could not keep one anyway, because this patch bumps
  // the revision. The VARIANT and post guards are untouched, and those are the
  // ones that matter against a publish cron claiming a variant mid-delete.
  //
  // The DRAFT TWIN needs clearing too. The preflight excludes `drafts.<id>`
  // from the referrer walk on the grounds that a twin goes with its published
  // document — true, but in its own chunk, so an unpublished Studio edit that
  // added a prerequisite on another Task in this plan was invisible to the
  // preflight AND never cleared. It cannot be blind-patched: a patch on a
  // missing document fails the whole transaction, which is why the tree read
  // reports whether each twin exists.
  //
  // RESIDUAL RISK, accepted: a twin created BETWEEN the read and this pass is
  // neither cleared nor seen. It is a narrow window and the Task's own
  // compare-and-set below closes most of it — creating a draft from the Studio
  // does not always bump the published `_rev`, so the guard is not a proof.
  // The consequence is the ordinary one: the delete fails and the organizer is
  // told to retry, and a retry re-reads and DOES see the twin. That is the
  // difference from the intra-set case above, where retrying could never work.
  const clearing: Operation[] = tree.tasks.flatMap((task) => [
    (tx: Transaction) => {
      tx.patch(task._id, (p) =>
        p.ifRevisionId(task._rev).unset(['prerequisites']),
      )
    },
    ...(task.hasDraftTwin
      ? [
          (tx: Transaction) => {
            tx.patch(`drafts.${task._id}`, (p) => p.unset(['prerequisites']))
          },
        ]
      : []),
  ])
  for (let i = 0; i < clearing.length; i += BATCH_SIZE)
    chunks.push(clearing.slice(i, i + BATCH_SIZE))
  let current: Operation[] = []
  // Keep the divergence marker in the first bundle that touches anything, even
  // when an indivisible bundle alone reaches the ordinary chunk ceiling. The
  // clearing pass above is now that first bundle, so the plan is marked as soon
  // as the operation starts mutating rather than one chunk later.
  let markDivergence = !input.deletePlan
  if (markDivergence && chunks.length > 0) {
    chunks[0].unshift((tx) => {
      tx.patch(tree.plan._id, (p) =>
        p.ifRevisionId(tree.plan._rev).set({ structurallyEdited: true }),
      )
    })
    markDivergence = false
  }
  const append = (operations: Operation[]) => {
    const bundle = [...operations]
    if (markDivergence) {
      bundle.unshift((tx) => {
        tx.patch(tree.plan._id, (p) =>
          p.ifRevisionId(tree.plan._rev).set({ structurallyEdited: true }),
        )
      })
      markDivergence = false
    }
    if (current.length && current.length + bundle.length > BATCH_SIZE) {
      chunks.push(current)
      current = []
    }
    current.push(...bundle)
  }
  for (const group of taskGroups(tree.tasks)) {
    const bundle: Operation[] = []
    const variants = new Map(
      group.flatMap((task) =>
        task.variant ? [[task.variant._id, task.variant] as const] : [],
      ),
    )
    const deletableVariants = new Set(
      [...variants.values()]
        .filter(
          (variant) =>
            variant.status !== 'published' &&
            variant.survivingTaskIds.length === 0,
        )
        .map((variant) => variant._id),
    )
    const deletedPosts = new Set<string>()
    for (const task of group) {
      for (const id of task.survivingDependantIds)
        bundle.push((tx) => {
          tx.patch(id, (p) => p.unset([`prerequisites[_ref == "${task._id}"]`]))
        })
      bundle.push((tx) => {
        tx.delete(task._id)
      })
      bundle.push((tx) => {
        tx.delete(`drafts.${task._id}`)
      })
    }
    for (const variant of variants.values()) {
      if (!deletableVariants.has(variant._id)) continue
      bundle.push((tx) => {
        tx.patch(variant._id, (p) =>
          p.ifRevisionId(variant._rev).set({ updatedAt: now }),
        )
      })
      bundle.push((tx) => {
        tx.delete(variant._id)
      })
      bundle.push((tx) => {
        tx.delete(`drafts.${variant._id}`)
      })
      if (
        variant.postId &&
        variant.ownPost === true &&
        !deletedPosts.has(variant.postId) &&
        variant.siblingVariantIds.every((id) => deletableVariants.has(id))
      ) {
        const postId = variant.postId
        deletedPosts.add(postId)
        bundle.push((tx) => {
          tx.delete(postId)
        })
        bundle.push((tx) => {
          tx.delete(`drafts.${postId}`)
        })
      }
    }
    append(bundle)
  }
  for (const campaign of tree.campaigns)
    append([
      (tx) => {
        tx.patch(campaign._id, (p) =>
          p.ifRevisionId(campaign._rev).set({ updatedAt: now }),
        )
      },
      (tx) => {
        tx.delete(campaign._id)
      },
      (tx) => {
        tx.delete(`drafts.${campaign._id}`)
      },
    ])
  if (input.deletePlan)
    append([
      (tx) => {
        tx.patch(tree.plan._id, (p) =>
          p.ifRevisionId(tree.plan._rev).set({ updatedAt: now }),
        )
      },
      (tx) => {
        tx.delete(tree.plan._id)
      },
      (tx) => {
        tx.delete(`drafts.${tree.plan._id}`)
      },
    ])
  if (current.length) chunks.push(current)
  for (const operations of chunks) {
    const tx = clientWrite.transaction()
    for (const operation of operations) operation(tx)
    if (!(await commitOrConflict(tx))) return false
  }
  return true
}
