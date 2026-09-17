import 'server-only'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { groq } from 'next-sanity'
import { scopedFetch } from '@/lib/sanity/scoped'
import { getCurrentDateTime } from '@/lib/time'
import { commitOrConflict } from '../sanity'
import { deletionPreview, publishedId } from './preview'
import type { DeletionTask, DeletionTree } from './types'

/** One consistent preview read, repeated immediately before destruction. */
export async function readDeletionTree(
  conferenceId: string,
  campaignId?: string,
): Promise<DeletionTree | null> {
  const tree = await scopedFetch<Omit<DeletionTree, 'blockingDocIds'> | null>(
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
      "snapshots": count(*[_type == "marketingSnapshot" && conference._ref == $conferenceId && !(_id in path("drafts.**")) && !(_id in path("versions.**")) && (!defined($campaignId) || campaign._ref == $campaignId || campaignKey in *[_type == "marketingCampaign" && conference._ref == $conferenceId && _id == $campaignId].key)]),
      "strongSnapshots": count(*[_type == "marketingSnapshot" && conference._ref == $conferenceId && campaign._weak != true && (!defined($campaignId) || campaign._ref == $campaignId || campaignKey in *[_type == "marketingCampaign" && conference._ref == $conferenceId && _id == $campaignId].key)])
    }`,
    { campaignId: campaignId ?? null },
    { cache: 'no-store' },
  )
  if (!tree) return null
  return {
    ...tree,
    blockingDocIds: await readDeletionBlockers(tree, campaignId),
  }
}

/**
 * Documents we do NOT delete that hold a STRONG reference into what we do.
 *
 * `marketingCampaign.plan`, `marketingTask.campaign` and `marketingTask.plan`
 * are strong, and Sanity refuses to delete a document a strong reference points
 * at. Because the Task chunks commit first, any such referrer we miss means the
 * Tasks are destroyed and the Campaign or plan chunk is then refused — forever.
 *
 * Two classes block:
 *
 *  - **Every `versions.**` document.** `deletePlanTree` only ever deletes
 *    `drafts.<id>`, never a Content Release version, so a version twin of a
 *    Task we are deleting survives holding its strong reference. This is the
 *    case an earlier guard classified as a harmless twin precisely because its
 *    published id IS in the tree.
 *  - **A `drafts.**` document with no published twin in the tree** — a Studio
 *    document created and never published.
 *
 * Scoped by ids the conference-scoped tree read already proved are ours, NOT by
 * `conference._ref`: a half-filled Studio draft may not have its `conference`
 * or `plan` set yet while its `campaign` reference is already strong enough to
 * block.
 */
async function readDeletionBlockers(
  tree: Omit<DeletionTree, 'blockingDocIds'>,
  campaignId?: string,
): Promise<string[]> {
  const campaignIds = tree.campaigns.map((campaign) => campaign._id)
  // Only a whole-plan delete removes the plan document, so only then can a
  // reference TO the plan block anything.
  const planId = campaignId ? null : tree.plan._id
  if (campaignIds.length === 0 && !planId) return []
  // groq-global-scoped: keyed to plan and Campaign ids the conference-scoped
  // tree read above already admitted; a Studio draft may not carry `conference`
  // yet, so filtering on it here would miss exactly the blockers we need.
  const query = groq`*[(_id in path("drafts.**") || _id in path("versions.**")) && ((_type == "marketingCampaign" && plan._ref == $planId) || (_type == "marketingTask" && (plan._ref == $planId || campaign._ref in $campaignIds)))]._id`
  const candidates = await clientReadUncached.fetch<string[] | null>(
    query,
    { planId, campaignIds },
    { cache: 'no-store' },
  )
  const deleted = new Set([
    tree.plan._id,
    ...campaignIds,
    ...tree.tasks.map((task) => task._id),
  ])
  return (candidates ?? []).filter(
    (id) => id.startsWith('versions.') || !deleted.has(publishedId(id)),
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
  let current: Operation[] = []
  // Keep the divergence marker in the first destructive bundle, even when
  // that indivisible bundle alone reaches the ordinary chunk ceiling.
  let markDivergence = !input.deletePlan
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
        tx.patch(task._id, (p) =>
          p.ifRevisionId(task._rev).set({ updatedAt: now }),
        )
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
