import type { NotificationInput } from '@/lib/notification/types'
import type { VariantFailureEvent } from '@/lib/social/publish-engine'
import { manualPostPath } from '@/lib/social/notify'

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

/**
 * The same, for a STANDALONE post — one with no Task behind it (#1128).
 *
 * These publish automatically like any other, so a terminal failure that
 * notified nobody left the post sitting `failed` on a page the organizer had
 * no reason to reopen. It matters most for `ambiguous`, where the post may be
 * live and waiting to be reconciled by hand.
 *
 * The link goes to the Social posts screen rather than a Task that does not
 * exist, deep-linked to the variant so the copy-ready view (and its
 * check-first warning) is one click away. The cron is the actor, so there is
 * no human actor to exclude.
 */
export function standalonePublishFailureNotification(
  recipientId: string,
  { variant, attempt }: VariantFailureEvent,
): NotificationInput[] {
  return [
    {
      recipientId,
      conferenceId: variant.conferenceId,
      notificationType: 'social_publish_failed',
      title: `Post failed on ${variant.platform}`,
      message:
        attempt.outcome === 'ambiguous'
          ? 'We could not confirm whether it went out — check the platform before posting again.'
          : (attempt.error ?? attempt.outcome),
      link: manualPostPath(variant._id),
      // Identity of this failure, not its timestamp: a retry can fail again.
      tag: `social-failure.${variant._id}.${attempt._key}`,
    },
  ]
}
