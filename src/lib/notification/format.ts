/**
 * Compact relative-time formatting for the notification hub UI.
 *
 * NOTE: this is deliberately the *compact* form ("5m ago") suited to the narrow
 * notification panel. `src/lib/time.ts` has a separate, verbose
 * `formatRelativeTime` ("5 minutes ago") used elsewhere; the two are kept
 * distinct because the panel's column width can't afford the long form.
 */

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

/**
 * Formats an ISO datetime as a compact relative time relative to now:
 * "just now", "5m ago", "3h ago", "2d ago", "4w ago". Future or invalid
 * timestamps collapse to "just now".
 */
export function formatRelativeTime(
  iso: string,
  now: Date = new Date(),
): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''

  const diffSeconds = Math.floor((now.getTime() - then) / 1000)

  if (diffSeconds < MINUTE) return 'just now'
  if (diffSeconds < HOUR) return `${Math.floor(diffSeconds / MINUTE)}m ago`
  if (diffSeconds < DAY) return `${Math.floor(diffSeconds / HOUR)}h ago`
  if (diffSeconds < WEEK) return `${Math.floor(diffSeconds / DAY)}d ago`
  return `${Math.floor(diffSeconds / WEEK)}w ago`
}
