import { clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import {
  describeCeilingWarning,
  planCeilingWarnings,
  warningsTouching,
} from './ceilings'
import { getGenerationContext } from './generation-sanity'
import { resolveAllMilestones } from './milestones'
import { getPlanView } from './sanity'

/**
 * The Channel ceiling warnings a manual scheduling touches (spec §5.4), as
 * sentences for the organizer. Named by Task, variant, or post (a post's
 * default time moves every variant that follows it). BEST-EFFORT: a warning
 * never blocks, so any failure to compute one is an empty list, never an
 * error on the write that already landed.
 */
export async function ceilingWarningsFor(
  conferenceId: string,
  match: { taskIds?: string[]; variantIds?: string[]; postIds?: string[] },
): Promise<string[]> {
  try {
    const [context, view] = await Promise.all([
      getGenerationContext(conferenceId),
      getPlanView(conferenceId),
    ])
    if (!context || !view) return []
    const variantIds = new Set(match.variantIds ?? [])
    if (match.postIds?.length) {
      const ids = await scopedFetch<string[] | null>(
        clientReadUncached,
        { conferenceId },
        `*[_type == "socialPostVariant" && post._ref in $postIds && !(_id in path("drafts.**"))]._id`,
        { postIds: match.postIds },
        { cache: 'no-store' },
      )
      for (const id of ids ?? []) variantIds.add(id)
    }
    const taskIds = [
      ...(match.taskIds ?? []),
      ...view.tasks
        .filter((t) => t.variantId && variantIds.has(t.variantId))
        .map((t) => t._id),
    ]
    if (taskIds.length === 0) return []
    const milestones = resolveAllMilestones(context.conference)
    return warningsTouching(
      planCeilingWarnings(view.tasks, milestones),
      taskIds,
    ).map(describeCeilingWarning)
  } catch (error) {
    console.error('Channel ceiling check failed', error)
    return []
  }
}
