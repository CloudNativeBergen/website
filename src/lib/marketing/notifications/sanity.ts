import { getCurrentDateTime } from '@/lib/time'
import { clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { createNotifications } from '@/lib/notification/sanity'
import type { VariantFailureEvent } from '@/lib/social/publish-engine'
import type { PublishableVariant } from '@/lib/social/store'
import { notifyAwaitingManual } from '@/lib/social/notify'
import { runMarketingReminders } from '@/lib/marketing/reminders'
import { taskFailureNotification, type FailureTask } from './builders'

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
    return task
      ? await createNotifications(taskFailureNotification(task, event))
      : 0
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
        const rows = await scopedFetch<
          { _id: string; taskId: string | null }[]
        >(
          clientWrite,
          { conferenceId },
          `*[_type == "socialPostVariant" && _id in $variantIds && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0...50]{ _id, "taskId": *[_type == "marketingTask" && conference._ref == $conferenceId && variant._ref == ^._id && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]._id }`,
          { variantIds: chunk.map((variant) => variant._id) },
          { cache: 'no-store' },
        )
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
      // No fallback to creator on an unreadable task link: daily reminders
      // can recover Task notifications without notifying the wrong person.
      console.error(
        `Could not notify manual marketing tasks for ${conferenceId}:`,
        error,
      )
    }
  }
}
