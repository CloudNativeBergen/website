import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import { createReference } from '@/lib/sanity/helpers'
import { daysSince } from './dates'
import type { Reminder, ReminderLog } from './types'

/**
 * Deterministic dedup-marker id for a recurring speaker reminder. Derived (never
 * random) so a daily re-run resolves to the SAME `scheduledReminderLog` document
 * and `createIfNotExists` collapses concurrent runs onto one marker.
 */
export function reminderLogId(
  key: string,
  conferenceId: string,
  speakerId: string,
): string {
  return `reminder.${key}.${conferenceId}.${speakerId}`
}

/**
 * Deterministic marker id for the day-of agenda: scoped additionally by the
 * schedule date so a multi-day event re-arms per presenting day.
 */
export function dayOfLogId(
  conferenceId: string,
  speakerId: string,
  date: string,
): string {
  return `reminder.day-of.${conferenceId}.${speakerId}.${date}`
}

/**
 * Batch-read the existing markers for a set of deterministic ids, keyed by id.
 * A single GROQ read for the whole run (mirrors the message-collapse read).
 */
export async function readReminderLogs(
  ids: string[],
): Promise<Map<string, ReminderLog>> {
  if (ids.length === 0) return new Map()
  const rows = await clientReadUncached.fetch<ReminderLog[]>(
    `*[_type == "scheduledReminderLog" && _id in $ids]{ _id, count, lastSentAt }`,
    { ids },
    { cache: 'no-store' },
  )
  return new Map((rows ?? []).map((row) => [row._id, row]))
}

/**
 * The cap + spacing gate for a re-arming reminder: send only if the send count
 * is below the reminder's cap AND enough days have elapsed since the last send.
 * A missing marker (never sent) always passes.
 */
export function shouldSendReminder(
  existing: ReminderLog | undefined,
  reminder: Reminder,
  now: Date,
): boolean {
  const count = existing?.count ?? 0
  if (count >= reminder.maxSends) return false
  if (
    existing?.lastSentAt &&
    daysSince(existing.lastSentAt, now) < reminder.spacingDays
  ) {
    return false
  }
  return true
}

/**
 * Stamp a recurring reminder marker after a successful send: create the marker
 * if missing (count 0) then increment the counter and record `lastSentAt`, in
 * ONE transaction. Idempotent under the deterministic id.
 */
export async function stampReminderLog({
  id,
  key,
  conferenceId,
  speakerId,
  now,
}: {
  id: string
  key: string
  conferenceId: string
  speakerId: string
  now: Date
}): Promise<void> {
  await clientWrite
    .transaction()
    .createIfNotExists({
      _id: id,
      _type: 'scheduledReminderLog',
      key,
      conference: { ...createReference(conferenceId), _weak: true },
      speaker: { ...createReference(speakerId), _weak: true },
      count: 0,
    })
    .patch(id, (patch) =>
      patch.set({ lastSentAt: now.toISOString() }).inc({ count: 1 }),
    )
    .commit()
}

/**
 * Create a single-shot day-of marker (count 1) if it does not already exist.
 * The deterministic id per (conference, speaker, date) is the whole dedup
 * mechanism — no counter needed.
 */
export async function createDayOfLog({
  id,
  conferenceId,
  speakerId,
  now,
}: {
  id: string
  conferenceId: string
  speakerId: string
  now: Date
}): Promise<void> {
  await clientWrite.createIfNotExists({
    _id: id,
    _type: 'scheduledReminderLog',
    key: 'day-of',
    conference: { ...createReference(conferenceId), _weak: true },
    speaker: { ...createReference(speakerId), _weak: true },
    count: 1,
    lastSentAt: now.toISOString(),
  })
}
