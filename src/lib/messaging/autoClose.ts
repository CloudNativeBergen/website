import 'server-only'
import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import { getAllOrganizerSpeakerIdsAcrossOrgs } from '@/lib/notification/sanity'
// Same single home for the last-author projection as the inbox needs-reply
// filter and the stale nudge (R1). Auto-close is the EXACT complement of the
// nudge, so it must read "whose court is the ball in" from the identical string
// — otherwise a thread could be both nudged and closed by the same run.
import { LAST_AUTHOR_REF, HAS_ANY_MESSAGE } from './sanity'
import type { ConversationStatus } from './types'

/**
 * The status an auto-closed thread lands in. Typed as {@link ConversationStatus}
 * so this stays wired to the union ('open' | 'resolved') rather than being a
 * loose string the schema could drift away from.
 */
const AUTO_CLOSE_STATUS: ConversationStatus = 'resolved'

/**
 * Server-only auto-close for speaker↔organizer messaging (ticketing).
 *
 * POLICY: the complement of the stale nudge. The nudge fires when the LAST
 * message is from a NON-organizer — the ball is in OUR court and we owe them a
 * reply. This job fires on the other half of the board: the last message IS from
 * an organizer, so the ball is in the NON-organizer's court, and they have not
 * come back for {@link AUTO_CLOSE_AFTER_DAYS} days. Answered questions do not
 * get an "ok, thanks" from every speaker, so without this every answered thread
 * stays `open` forever and the organizer inbox slowly fills with work that is
 * already done.
 *
 * The two selections are mutually exclusive by construction (`LAST_AUTHOR_REF in
 * $organizerIds` here, `!(... in $organizerIds)` there), so one run can never
 * both nudge and close the same thread.
 *
 * SAFETY — closing is CHEAP TO UNDO, which is what makes an automated close
 * acceptable at all: a non-organizer replying to a resolved thread REOPENS it
 * atomically with their message (`message.send`'s reopen-on-reply, S3). A thread
 * closed too early therefore heals itself the moment the speaker actually comes
 * back; nothing is deleted, hidden from the speaker, or made unreachable. The
 * only state written is `status: 'resolved'` — the same value an organizer's
 * Resolve button writes.
 *
 * IDEMPOTENT: the selection requires `status == 'open'`, and the only write sets
 * it to `'resolved'`, so a closed thread is never selected again (and re-running
 * the job is a no-op). No new field, and no schema change.
 *
 * CONTRACT: NEVER throws. Like the nudge this is cron-invoked, so it wraps the
 * whole run (a read failure only zeroes the summary) and additionally isolates
 * each conversation, so one bad thread cannot stop the rest.
 *
 * DELIBERATE NON-FILTER: unlike the nudge, this does NOT exclude globally
 * archived threads. Archive is an organizer-side hide, not a lifecycle state —
 * an archived-but-open thread is exactly the kind that should not stay open
 * forever, and closing one changes nothing a speaker can see (they never see the
 * global archive) while still auto-reopening on their reply.
 */

/**
 * Days with no reply from the NON-organizer side, on a thread whose last word
 * was ours, before the thread is auto-resolved. Longer than the nudge's
 * `STALE_AFTER_DAYS` (3) and its escalation (6) on purpose: we hold ourselves to
 * a tighter clock than the people we are serving, and a week is the shortest
 * horizon that survives someone simply being away from their inbox.
 */
export const AUTO_CLOSE_AFTER_DAYS = 7

/**
 * A hard cap on conversations closed per run, so a backlog (or a clock/skew bug)
 * can never fan out an unbounded number of writes in one invocation. Any
 * remainder is picked up by the next daily run. Mirrors the nudge's
 * `MAX_CONVERSATIONS_PER_RUN`.
 */
const MAX_CONVERSATIONS_PER_RUN = 200

/** Aggregate counts for one auto-close run. */
export interface AutoCloseSummary {
  /** Conversations selected by the query (before per-thread work). */
  scanned: number
  /** Conversations actually patched to `resolved`. */
  closed: number
  /** Conversations whose close failed and were isolated (logged, skipped). */
  failed: number
}

/**
 * The cutoff a conversation's `lastMessageAt` must PRECEDE to be auto-closed:
 * exactly {@link AUTO_CLOSE_AFTER_DAYS} days before `now`. `lastMessageAt` is a
 * full ISO datetime, so the GROQ comparison is against this same shape.
 */
export function autoCloseConversationCutoff(now: Date = new Date()): string {
  return new Date(
    now.getTime() - AUTO_CLOSE_AFTER_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()
}

/**
 * Auto-close threads that have been waiting on a non-organizer. See the module
 * CONTRACT — this never throws.
 */
export async function autoCloseStaleConversations(): Promise<AutoCloseSummary> {
  const summary: AutoCloseSummary = { scanned: 0, closed: 0, failed: 0 }

  try {
    // The cross-org organizer superset is a CANDIDACY filter only — it decides
    // "was the last author one of us", never who is written to or notified (this
    // job notifies nobody), so no tenant can leak into another through it. Same
    // read, and the same reasoning, as the nudge's selection filter.
    const organizerIds = await getAllOrganizerSpeakerIdsAcrossOrgs()
    // With an empty organizer set the positive `in []` test is false for every
    // row, so the run selects NOTHING. That is the safe direction and needs no
    // explicit guard (unlike the nudge's NEGATED test, where an empty set would
    // match every thread vacuously): a conference with no organizers cannot have
    // an organizer-authored last message, so there is nothing to close.
    const cutoff = autoCloseConversationCutoff()

    const conversations =
      (await clientReadUncached.fetch<{ _id: string }[]>(
        // groq-global: a CRON sweep over every tenant's threads, like the stale
        // nudge it mirrors — there is no request tenant to scope to. Nothing
        // cross-tenant escapes: the only write is this thread's own `status`,
        // and the job notifies nobody, so no tenant can observe another's rows.
        `*[_type == "conversation"
          && coalesce(status, 'open') == 'open'
          && lastMessageAt < $cutoff
          && ${HAS_ANY_MESSAGE}
          && ${LAST_AUTHOR_REF} in $organizerIds
        ] | order(lastMessageAt asc) [0...${MAX_CONVERSATIONS_PER_RUN}] {
          "_id": _id
        }`,
        { cutoff, organizerIds },
        { cache: 'no-store' },
      )) ?? []

    summary.scanned = conversations.length

    for (const conversation of conversations) {
      try {
        await clientWrite
          .patch(conversation._id)
          .set({ status: AUTO_CLOSE_STATUS })
          .commit()
        summary.closed += 1
      } catch (error) {
        summary.failed += 1
        console.error(
          `Auto-close: failed for conversation ${conversation._id}:`,
          error,
        )
      }
    }
  } catch (error) {
    // Never-fail envelope: a read failure zeroes the run rather than throwing
    // into the cron (whose other steps must still complete).
    console.error('Auto-close: run failed:', error)
  }

  return summary
}
