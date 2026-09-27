import type { NotificationInput } from '@/lib/notification/types'
import type {
  TagsWithheldEvent,
  VariantFailureEvent,
} from '@/lib/social/publish-engine'
import { manualPostPath } from '@/lib/social/notify'
import { joinNames } from '@/lib/marketing/tagging/body'
import { GONE_SPEAKER_TEXT } from '@/lib/marketing/tagging/publish'

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
 * A post that went out with a tag swapped out at publish (tagging spec §4.4,
 * Publish): ONE notification per organizer of the organization, linking to
 * the Task (or, for a standalone post, the post). The cron made the swap,
 * but the opt-out that caused it is the speaker's own action: an organizer
 * who is that speaker is left out, never told about their own choice
 * (AGENTS.md "Actor exclusion", review T5).
 *
 * An opted-out speaker is named, with the handle that was not used. A
 * speaker who is GONE (deleted or erased) is only counted: an erased
 * person's name must not be repeated in a notification kept for 90 days.
 */
export function tagsWithheldNotifications(
  organizerIds: readonly string[],
  { variant, withheld }: TagsWithheldEvent,
): NotificationInput[] {
  const optedOut = withheld.flatMap((w) =>
    w.reason === 'opted-out' ? [w] : [],
  )
  const gone = withheld.length - optedOut.length
  const message = [
    optedOut.length > 0
      ? `${joinNames(optedOut.map((w) => w.name))} asked not to be tagged after the post was approved, so it went out with ${optedOut.length > 1 ? 'their names' : 'their name'} instead of ${optedOut.map((w) => `@${w.handle}`).join(', ')}.`
      : null,
    gone === 1
      ? `A tag of someone who is no longer a speaker here was replaced with “${GONE_SPEAKER_TEXT}”.`
      : gone > 1
        ? `${gone} tags of people who are no longer speakers here were replaced with “${GONE_SPEAKER_TEXT}”.`
        : null,
  ]
    .filter(Boolean)
    .join(' ')
  const link = variant.marketingTaskId
    ? `/admin/marketing/tasks/${encodeURIComponent(variant.marketingTaskId)}`
    : manualPostPath(variant._id)
  const actors = new Set(optedOut.map((w) => w.speakerId))
  return [...new Set(organizerIds)]
    .filter((id) => !actors.has(id))
    .map((recipientId) => ({
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
