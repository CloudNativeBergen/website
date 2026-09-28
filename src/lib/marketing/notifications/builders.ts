import type { NotificationInput } from '@/lib/notification/types'
import type {
  TagsWithheldEvent,
  VariantFailureEvent,
} from '@/lib/social/publish-engine'
import { manualPostPath } from '@/lib/social/notify'
import { SOCIAL_PLATFORM_LABELS } from '@/lib/social/types'
import { truncateToGraphemeBoundary } from '@/lib/messaging/links'
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

/** Buffer's error is free text; the full trail stays on the variant. */
const VENDOR_MESSAGE_MAX = 300

/**
 * A FAILED CONFIRMATION (#1130, spec §3.3, §4): the asynchronous publisher —
 * Buffer, the only one there is (#1129) — accepted the post, then reported
 * an error, lost it, or never settled it. Buffer's error is terminal and
 * never retried, and its usual cause is LinkedIn's re-authorization inside
 * Buffer's UI: an organization-wide problem any organizer may fix. So EVERY
 * organizer of the organization hears it (one row each, deduplicated),
 * carrying Buffer's own message, linked to the post's copy-ready view where
 * it can be recorded, posted by hand, or retried from its row.
 *
 * THE ACTOR is the publish cron, which runs as no one: the failure is
 * Buffer's verdict, not any organizer's action, so there is nobody to
 * exclude. The organizer who approved the post is deliberately NOT treated
 * as the actor — they are the person who most needs to hear it failed.
 */
export function confirmationFailureNotifications(
  organizerIds: readonly string[],
  { variant, attempt }: VariantFailureEvent,
): NotificationInput[] {
  const platform = SOCIAL_PLATFORM_LABELS[variant.platform]
  const text = (attempt.error ?? '').trim() || attempt.outcome
  const message =
    text.length > VENDOR_MESSAGE_MAX
      ? `${truncateToGraphemeBoundary(text, VENDOR_MESSAGE_MAX - 1)}…`
      : text
  return [...new Set(organizerIds)].map((recipientId) => ({
    recipientId,
    conferenceId: variant.conferenceId,
    notificationType: 'social_publish_failed' as const,
    // `rejected` is Buffer saying no; anything else (gone, timed out) is a
    // post that MAY be live, which must never read as a plain failure.
    title:
      attempt.outcome === 'rejected'
        ? `Buffer could not post to ${platform}`
        : `${platform} post not confirmed`,
    message,
    link: manualPostPath(variant._id),
    // Identity of this failure, not its timestamp: a retry can fail again.
    tag: `social-failure.${variant._id}.${attempt._key}`,
  }))
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
  const companies = withheld.flatMap((w) =>
    w.reason === 'listed-by-opted-out' ? [w] : [],
  )
  const gone = withheld.filter((w) => w.reason === 'gone').length
  const message = [
    optedOut.length > 0
      ? `${joinNames(optedOut.map((w) => w.name))} asked not to be tagged after the post was approved, so it went out with ${optedOut.length > 1 ? 'their names' : 'their name'} instead of ${optedOut.flatMap((w) => w.handles.map((h) => `@${h}`)).join(', ')}.`
      : null,
    // The speaker who listed the account is never named here (#1154).
    ...companies.map(
      (w) =>
        `${w.handles.map((h) => `@${h}`).join(', ')} went out as “${w.name}”: someone who asked not to be tagged lists that account.`,
    ),
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
