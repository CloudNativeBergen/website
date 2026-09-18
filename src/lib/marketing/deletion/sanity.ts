import 'server-only'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { groq } from 'next-sanity'
import { scopedFetch } from '@/lib/sanity/scoped'
import { getCurrentDateTime } from '@/lib/time'
import { commitOrConflict } from '../sanity'
import { deletionPreview } from './preview'
import { postDeletionBlockers } from '@/lib/social/post-deletion'
import type { DeletionTask, DeletionTree } from './types'

/** One consistent preview read, repeated immediately before destruction. */
export async function readDeletionTree(
  conferenceId: string,
  campaignId?: string,
): Promise<DeletionTree | null> {
  const tree = await scopedFetch<Omit<
    DeletionTree,
    'strongOwnerRefs' | 'unpreservedSnapshots'
  > | null>(
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
  // Two by-id reads in one round trip, both over ids the conference-scoped
  // read above already admitted:
  //
  //   `twins` — whether `drafts.<id>` exists for each Task, so its
  //   prerequisites can be cleared too. Draft twins carry the same tenancy as
  //   their published document by construction.
  //
  //   `unpreserved` — Snapshots pointing at a Campaign in the delete set that
  //   still have no `campaignKey` of their own. Scoped to the tree's Campaign
  //   ids rather than to the conference on purpose: a keyless Snapshot whose
  //   Campaign is ALREADY gone is unattributable whatever we do, the backfill
  //   cannot repair it either, and refusing the delete over it would only
  //   block a plan nothing can fix.
  //
  // groq-global-scoped: by-id existence check over Task ids the scoped read above returned.
  const twinsQuery = groq`*[_id in $draftIds]._id`
  // DRAFT-ONLY OWNED RECORDS. A Campaign or Task created in the Studio and
  // never published exists as `drafts.<uuid>` with NO live twin, so the tree
  // read — which excludes every draft path — cannot see it, and the twin lookup
  // above only asks about drafts of Tasks it already found. Its owner reference
  // is weak now, so deleting the plan or Campaign succeeds and leaves it behind,
  // publishable later with an owner that no longer exists. Counted rather than
  // deleted: a delete cannot silently discard unpublished work the organizer
  // has not looked at, and a scheduled release is a future write it cannot
  // cancel, so the preflight refuses and names them.
  //
  // `defined($planId)` is not decoration. A campaign-scoped delete passes null,
  // and GROQ's `null == null` is true, so without it every draft with no `plan`
  // at all — including ones belonging to no plan in this dataset — matched and
  // refused every Campaign delete.
  //
  // CONTENT RELEASE VERSIONS count as well as drafts. `versions.**` is excluded
  // from the tree read for the same reason `drafts.**` is, and nothing here
  // deletes a release — so applying that release later would recreate a Task or
  // Campaign whose plan or Campaign is gone. A release is a scheduled, deliberate
  // future write, which makes it worse than a draft, not better.
  //
  // Scoped in GROQ, not materialized and filtered here. Fetching every draft
  // and release version of every marketing document in the dataset and sorting
  // them out in TypeScript made a deletion PREVIEW grow with other tenants'
  // Studio drafts — unrelated to the tree being deleted, and eventually large
  // enough to time out.
  //
  // The owner TWINS still have to be recognised by document identity —
  // `versions.<release>.<campaignId>` during a Campaign delete carries only a
  // reference to the surviving plan, and `versions.<release>.<planId>` is
  // neither a Campaign nor a Task — so each target contributes a
  // `versions.*.<id>` pattern. `path()` takes a parameter, so no id is
  // interpolated into the query text.
  const ownedPlanId = campaignId ? null : tree.plan._id
  const campaignIds = tree.campaigns.map((campaign) => campaign._id)
  const targetIds = [...campaignIds, ...(ownedPlanId ? [ownedPlanId] : [])]
  const twinParams = Object.fromEntries(
    targetIds.map((id, index) => [`twin${index}`, `versions.*.${id}`]),
  )
  const twinClause = targetIds
    .map((_, index) => ` || _id in path($twin${index})`)
    .join('')
  const draftIds = tree.tasks.map((task) => `drafts.${task._id}`)
  // Draft twins of documents the delete DOES remove — it deletes `drafts.<id>`
  // for every Task, Campaign and (when the plan goes) the plan. Version twins
  // are deliberately not here: nothing deletes a content release, which is the
  // whole reason they are counted.
  const knownDrafts = [
    ...draftIds,
    ...campaignIds.map((id) => `drafts.${id}`),
    ...(ownedPlanId ? [`drafts.${ownedPlanId}`] : []),
  ]
  // groq-global-scoped: matched on plan and Campaign ids the conference-scoped read above returned.
  const draftOnlyQuery = groq`count(*[(_id in path("drafts.**") || _id in path("versions.**")) && (_type == "marketingCampaign" || _type == "marketingTask" || _type == "marketingPlan") && !(_id in $knownDrafts) && ((defined($planId) && plan._ref == $planId) || campaign._ref in $campaignIds${twinClause})])`
  // groq-global-scoped: counted by the Campaign ids the scoped read above returned.
  const unpreservedQuery = groq`count(*[_type == "marketingSnapshot" && !defined(campaignKey) && campaign._ref in $campaignIds])`
  const extra = await clientReadUncached.fetch<{
    twins: string[] | null
    unpreserved: number | null
    draftOnly: number | null
  }>(
    `{"twins": ${twinsQuery}, "unpreserved": ${unpreservedQuery}, "draftOnly": ${draftOnlyQuery}}`,
    {
      draftIds,
      campaignIds,
      knownDrafts,
      // `defined($planId)` is not decoration. A campaign-scoped delete passes
      // null, and GROQ's `null == null` is true, so without it every draft with
      // no `plan` at all matched and refused every Campaign delete.
      planId: ownedPlanId,
      ...twinParams,
    },
    { cache: 'no-store' },
  )
  const twins = new Set(extra?.twins ?? [])
  for (const task of tree.tasks)
    task.hasDraftTwin = twins.has(`drafts.${task._id}`)
  return {
    ...tree,
    strongOwnerRefs: await countBlockingRefs(tree, campaignId),
    unpreservedSnapshots: extra?.unpreserved ?? 0,
    draftOnlyRecords: extra?.draftOnly ?? 0,
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
      // `prerequisites` is skipped here because `countBlockingRefs` asks about
      // it directly, over every holder regardless of path, conference or
      // reference strength. Rounds 3 and 4 were reopened by skipping the key
      // with nothing else covering it; the dedicated query is that cover.
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
  tree: Omit<DeletionTree, 'strongOwnerRefs' | 'unpreservedSnapshots'>,
  campaignId?: string,
): Promise<number> {
  const campaignIds = tree.campaigns.map((campaign) => campaign._id)
  const removed = removedMedia(tree.tasks)
  // Only a whole-plan delete removes the plan, so only then can a reference TO
  // the plan block anything.
  const planId = campaignId ? null : tree.plan._id
  // Targets for the STRONG-reference walk. Posts are deliberately not here:
  // they are checked separately below, at any reference strength.
  const ours = [
    ...campaignIds,
    ...tree.tasks.map((task) => task._id),
    ...removed.variants,
    ...(planId ? [planId] : []),
  ]
  const postIds = [...removed.posts]
  if (ours.length === 0 && postIds.length === 0) return 0
  // `drafts.<id>` twins go with their published document, so they never block.
  // A `versions.<release>.<id>` does NOT — nothing deletes a content release.
  const removedIds = [...ours, ...postIds]
  const deleted = [...removedIds, ...removedIds.map((id) => `drafts.${id}`)]
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
  // A POST IS DIFFERENT: any surviving referrer blocks it, weak or strong.
  //
  // Everywhere else weak is the design — a Campaign or plan delete cannot chunk
  // its way through strong references, which is what migration 052 is for. A
  // post is the parent a variant cannot do without, and `siblingVariantIds` in
  // the tree read lists only LIVE, same-conference variants, so a draft-only
  // sibling, a Content Release version or a variant on another edition was
  // invisible to `removedMedia` — it decided the live variant was the last one
  // and deleted the shared post out from under the sibling. `holdsStrongRefTo`
  // could not catch it either, because 052 had just made that reference weak.
  // Asked by id and by `references()`, so it does not depend on naming types.
  // PREREQUISITES HELD BY DOCUMENTS THE DELETE DOES NOT UNLINK.
  //
  // `survivingDependantIds` is conference-scoped and excludes drafts and
  // versions, so a draft twin of a surviving Task, a Content Release version, or
  // a Task on another edition was never unset — and since #1084 made the
  // reference weak, the generic strong-reference walk stopped counting it too.
  // Publishing or applying that holder later restores a prerequisite pointing at
  // a Task that no longer exists, and plan health reports it as waiting for ever.
  // Refused rather than rewritten: patching another edition's Task, or a
  // scheduled release, is not this operation's business.
  // groq-global-scoped: matched on Task ids the conference-scoped tree read above returned.
  const prerequisiteQuery = groq`*[_type == "marketingTask" && count(prerequisites[_ref in $taskIds]) > 0]._id`
  const taskIds = tree.tasks.map((task) => task._id)
  const [referrers, blockingSnapshots, postReferrers, prerequisiteHolders] =
    await Promise.all([
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
      // Shared with `deleteTask` and `deleteSocialPost`, the other two paths that
      // remove a post: it also catches a version twin of the post itself, which
      // no referrer query can see because a release IS the post rather than a
      // document pointing at it.
      postDeletionBlockers(postIds, deleted),
      taskIds.length
        ? clientReadUncached.fetch<string[] | null>(
            prerequisiteQuery,
            { taskIds },
            { cache: 'no-store' },
          )
        : Promise.resolve([]),
    ])
  const target = new Set(ours)
  // The documents whose prerequisite links the delete unsets for itself.
  const unlinked = new Set(
    tree.tasks.flatMap((task) => task.survivingDependantIds),
  )
  // Everything the delete already handles: the documents it removes, their draft
  // twins (cleared by the clearing pass), and the surviving dependants it unsets.
  const handled = new Set([...deleted, ...unlinked])
  const danglingPrerequisites = (prerequisiteHolders ?? []).filter(
    (id) => !handled.has(id),
  ).length
  return (
    (blockingSnapshots ?? 0) +
    (postReferrers ?? 0) +
    danglingPrerequisites +
    (referrers ?? []).filter((referrer) =>
      // `prerequisites` is now skipped on EVERY document, because the dedicated
      // query above covers it completely — including the weak links and the
      // non-live holders this walk could never see. Leaving it here as well
      // counted the same link twice.
      holdsStrongRefTo(referrer, target, true),
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
  // THE PLAN'S REVISION IS THE SERIALIZATION POINT, AND IT GOES FIRST.
  //
  // Two things depend on this patch. It records the divergence from the
  // Template when a single Campaign is deleted — and, for EITHER kind of
  // delete, it is the compare-and-set that makes this operation exclusive with
  // Task creation. `createMarketingTask` patches the owning plan in the same
  // transaction that creates the Task, so a Task created between the tree read
  // and this commit bumps the revision and fails the delete. Without it, that
  // Task and its post and variant kept weak references to a Campaign this
  // delete then removed: the delete reported success and left orphans behind.
  // Guarding the CAMPAIGN in every Task creation instead would put a revision
  // bump on a document the Campaign editor holds open, so the shared parent is
  // the cheaper lock.
  //
  // It must be in the FIRST bundle, even when an indivisible bundle alone
  // reaches the ordinary chunk ceiling. A full plan delete used to guard the
  // plan only in its LAST bundle, so a concurrent Task creation failed that
  // chunk after every Task and Campaign had already been destroyed — the
  // half-destroyed plan this whole path exists to prevent.
  //
  // WHAT THIS DOES NOT COVER, deliberately. The guard is consumed by the first
  // chunk: it bumps the plan's revision, so a Task creation that VALIDATES
  // after that chunk reads the new revision and commits happily while later
  // chunks remove its Campaign. The result is an orphaned Task, post and
  // variant — visible in the plan and deletable.
  //
  // Closing it would mean re-reading the plan between chunks and chaining each
  // chunk's guard onto the previous commit's revision. That buys a rare,
  // recoverable orphan at the price of a new failure point BETWEEN chunks, and
  // a failure there is the half-destroyed plan — the unrecoverable outcome this
  // path exists to prevent. More ways to fail mid-cascade is the wrong trade,
  // so the window stays open and named. `deletes a Task created between chunks`
  // pins it, so nobody mistakes this guard for whole-operation exclusion.
  const guardPlan = (tx: Transaction) => {
    tx.patch(tree.plan._id, (p) =>
      p
        .ifRevisionId(tree.plan._rev)
        // A plan about to be deleted has no use for the marker; the patch is
        // there for the compare-and-set.
        .set(
          input.deletePlan ? { updatedAt: now } : { structurallyEdited: true },
        ),
    )
  }
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
  // Prepended BEFORE slicing, not unshifted onto `chunks[0]` afterwards: a
  // clearing pass that is an exact multiple of BATCH_SIZE produced a full first
  // chunk, and adding the guard to it made a 51-mutation transaction — over the
  // ceiling this batching exists to respect. An expanded plan reaches that
  // boundary routinely.
  const guarded = clearing.length ? [guardPlan, ...clearing] : []
  for (let i = 0; i < guarded.length; i += BATCH_SIZE)
    chunks.push(guarded.slice(i, i + BATCH_SIZE))
  const guardedAtHead = guarded.length > 0
  let current: Operation[] = []
  // THE PLAN'S REVISION IS THE SERIALIZATION POINT, AND IT GOES FIRST.
  //
  // Two things depend on this patch. It records the divergence from the
  // Template when a single Campaign is deleted — and, for EITHER kind of
  // delete, it is the compare-and-set that makes this operation exclusive with
  // Task creation. `createMarketingTask` patches the owning plan in the same
  // transaction that creates the Task, so a Task created between the tree read
  // and this commit bumps the revision and fails the delete. Without it, that
  // Task and its post and variant kept weak references to a Campaign this
  // delete then removed: the delete reported success and left orphans behind.
  // Guarding the CAMPAIGN in every Task creation instead would put a revision
  // bump on a document the Campaign editor holds open, so the shared parent is
  // the cheaper lock.
  //
  // It must be in the FIRST bundle, even when an indivisible bundle alone
  // reaches the ordinary chunk ceiling. A full plan delete used to guard the
  // plan only in its LAST bundle, so a concurrent Task creation failed that
  // chunk after every Task and Campaign had already been destroyed — the
  // half-destroyed plan this whole path exists to prevent.
  let markDivergence = guardedAtHead ? false : true
  const append = (operations: Operation[]) => {
    const bundle = [...operations]
    if (markDivergence) {
      bundle.unshift(guardPlan)
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
      // No revision guard here: the guarded patch above already bumped it, so
      // a second `ifRevisionId` on the same stale revision would fail every
      // delete — the mistake the clearing pass made when it was introduced.
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
