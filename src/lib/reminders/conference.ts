import { clientReadUncached } from '@/lib/sanity/client'
import { toDateString } from './dates'
import type { ReminderConference } from './types'
import { mergeConferences } from '@/lib/conference/merge'

/**
 * A hard cap on how many conferences one reminder run processes, so tenant growth
 * (or a clock/skew bug that makes every edition look active) can never fan the
 * daily cron out over an unbounded number of conferences — each of which costs
 * several Sanity reads and up to `MAX_SENDS_PER_RUN` emits. Ordered by
 * `startDate` ascending, so the cap drops the conferences FURTHEST in the future
 * — the ones whose reminders are least urgent — and the next daily run picks
 * them up as they approach. Mirrors `MAX_CONVERSATIONS_PER_RUN` in
 * `src/lib/messaging/nudge.ts` and `MAX_CONFERENCES_PER_RUN` in
 * `src/lib/messaging/retention.ts`.
 */
const MAX_CONFERENCES_PER_RUN = 50

/**
 * Resolve EVERY active conference the reminder cron targets, up to
 * {@link MAX_CONFERENCES_PER_RUN}.
 *
 * SELECTION: every conference that has NOT yet ended (`endDate >= today`),
 * ordered by `startDate` ascending. Each yields either a currently-ongoing
 * edition (start in the past, end today-or-later) or an upcoming one. A
 * fully-past conference (`endDate < today`) is never selected — its speakers
 * need no prep reminders.
 *
 * The deployment serves MULTIPLE conferences (domain-based resolution), so the
 * cron must iterate ALL of them: a single-conference resolver would starve every
 * edition but one whenever unrelated editions overlap. Dedup markers are scoped
 * per conference (`reminder.<key>.<conferenceId>.<speakerId>`), so iterating the
 * full set never double-sends across editions.
 *
 * Dates are Sanity `date` values (YYYY-MM-DD) compared lexicographically, which
 * is order-preserving for that format.
 */
export async function resolveActiveReminderConferences(
  now: Date = new Date(),
): Promise<ReminderConference[]> {
  const today = toDateString(now)
  const conferences = await clientReadUncached.fetch<
    (ReminderConference & {
      domains?: string[]
      organization?: { _ref: string }
    })[]
  >(
    // groq-global: cron sweep over every tenant's active conferences; dedup
    // markers are per conference.
    `*[_type == "conference"]{
        _id,
        title,
        startDate,
        endDate,
        programDate,
        travelSupportPaymentDate,
        domains,
        organization
      }`,
    {},
    { cache: 'no-store' },
  )
  if (!conferences || conferences.length === 0) return []

  const merged = await mergeConferences(conferences)
  return merged
    .filter((c) => Boolean(c.startDate && c.endDate && c.endDate >= today))
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))
    .slice(0, MAX_CONFERENCES_PER_RUN)
    .map((c) => ({
      _id: c._id,
      title: c.title,
      startDate: c.startDate as string,
      endDate: c.endDate as string,
      programDate: c.programDate,
      travelSupportPaymentDate: c.travelSupportPaymentDate,
    }))
}
