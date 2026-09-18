import type { DeletionPreview, DeletionTree } from './types'

export class DeletionRefusalError extends Error {}

export function deletionPreview(tree: DeletionTree): DeletionPreview {
  // REFUSE BEFORE ANYTHING IS DESTROYED.
  //
  // Sanity will not delete a document a STRONG reference points at, and
  // deletion commits its Task chunks first — so a strong referrer left
  // standing destroys every Task and then makes the Campaign or plan chunk
  // permanently impossible. The organizer is told to retry; retrying can never
  // work. SEVEN review rounds each found a different holder of such a
  // reference. The schema now declares all of them weak and migration 052
  // rewrites the stored ones; this is the count of what the migration has not
  // reached yet, found without naming a single type — see `countBlockingRefs`.
  if (tree.strongOwnerRefs > 0) {
    throw new DeletionRefusalError(
      `${tree.strongOwnerRefs} document${tree.strongOwnerRefs === 1 ? '' : 's'} still reference${tree.strongOwnerRefs === 1 ? 's' : ''} this plan with an old-style strong link, and deleting now would destroy the Tasks and then fail halfway. An administrator needs to run the 052-weaken-snapshot-campaign-ref migration first; nothing has been changed.`,
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
