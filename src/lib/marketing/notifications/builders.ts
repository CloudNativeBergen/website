import type { NotificationInput } from '@/lib/notification/types'
import type { VariantFailureEvent } from '@/lib/social/publish-engine'

export interface FailureTask {
  _id: string
  title: string | null
  assigneeId: string | null
}

/** The cron is the actor, so there is no human actor to exclude. */
export function taskFailureNotification(
  task: FailureTask,
  { variant, attempt }: VariantFailureEvent,
): NotificationInput[] {
  if (!task.assigneeId) return []
  return [
    {
      recipientId: task.assigneeId,
      conferenceId: variant.conferenceId,
      notificationType: 'marketing_task_failed',
      title: 'Marketing task failed',
      message: `${task.title || 'Publishing task'}: ${attempt.outcome}`,
      link: `/admin/marketing/tasks/${encodeURIComponent(task._id)}`,
      // Identity of this failure, not its timestamp: a retry can fail again.
      tag: `marketing-failure.${variant._id}.${attempt._key}`,
    },
  ]
}
