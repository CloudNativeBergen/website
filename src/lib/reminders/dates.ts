/**
 * Date-only helpers for the reminder engine. Everything works on calendar dates
 * (YYYY-MM-DD) at UTC midnight so comparisons are timezone-stable — see the
 * TZ ASSUMPTION documented on the cron route: the cron fires at an early-morning
 * UTC hour and the events run in Central European time, so the UTC calendar date
 * equals the local calendar date at run time and DAY-OF granularity tolerates
 * the offset.
 */

/** The calendar date (YYYY-MM-DD) of `now`, in UTC. */
export function toDateString(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/** UTC-midnight epoch millis for a YYYY-MM-DD date string. */
function dateOnlyMs(dateStr: string): number {
  return Date.parse(`${dateStr}T00:00:00Z`)
}

/**
 * Whole days from `fromDate` to `toDate` (both YYYY-MM-DD): positive when
 * `toDate` is in the future relative to `fromDate`. Returns `NaN` if either
 * input is not a parseable date.
 */
export function daysUntil(fromDate: string, toDate: string): number {
  const from = dateOnlyMs(fromDate)
  const to = dateOnlyMs(toDate)
  if (Number.isNaN(from) || Number.isNaN(to)) return NaN
  return Math.round((to - from) / 86_400_000)
}

/** Whole days elapsed between an ISO timestamp `sinceIso` and `now`. */
export function daysSince(sinceIso: string, now: Date): number {
  const since = Date.parse(sinceIso)
  if (Number.isNaN(since)) return Infinity
  return (now.getTime() - since) / 86_400_000
}
