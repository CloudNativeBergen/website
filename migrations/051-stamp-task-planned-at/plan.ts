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
    // Adopting the stored instant is safe because there was no way to hand-move
    // an ANCHORED Task before this: `setTaskDate` unsets the anchor, and the
    // social editor's custom time sets `usesCustomTime`, which the movable
    // predicate already excludes. A Task that is still anchored is therefore
    // still where the plan put it.
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
