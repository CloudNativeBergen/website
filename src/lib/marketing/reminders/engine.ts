import type { NotificationInput } from '@/lib/notification/types'
import type { TaskKind } from '../types'

export type ReminderMarker = 'remindedAt' | 'overdueNudgedAt'
export interface ReminderTask {
  _id: string
  _rev: string
  conferenceId: string
  title: string
  kind: TaskKind
  assigneeId: string | null
  status: string | null
  dueAt: string | null
  hasAsset: boolean
  messageId: string | null
  remindedAt: string | null
  overdueNudgedAt: string | null
  variant: {
    status: string
    scheduledAt: string | null
    url: string | null
  } | null
}

/** Publishing is due at handoff; any incomplete variant becomes overdue after 24h. */
export function reminderMarker(
  task: ReminderTask,
  now: string,
  marker: ReminderMarker,
): boolean {
  if (!task.assigneeId || task.status === 'skipped') return false
  const publishing = task.kind === 'publishing'
  if (publishing) {
    if (!task.variant) return false
    if (marker === 'remindedAt' && task.variant.status !== 'awaiting-manual')
      return false
    if (task.variant.status === 'published' && task.variant.url) return false
  } else if (task.status !== 'open') return false
  if (task.kind === 'studioRender' && task.hasAsset) return false
  if (
    (task.kind === 'speakerOutreach' || task.kind === 'sponsorOutreach') &&
    task.messageId
  )
    return false
  const due = publishing ? task.variant?.scheduledAt : task.dueAt
  if (!due || task[marker]) return false
  const threshold = marker === 'overdueNudgedAt' ? 86_400_000 : 0
  return Date.parse(now) - Date.parse(due) >= threshold
}

export function reminderNotification(
  task: ReminderTask,
  marker: ReminderMarker,
): NotificationInput {
  return {
    recipientId: task.assigneeId!,
    conferenceId: task.conferenceId,
    notificationType:
      marker === 'remindedAt' ? 'marketing_task_due' : 'marketing_task_overdue',
    title:
      marker === 'remindedAt' ? 'Marketing task due' : 'Marketing task overdue',
    message: task.title,
    link: `/admin/marketing/tasks/${encodeURIComponent(task._id)}`,
  }
}

export interface ReminderStore {
  candidates(
    conferenceId: string,
    now: string,
    marker: ReminderMarker,
  ): Promise<ReminderTask[]>
  claim(
    task: ReminderTask,
    marker: ReminderMarker,
    now: string,
  ): Promise<boolean>
  notify(inputs: NotificationInput[]): Promise<number>
}

/** Claim before delivery: concurrent runs cannot send the same beat twice.
 * A delivery outage after claiming can lose a reminder; this deliberately provides
 * at-most-once attempts rather than pretending a cross-service send is atomic.
 */
export async function runReminderEngine(
  conferenceId: string,
  now: string,
  store: ReminderStore,
) {
  const result = { due: 0, overdue: 0 }
  for (const marker of ['remindedAt', 'overdueNudgedAt'] as const) {
    const tasks = await store.candidates(conferenceId, now, marker)
    const inputs: NotificationInput[] = []
    for (const task of tasks) {
      if (
        task.conferenceId !== conferenceId ||
        !reminderMarker(task, now, marker)
      )
        continue
      if (await store.claim(task, marker, now))
        inputs.push(reminderNotification(task, marker))
    }
    if (inputs.length)
      result[marker === 'remindedAt' ? 'due' : 'overdue'] =
        await store.notify(inputs)
  }
  return result
}
