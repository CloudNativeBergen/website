import type { DeletionPreview, DeletionTree } from './types'

export class DeletionRefusalError extends Error {}

export function deletionPreview(tree: DeletionTree): DeletionPreview {
  // REFUSE BEFORE ANYTHING IS DESTROYED. Sanity will not delete a document a
  // STRONG reference points at, and every Snapshot written before migration
  // 052 still holds one. Deletion commits its Task chunks first, so without
  // this guard the delete destroys every Task, every variant and every post,
  // and only THEN hits the Campaign chunk — which Sanity refuses with a 409
  // that `commitOrConflict` reports as an ordinary revision conflict. The
  // organizer is told to retry; retrying can never work, because the Tasks are
  // already gone and the Campaigns can never be removed. One click, no typed
  // confirmation when nothing was published, and unrecoverable.
  //
  // Counted including drafts: a draft Snapshot's strong reference blocks the
  // delete exactly as a published one does.
  if (tree.strongSnapshots > 0) {
    throw new DeletionRefusalError(
      `${tree.strongSnapshots} stored measurement${tree.strongSnapshots === 1 ? '' : 's'} still reference these Campaigns directly, and deleting now would destroy the Tasks and then fail halfway. An administrator needs to run the 052-weaken-snapshot-campaign-ref migration first; nothing has been changed.`,
    )
  }
  // The same hazard, and the reason this is a COUNT rather than a list of
  // suspects: `marketingTask.campaign`, `marketingTask.plan` and
  // `marketingCampaign.plan` were strong too, and three rounds of review each
  // found a different referrer the enumeration had missed. The schema now
  // declares them weak; until migration 052 rewrites the stored references,
  // any that remain would refuse the delete halfway.
  if (tree.strongOwnerRefs > 0) {
    throw new DeletionRefusalError(
      `${tree.strongOwnerRefs} Task${tree.strongOwnerRefs === 1 ? '' : 's'} or Campaign${tree.strongOwnerRefs === 1 ? '' : 's'} still reference this plan with an old-style strong link and would block the delete halfway. An administrator needs to run the 052-weaken-snapshot-campaign-ref migration first; nothing has been changed.`,
    )
  }
  if (tree.tasks.some((task) => task.variant?.status === 'publishing')) {
    throw new DeletionRefusalError(
      'The post is being published right now. Try again in a minute.',
    )
  }
  const publishedTasks = tree.tasks.filter(
    (task) => task.variant?.status === 'published',
  ).length
  return {
    campaigns: tree.campaigns.length,
    tasks: tree.tasks.length,
    publishedTasks,
    requiresTypedConfirmation: publishedTasks > 0,
    snapshots: tree.snapshots,
  }
}
