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
  // REFERENCE STRENGTH IS NOT THE SAME QUESTION AS PRESERVED HISTORY.
  //
  // Migration 052 runs two deliberately independent passes: it weakens owner
  // references first (that pass cannot throw, so one unattributable Snapshot
  // can no longer leave every plan permanently undeletable), then backfills
  // each Snapshot's Campaign key and title. A run that completes the first and
  // fails the second leaves the check above satisfied — the references ARE
  // weak — while the Snapshots still carry no attribution of their own. Sanity
  // would then happily delete the Campaign, and those readings would lose the
  // only thing that identified what they measured. That is precisely the loss
  // #1084 exists to prevent, and it is not recoverable by re-running the
  // migration afterwards: the Campaign it needed to read is gone.
  //
  // The snapshot cron has always written `campaignKey`, so this only ever
  // fires on documents predating the migration; a healthy dataset reads zero.
  if (tree.unpreservedSnapshots > 0) {
    throw new DeletionRefusalError(
      `${tree.unpreservedSnapshots} stored measurement${tree.unpreservedSnapshots === 1 ? ' has' : 's have'} not had their Campaign details copied onto them yet, and deleting now would leave that history unattributable. An administrator needs to finish the 052-weaken-snapshot-campaign-ref migration — its backfill pass — first; nothing has been changed.`,
    )
  }
  // A WEAK prerequisite the delete cannot unlink. Separate from the owner-ref
  // refusal above because the remedy is different: migration 052 only weakens
  // owner references and can do nothing about an already-weak prerequisite, so
  // reporting these together sent the administrator to run a migration that
  // would change nothing and leave the delete just as refused.
  if (tree.danglingPrerequisites > 0) {
    throw new DeletionRefusalError(
      `${tree.danglingPrerequisites} Task${tree.danglingPrerequisites === 1 ? '' : 's'} outside this deletion still list${tree.danglingPrerequisites === 1 ? 's' : ''} one of these Tasks as a Prerequisite — an unpublished Studio edit, a scheduled release, or a Task on another edition. Clear that Prerequisite, or discard or unschedule the edit holding it, and try again; nothing has been changed.`,
    )
  }
  // Unpublished Studio work the delete cannot see and would not remove.
  if (tree.draftOnlyRecords > 0) {
    throw new DeletionRefusalError(
      `${tree.draftOnlyRecords} unpublished Studio ${tree.draftOnlyRecords === 1 ? 'draft or scheduled release belongs' : 'drafts or scheduled releases belong'} to this plan and would be left behind with no owner — a release would even recreate ${tree.draftOnlyRecords === 1 ? 'it' : 'them'} later. Publish, discard or unschedule ${tree.draftOnlyRecords === 1 ? 'it' : 'them'} in the Studio first; nothing has been changed.`,
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
