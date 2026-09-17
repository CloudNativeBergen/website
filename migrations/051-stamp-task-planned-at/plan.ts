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
