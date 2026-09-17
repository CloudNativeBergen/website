import type { DeletionPreview, DeletionTree } from './types'

export class DeletionRefusalError extends Error {}

export function deletionPreview(tree: DeletionTree): DeletionPreview {
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
