import { getCurrentDateTime } from '@/lib/time'
import { clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { createNotifications } from '@/lib/notification/sanity'
import type { VariantFailureEvent } from '@/lib/social/publish-engine'
import type { PublishableVariant } from '@/lib/social/store'
import { notifyAwaitingManual } from '@/lib/social/notify'
import { runMarketingReminders } from '@/lib/marketing/reminders'
import {
  standalonePublishFailureNotification,
  taskFailureNotification,
  type FailureTask,
} from './builders'

/** Called immediately by the winner of the failure-transition CAS, never by a sweep. */
export async function notifyMarketingFailure(
  event: VariantFailureEvent,
): Promise<number> {
  try {
    const task = await scopedFetch<FailureTask | null>(
      clientWrite,
      { conferenceId: event.variant.conferenceId },
      `*[_type == "marketingTask" && kind == "publishing" && variant._ref == $variantId && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]{ _id, title, "assigneeId": assignee._ref }`,
      { variantId: event.variant._id },
      { cache: 'no-store' },
    )
    if (task) {
      return await createNotifications(taskFailureNotification(task, event))
    }
    // NO TASK — a standalone post from the Social posts screen. It is still
    // eligible for automatic publishing, so its terminal failures used to
    // notify nobody: the row just changed colour on a page an organizer had
    // no reason to revisit. That matters most for the outcome this ticket
    // added, `ambiguous`, where the post may be live and waiting to be
    // reconciled.
    //
    // The recipient is the post's creator, the same rule the awaiting-manual
    // path uses. Fetched here because `VariantFailureEvent.variant` is a
    // `SocialPostVariant`, which does not carry it — only the due-read
    // projection does.
    const creator = await scopedFetch<string | null>(
      clientWrite,
      { conferenceId: event.variant.conferenceId },
      // `scopedFetch` constrains the ROOT variant only. The dereference below
      // would still follow a hand-edited or corrupt reference into ANOTHER
      // conference's post and return that tenant's user — who would then get
      // a persistent notification and a web push about a post they cannot
      // see. Guarded with the same predicate `DUE_PROJECTION` uses, so an
      // out-of-tenant post reads as no creator and notifies nobody.
      `*[_type == "socialPostVariant" && _id == $variantId && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]{ "creator": select(post->conference._ref == conference._ref => post->createdBy._ref) }.creator`,
      { variantId: event.variant._id },
      { cache: 'no-store' },
    )
    // A post whose creator is gone (erased, cross-tenant) notifies nobody
    // rather than every organizer — the same choice `manualDueNotifications`
    // makes for the same reason.
    if (!creator) return 0
    return await createNotifications(
      standalonePublishFailureNotification(creator, event),
    )
  } catch (error) {
    // Reads can fail too. The failed business transition must remain successful.
    console.error('Could not notify marketing task failure:', error)
    return 0
  }
}

/**
 * Task-backed variants use the Task's assignee + CAS reminder marker. Standalone
 * posts retain the original creator notification. Query one task per variant,
 * so corrupt duplicate task refs cannot consume the bounded result window and
 * accidentally send another Task's creator a legacy notification.
 */
export async function notifyMarketingAwaitingManual(
  variants: readonly PublishableVariant[],
): Promise<void> {
  const groups = new Map<string, PublishableVariant[]>()
  for (const variant of variants) {
    const group = groups.get(variant.conferenceId) ?? []
    group.push(variant)
    groups.set(variant.conferenceId, group)
  }
  for (const [conferenceId, group] of groups) {
    try {
      // The engine hands over at most 50 variants. Chunk defensively for callers.
      for (let offset = 0; offset < group.length; offset += 50) {
        const chunk = group.slice(offset, offset + 50)
        let rows: { _id: string; taskId: string | null }[]
        try {
          rows = await scopedFetch<typeof rows>(
            clientWrite,
            { conferenceId },
            `*[_type == "socialPostVariant" && _id in $variantIds && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0...50]{ _id, "taskId": *[_type == "marketingTask" && conference._ref == $conferenceId && variant._ref == ^._id && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]._id }`,
            { variantIds: chunk.map((variant) => variant._id) },
            { cache: 'no-store' },
          )
        } catch (error) {
          // The transition will not be retried. Its initial due read already
          // proved which variants were standalone, so preserve only those creator
          // notifications. Task-backed variants retain an unset remindedAt and
          // the reminder cron will retry the assignee; never guess from a read error.
          // If the initial read fails too, no variant is claimed and the next
          // publish tick retries it. A persistent routing-query failure therefore
          // cannot strand a standalone post after its successful transition.
          console.error(
            `Could not resolve manual marketing tasks for ${conferenceId}:`,
            error,
          )
          await notifyAwaitingManual(
            chunk.filter((variant) => variant.marketingTaskId === null),
          )
          continue
        }
        const standaloneIds = new Set(
          rows.filter((row) => !row.taskId).map((row) => row._id),
        )
        await notifyAwaitingManual(
          chunk.filter((variant) => standaloneIds.has(variant._id)),
        )
        if (rows.some((row) => row.taskId))
          await runMarketingReminders(conferenceId, getCurrentDateTime())
      }
    } catch (error) {
      console.error(
        `Could not notify manual marketing tasks for ${conferenceId}:`,
        error,
      )
    }
  }
}
