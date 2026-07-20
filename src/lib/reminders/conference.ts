import { clientReadUncached } from '@/lib/sanity/client'
import { toDateString } from './dates'
import type { ReminderConference } from './types'

/**
 * Resolve the single ACTIVE conference the reminder cron targets.
 *
 * SELECTION: among every conference that has NOT yet ended (`endDate >= today`),
 * pick the one with the EARLIEST `startDate`. This yields:
 *   - a currently-ongoing edition (its start is in the past but end is today or
 *     later, and its start precedes any future edition's), or
 *   - otherwise the nearest upcoming edition.
 * A fully-past conference (`endDate < today`) is never selected — its speakers
 * need no prep reminders. When several unrelated editions overlap (multi-tenant
 * domains), the earliest-starting not-yet-ended one wins; Phase 1 deliberately
 * targets ONE active conference per run.
 *
 * Dates are Sanity `date` values (YYYY-MM-DD) compared lexicographically, which
 * is order-preserving for that format.
 */
export async function resolveActiveReminderConference(
  now: Date = new Date(),
): Promise<ReminderConference | null> {
  const today = toDateString(now)
  const conference = await clientReadUncached.fetch<ReminderConference | null>(
    `*[_type == "conference" && defined(startDate) && defined(endDate) && endDate >= $today]
      | order(startDate asc)[0]{
        _id,
        title,
        startDate,
        endDate,
        programDate,
        travelSupportPaymentDate
      }`,
    { today },
    { cache: 'no-store' },
  )
  return conference ?? null
}
