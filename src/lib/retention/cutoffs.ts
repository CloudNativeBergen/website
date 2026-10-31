import { osloTodayDateString } from '@/lib/time'

/**
 * Pure retention cutoffs for the daily `cleanup-notifications` cron. No I/O, so
 * the boundaries can be pinned by tests.
 */

/** Default hub-notification retention (the maximum stated on `/privacy`). */
export const NOTIFICATION_RETENTION_DAYS = 90

/** Shorter retention for notifications that are stale once acted on. */
export const SHORT_NOTIFICATION_RETENTION_DAYS = 30

/** Notification types kept for {@link SHORT_NOTIFICATION_RETENTION_DAYS}. */
export const SHORT_RETENTION_NOTIFICATION_TYPES = [
  'system',
  'marketing_task_overdue',
  'marketing_task_due',
  'message_stale',
  'workshop_capacity',
]

/** Days after a conference ends before its reminder dedup markers go. */
export const REMINDER_LOG_RETENTION_DAYS = 60

/** Months after a conference ends before its reviews fold into a summary. */
export const REVIEW_RETENTION_MONTHS = 24

/** Months after a conference ends before its marketing snapshots go. */
export const MARKETING_SNAPSHOT_RETENTION_MONTHS = 24

/**
 * The Oslo calendar date `months` before today (Oslo). A conference whose
 * `endDate` is strictly before it ended more than `months` months ago. A day
 * past the target month's end clamps to its last day (Mar 31 → Feb 28).
 */
export function osloMonthsCutoff(
  months: number,
  now: Date = new Date(),
): string {
  const [y, m, d] = osloTodayDateString(now).split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m - months, 0)).getUTCDate()
  return new Date(Date.UTC(y, m - 1 - months, Math.min(d, lastDay)))
    .toISOString()
    .slice(0, 10)
}

/**
 * The Oslo calendar date `days` before today (Oslo), as YYYY-MM-DD. A
 * conference whose `endDate` is strictly BEFORE this ended more than `days`
 * days ago. Calendar arithmetic on the date string, so DST cannot shift it.
 */
export function osloDateCutoff(days: number, now: Date = new Date()): string {
  const [y, m, d] = osloTodayDateString(now).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10)
}

/** True when a conference ending on `endDate` is past the reminder-log horizon. */
export function reminderLogsExpired(
  endDate: string,
  now: Date = new Date(),
): boolean {
  return endDate < osloDateCutoff(REMINDER_LOG_RETENTION_DAYS, now)
}
