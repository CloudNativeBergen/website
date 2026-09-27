import type { NotificationInput } from '@/lib/notification/types'
import type {
  TagsWithheldEvent,
  VariantFailureEvent,
} from '@/lib/social/publish-engine'
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

/**
 * A post that went out with a late opt-out's tag swapped for the plain name
 * (tagging spec §4.4, Publish): ONE notification per organizer, linking to
 * the Task (or, for a standalone post, the post). The actor is the speaker
 * who opted out — an organizer who opted out is never told about their own
 * choice. The cron made the swap; there is no other human actor.
 */
export function tagsWithheldNotifications(
  organizerIds: readonly string[],
  { variant, withheld }: TagsWithheldEvent,
): NotificationInput[] {
  const actors = new Set(withheld.map((w) => w.speakerId))
  const recipients = [...new Set(organizerIds)].filter((id) => !actors.has(id))
  const who = withheld.map((w) => w.name)
  const names =
    who.length <= 1
      ? (who[0] ?? '')
      : `${who.slice(0, -1).join(', ')} and ${who[who.length - 1]}`
  const handles = withheld.map((w) => `@${w.handle}`).join(', ')
  const message = `${names} asked not to be tagged after the post was approved, so it went out with ${withheld.length > 1 ? 'their names' : 'their name'} instead of ${handles}.`
  const link = variant.marketingTaskId
    ? `/admin/marketing/tasks/${encodeURIComponent(variant.marketingTaskId)}`
    : manualPostPath(variant._id)
  return recipients.map((recipientId) => ({
    recipientId,
    conferenceId: variant.conferenceId,
    notificationType: 'marketing_task_tag_withheld' as const,
    title: 'Posted without a tag',
    message,
    link,
    // One post is published once: its identity is the variant.
    tag: `marketing-tag-withheld.${variant._id}`,
  }))
}
