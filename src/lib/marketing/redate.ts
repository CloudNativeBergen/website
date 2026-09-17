/**
 * Pure re-dating of stored, anchored Tasks and Campaign windows. An organizer's
 * current instant must still equal the last plan-computed instant to move.
 * Returning to exactly plannedAt intentionally restores eligibility.
 */
import { CHANNEL_SLOT, WORK_SLOT, resolveAnchor, slotAt } from './materialize'
import type { VariantStatus } from '@/lib/social/types'
import type { Milestone, ResolvedMilestone } from './milestones'
import type { MarketingChannel, TaskKind, TaskStatus } from './types'

export interface RedatableTask {
  _id: string
  _rev: string
  kind: TaskKind
  channel: MarketingChannel | null
  milestone: Milestone | null
  offsetDays: number | null
  provisional: boolean
  plannedAt: string | null
  dueAt: string | null
  status: TaskStatus | null
  approvedAt: string | null
  variant: {
    _id: string
    _rev: string
    status: VariantStatus
    scheduledAt: string
    usesCustomTime: boolean | null
    postId: string
    postRev: string
  } | null
}

export interface RedatableCampaign {
  _id: string
  _rev: string
  startMilestone: Milestone
  startOffsetDays: number
  endMilestone: Milestone
  endOffsetDays: number
  startDate: string
  endDate: string
  provisional: boolean
}

export interface RedatePlan {
  tasks: {
    taskId: string
    taskRev: string
    at: string
    provisional: boolean
    variant: { id: string; rev: string; postId: string; postRev: string } | null
  }[]
  campaigns: {
    id: string
    rev: string
    startDate: string
    endDate: string
    provisional: boolean
  }[]
}

/** Shared with the daily sweep's work-based eligibility check. */
export function isRedatableTask(task: RedatableTask): boolean {
  if (
    task.milestone == null ||
    task.offsetDays == null ||
    task.plannedAt == null
  )
    return false
  const currentAt =
    task.kind === 'publishing' ? task.variant?.scheduledAt : task.dueAt
  if (currentAt !== task.plannedAt) return false
  return task.kind === 'publishing'
    ? task.variant != null &&
        task.variant.status === 'draft' &&
        task.variant.usesCustomTime !== true
    : task.status === 'open' && task.approvedAt == null
}

export function planRedates(input: {
  milestones: Record<Milestone, ResolvedMilestone>
  tasks: RedatableTask[]
  campaigns: RedatableCampaign[]
}): RedatePlan {
  const result: RedatePlan = { tasks: [], campaigns: [] }
  for (const task of input.tasks) {
    if (
      !isRedatableTask(task) ||
      task.milestone == null ||
      task.offsetDays == null
    )
      continue
    const anchor = resolveAnchor(
      { milestone: task.milestone, offsetDays: task.offsetDays },
      input.milestones,
    )
    const slot =
      task.kind === 'publishing' && task.channel
        ? CHANNEL_SLOT[task.channel]
        : WORK_SLOT
    const at = slotAt(anchor.date, slot)
    const currentAt =
      task.kind === 'publishing' ? task.variant?.scheduledAt : task.dueAt
    if (currentAt === at && task.provisional === anchor.provisional) continue
    result.tasks.push({
      taskId: task._id,
      taskRev: task._rev,
      at,
      provisional: anchor.provisional,
      variant:
        task.kind === 'publishing' && task.variant
          ? {
              id: task.variant._id,
              rev: task.variant._rev,
              postId: task.variant.postId,
              postRev: task.variant.postRev,
            }
          : null,
    })
  }
  for (const campaign of input.campaigns) {
    const start = resolveAnchor(
      {
        milestone: campaign.startMilestone,
        offsetDays: campaign.startOffsetDays,
      },
      input.milestones,
    )
    const end = resolveAnchor(
      { milestone: campaign.endMilestone, offsetDays: campaign.endOffsetDays },
      input.milestones,
    )
    const provisional = start.provisional || end.provisional
    if (
      campaign.startDate === start.date &&
      campaign.endDate === end.date &&
      campaign.provisional === provisional
    )
      continue
    result.campaigns.push({
      id: campaign._id,
      rev: campaign._rev,
      startDate: start.date,
      endDate: end.date,
      provisional,
    })
  }
  return result
}
