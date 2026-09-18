import {
  CHANNEL_SLOT,
  WORK_SLOT,
  resolveAnchor,
  slotAt,
} from '../../src/lib/marketing/materialize'
import {
  resolveAllMilestones,
  type Milestone,
  type MilestoneSource,
} from '../../src/lib/marketing/milestones'
import type { MarketingChannel, TaskKind } from '../../src/lib/marketing/types'

export interface LegacyTask {
  _id: string
  _rev: string
  kind: TaskKind
  channel?: MarketingChannel | null
  milestone?: Milestone | null
  offsetDays?: number | null
  plannedAt?: string | null
  /** Where the Task actually sits: `dueAt`, or the variant's `scheduledAt`. */
  currentAt?: string | null
  usesCustomTime?: boolean | null
}

export function planStamps(
  tasks: LegacyTask[],
  source: MilestoneSource,
): { id: string; rev: string; at: string }[] {
  const milestones = resolveAllMilestones(source)
  return tasks.flatMap((task) => {
    if (
      task._id.startsWith('drafts.') ||
      task._id.startsWith('versions.') ||
      task.plannedAt != null ||
      task.milestone == null ||
      task.offsetDays == null
    )
      return []
    // Stamp where the Task ACTUALLY sits, not where its anchor computes today.
    //
    // Stamping the recomputed anchor looked conservative and was the opposite:
    // before this feature nothing ever re-dated a Task, so every plan whose
    // Milestones drifted after seeding has `dueAt` at the OLD anchor. Those
    // Tasks would have got `plannedAt` at the NEW one, diverged on sight, and
    // been excluded from re-dating for ever — which is precisely the backlog
    // #1078 exists to clear.
    //
    // Adopting the stored instant is right for the two ways a Task could be
    // hand-moved before this: `setTaskDate` unsets the anchor, and the social
    // editor's custom time sets `usesCustomTime`, which the movable predicate
    // already excludes. Either way the Task is not a candidate.
    //
    // KNOWN EXCEPTION, accepted. `social.updatePostDefaultTime` rewrites
    // `scheduledAt` on every follower variant of a post — those with
    // `usesCustomTime != true` — and marks nothing: no anchor is cleared and
    // no flag is set. This migration therefore adopts that organizer-chosen
    // instant as the generated one, and the first re-date run moves the Task
    // to its Milestone anchor at the CHANNEL slot, reverting the chosen
    // time-of-day.
    //
    // There is no discriminator to fix it with here. The obvious one —
    // `scheduledAt === post.defaultScheduledAt` — is the normal state of a
    // generated post, because materialization sets `defaultScheduledAt` to
    // the same instant (materialize.ts) and re-dating keeps them in step
    // (redate-sanity.ts). And the alternative, stamping the recomputed anchor,
    // is the population-freezing bug described above. Losing a time-of-day on
    // one post's followers, once, is the smaller harm than an edition that can
    // never be re-dated; the post default can simply be set again afterwards.
    // The variant-level fix belongs with `updatePostDefaultTime`, which should
    // record that it moved something, not with this one-shot backfill.
    if (task.usesCustomTime === true) return []
    if (task.currentAt)
      return [{ id: task._id, rev: task._rev, at: task.currentAt }]
    // No stored instant at all (an unscheduled publishing Task): fall back to
    // the computed anchor, which is the only honest answer available.
    const { date } = resolveAnchor(
      { milestone: task.milestone, offsetDays: task.offsetDays },
      milestones,
    )
    const slot =
      task.kind === 'publishing' && task.channel
        ? CHANNEL_SLOT[task.channel]
        : WORK_SLOT
    return [{ id: task._id, rev: task._rev, at: slotAt(date, slot) }]
  })
}
