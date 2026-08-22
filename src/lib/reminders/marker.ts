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

/** The identity of one recurring reminder marker. */
export interface ReminderLogStamp {
  id: string
  key: string
  conferenceId: string
  speakerId: string
}

/**
 * Stamp N recurring reminder markers after a successful send, in ONE
 * transaction: per marker, create it if missing (count 0) then increment the
 * counter and record `lastSentAt`.
 *
 * BATCHED ON PURPOSE (Sanity request budget). This was one transaction PER
 * reminder, issued inside the runner's per-speaker loop, so a CFP-peak run cost
 * one round-trip per due speaker on top of the notification write. The whole
 * batch is now one request.
 *
 * IDEMPOTENT under the deterministic ids: `createIfNotExists` collapses a
 * concurrent or retried run onto the same documents, and a transaction that
 * fails is applied atomically (nothing stamped), so a retry can neither
 * double-count a send nor half-stamp a batch. The caller stamps ONLY after the
 * hub write persisted, and treats a stamp failure as a failure of those items —
 * they retry on the next run rather than being silently marked sent.
 */
export async function stampReminderLogs(
  stamps: ReminderLogStamp[],
  now: Date,
): Promise<void> {
  if (stamps.length === 0) return
  const lastSentAt = now.toISOString()
  let tx = clientWrite.transaction()
  for (const stamp of stamps) {
    tx = tx
      .createIfNotExists({
        _id: stamp.id,
        _type: 'scheduledReminderLog',
        key: stamp.key,
        conference: { ...createReference(stamp.conferenceId), _weak: true },
        speaker: { ...createReference(stamp.speakerId), _weak: true },
        count: 0,
      })
      .patch(stamp.id, (patch) => patch.set({ lastSentAt }).inc({ count: 1 }))
  }
  await tx.commit()
}

/** The identity of one single-shot day-of marker. */
export interface DayOfLogStamp {
  id: string
  conferenceId: string
  speakerId: string
}

/**
 * Create N single-shot day-of markers (count 1) that do not already exist, in
 * ONE transaction. The deterministic id per (conference, speaker, date) is the
 * whole dedup mechanism — no counter needed — and `createIfNotExists` keeps a
 * retry from re-arming a day-of ping that already went out.
 *
 * Batched for the same reason as {@link stampReminderLogs}: the day-of path ran
 * one write per presenting speaker.
 */
export async function createDayOfLogs(
  stamps: DayOfLogStamp[],
  now: Date,
): Promise<void> {
  if (stamps.length === 0) return
  const lastSentAt = now.toISOString()
  let tx = clientWrite.transaction()
  for (const stamp of stamps) {
    tx = tx.createIfNotExists({
      _id: stamp.id,
      _type: 'scheduledReminderLog',
      key: 'day-of',
      conference: { ...createReference(stamp.conferenceId), _weak: true },
      speaker: { ...createReference(stamp.speakerId), _weak: true },
      count: 1,
      lastSentAt,
    })
  }
  await tx.commit()
}
