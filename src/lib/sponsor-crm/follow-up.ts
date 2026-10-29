import { osloLocalInputToIso, osloTodayDateString } from '@/lib/time'

/** Follow-ups are stored as 09:00 Oslo time on the chosen day. */
const FOLLOW_UP_TIME = '09:00'

/** A YYYY-MM-DD Oslo date → the instant stored in `nextFollowUpAt`. */
export function followUpDateToIso(date: string): string | null {
  return osloLocalInputToIso(`${date}T${FOLLOW_UP_TIME}`)
}

/** The Oslo calendar date `days` after today's Oslo date, as YYYY-MM-DD. */
export function osloDatePlusDays(days: number, now: Date = new Date()): string {
  const [y, m, d] = osloTodayDateString(now).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Quick pick: the follow-up instant `days` from today in Oslo. */
export function followUpInDays(days: number, now: Date = new Date()): string {
  return followUpDateToIso(osloDatePlusDays(days, now))!
}

/** Same rule as the action items: due once the instant has passed. */
export function isFollowUpOverdue(
  value: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return !!value && new Date(value) <= now
}
