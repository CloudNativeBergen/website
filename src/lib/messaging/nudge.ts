import 'server-only'
import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import {
  createNotifications,
  getAllOrganizerSpeakerIdsAcrossOrgs,
  getOrganizerSpeakerIdsForOrg,
} from '@/lib/notification/sanity'
import { resolveRoutedOrganizerIds } from '@/lib/teams'
import type { NotificationInput } from '@/lib/notification/types'
import { conversationLinkPath } from './links'
// Single home for the last-author projection (R1): sharing the exact string with
// the inbox `needs-reply` filter guarantees the nudge selection and the inbox can
// never disagree on which thread's ball is in the organizers' court.
import { LAST_AUTHOR_REF, HAS_ANY_MESSAGE } from './sanity'

/**
 * Server-only stale-thread nudge for speaker↔organizer messaging (ticketing).
 *
 * POLICY: a conversation that is still OPEN, whose LAST message is from a
 * non-organizer (so the ball is in the organizers' court), and which has seen no
 * new activity for {@link STALE_AFTER_DAYS} days gets ONE hub notification. It is
 * routed down the TEAMS-2 chain (each step falling through to the next): the
 * assigned organizer when set → else the thread's team (`sponsors` for a sponsor
 * thread, `cfp` otherwise) → else every organizer (the team-else-all fallback of
 * {@link resolveRoutedOrganizerIds}). A deep link to the admin thread rides
 * along. The conversation's `lastStaleNudgeAt` is then
 * stamped so it is not nudged again until a NEWER message arrives
 * (`lastStaleNudgeAt < lastMessageAt` re-arms it); a globally-archived thread is
 * never nudged.
 *
 * ESCALATION (B1b): assignment must not be a way to make a thread everyone
 * else's blind spot. Routing to the assignee ALONE narrows the alarm to one
 * person for as long as the thread stays quiet, so an owner who is ill, on leave
 * or simply stuck silently absorbs the whole signal. An ASSIGNED thread that is
 * still unanswered {@link ESCALATE_AFTER_DAYS} days after the first nudge is
 * therefore nudged a SECOND (and final) time, to the assignee PLUS the routed
 * team/all-organizers set — escalation only ever WIDENS the audience, it never
 * moves the alarm off the owner. Unassigned threads are unchanged: one nudge,
 * team fan-out. See {@link shouldEscalate} for how "already nudged once, not yet
 * escalated" is expressed with no extra field.
 *
 * CONTRACT: NEVER throws. Like the notification/messaging retention jobs this is
 * cron-invoked, but it wraps its whole run so a read failure only zeroes the
 * summary; each conversation is additionally isolated so one bad thread cannot
 * stop the rest. Returns aggregate counts for structured cron logging.
 */

/** Days without an organizer reply before an open thread is nudged. */
export const STALE_AFTER_DAYS = 3

/**
 * Days after the FIRST nudge before an assigned-but-still-unanswered thread is
 * escalated to the routed team / all organizers. Deliberately the SAME length as
 * {@link STALE_AFTER_DAYS}: the owner gets exactly the window the whole team got
 * before the alarm was narrowed to them, and the two windows together (6 days)
 * stay under the 7-day AUTO_CLOSE_AFTER_DAYS horizon — so the longest a thread
 * can sit in the organizers' court unheard-of by anyone but its owner is shorter
 * than the longest we make a SPEAKER wait before we close their thread.
 */
export const ESCALATE_AFTER_DAYS = 3

/**
 * A hard cap on conversations nudged per run, so a backlog (or a clock/skew bug)
 * can never fan out an unbounded number of notifications in one invocation. Any
 * remainder is picked up by the next daily run. Mirrors the messaging retention
 * job's `MAX_CONFERENCES_PER_RUN` safety valve.
 */
const MAX_CONVERSATIONS_PER_RUN = 200

/** Aggregate counts for one nudge run. */
export interface StaleNudgeSummary {
  /** Stale conversations selected by the query (before per-thread work). */
  scanned: number
  /** Conversations for which a notification was emitted AND stamped. */
  nudged: number
  /** Total hub notifications created (assignee → 1; unassigned → team-or-N organizers). */
  notifications: number
  /**
   * Of {@link nudged}, how many were ESCALATED nudges (assigned thread, still
   * unanswered a further {@link ESCALATE_AFTER_DAYS} days, fanned out to the
   * assignee PLUS the routed team/all set) rather than first nudges.
   */
  escalated: number
  /** Conversations whose nudge failed and were isolated (logged, skipped). */
  failed: number
}

/**
 * The cutoff a conversation's `lastMessageAt` must PRECEDE to be considered
 * stale: exactly {@link STALE_AFTER_DAYS} days before `now`. `lastMessageAt` is
 * a full ISO datetime, so the GROQ comparison is against this same shape.
 */
export function staleConversationCutoff(now: Date = new Date()): string {
  return new Date(
    now.getTime() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()
}

/**
 * The cutoff a conversation's `lastMessageAt` must PRECEDE for an ASSIGNED
 * thread's nudge to escalate: {@link STALE_AFTER_DAYS} + {@link
 * ESCALATE_AFTER_DAYS} days before `now` — i.e. the first nudge's window has
 * elapsed AND the escalation window on top of it has too.
 */
export function escalationConversationCutoff(now: Date = new Date()): string {
  return new Date(
    now.getTime() -
      (STALE_AFTER_DAYS + ESCALATE_AFTER_DAYS) * 24 * 60 * 60 * 1000,
  ).toISOString()
}

/** Seconds in the combined stale+escalation window, for the selection GROQ. */
const ESCALATION_WINDOW_SECONDS =
  (STALE_AFTER_DAYS + ESCALATE_AFTER_DAYS) * 24 * 60 * 60

/**
 * Does this row's nudge escalate? An assigned thread escalates once its quiet
 * period passes the combined window; an unassigned thread never does (its first
 * nudge already reaches the team, so there is nothing to widen to).
 *
 * IDEMPOTENCE WITHOUT AN EXTRA FIELD: the escalated nudge stamps
 * `lastStaleNudgeAt = now`, and `now` is by construction at or past
 * `lastMessageAt + 6 days`. The selection GROQ only re-offers an already-nudged
 * thread while its stamp is still BEFORE `lastMessageAt + 6 days`, so a thread
 * escalates at most once per trailing message — and a NEWER message re-arms the
 * whole ladder via the existing `lastStaleNudgeAt < lastMessageAt` clause.
 */
function shouldEscalate(
  conversation: StaleConversation,
  escalationCutoff: string,
): boolean {
  return (
    Boolean(conversation.assignedToId) &&
    conversation.lastMessageAt < escalationCutoff
  )
}

/** A stale conversation row, projected with what a nudge needs. */
interface StaleConversation {
  _id: string
  conversationType: 'proposal' | 'general' | 'sponsor'
  subject: string | null
  conferenceId: string | null
  proposalId?: string | null
  assignedToId?: string | null
  lastMessageAt: string
}

/**
 * Emit stale-thread nudges. See the module CONTRACT — this never throws.
 */
export async function nudgeStaleConversations(): Promise<StaleNudgeSummary> {
  const summary: StaleNudgeSummary = {
    scanned: 0,
    nudged: 0,
    notifications: 0,
    escalated: 0,
    failed: 0,
  }

  try {
    // GLOBAL organizer set — used ONLY as the candidacy filter below (to exclude
    // threads whose LAST message is from an organizer). It is a conservative
    // superset for "was the last author an organizer" and is NEVER used as a
    // recipient list. Recipients are resolved PER-ORG inside the loop (B4): the
    // prior code reused this global set as the team-else-all fallback, which
    // push-notified every tenant's organizers about one tenant's threads.
    const selectionOrganizerIds = await getAllOrganizerSpeakerIdsAcrossOrgs()
    const now = new Date()
    const cutoff = staleConversationCutoff(now)
    const escalationCutoff = escalationConversationCutoff(now)

    // Selection: open (or absent status) AND no activity since the cutoff AND
    // NOT globally archived (archivedAt >= lastMessageAt) AND a last message
    // exists whose author is NOT an organizer AND the thread is due a nudge —
    // either it has never been nudged for this trailing message
    // (lastStaleNudgeAt < lastMessageAt), OR it is an ASSIGNED thread whose
    // first nudge has now gone unanswered past the escalation window (B1b).
    // HAS_ANY_MESSAGE (not `defined(LAST_AUTHOR_REF)`) gates existence so a
    // SPONSOR-authored last message — which has no author ref — still qualifies,
    // keeping the nudge consistent with the inbox needs-reply tab/badge. (M3)
    //
    // The escalation clause wraps BOTH sides in `dateTime()`: a Sanity datetime
    // field is a STRING in GROQ, and comparing a string against a datetime
    // (which is what `lastMessageAt + $seconds` yields) evaluates to null, not
    // false — the clause would silently never match. It is also what STOPS an
    // escalated thread being re-selected forever: the escalated nudge stamps
    // `now`, which is already past `lastMessageAt + 6 days`, so the row drops
    // out of the query rather than occupying a slot of the per-run cap.
    const conversations =
      (await clientReadUncached.fetch<StaleConversation[]>(
        `*[_type == "conversation"
          && coalesce(status, 'open') == 'open'
          && lastMessageAt < $cutoff
          && (!defined(archivedAt) || archivedAt < lastMessageAt)
          && (
            (!defined(lastStaleNudgeAt) || lastStaleNudgeAt < lastMessageAt)
            || (
              defined(assignedTo)
              && lastMessageAt < $escalationCutoff
              && dateTime(lastStaleNudgeAt) < dateTime(lastMessageAt) + $escalationWindowSeconds
            )
          )
          && ${HAS_ANY_MESSAGE}
          && !(${LAST_AUTHOR_REF} in $organizerIds)
        ] | order(lastMessageAt asc) [0...${MAX_CONVERSATIONS_PER_RUN}] {
          "_id": _id,
          conversationType,
          subject,
          "conferenceId": conference._ref,
          "proposalId": proposal._ref,
          "assignedToId": assignedTo._ref,
          lastMessageAt
        }`,
        {
          cutoff,
          escalationCutoff,
          escalationWindowSeconds: ESCALATION_WINDOW_SECONDS,
          organizerIds: selectionOrganizerIds,
        },
        { cache: 'no-store' },
      )) ?? []

    summary.scanned = conversations.length

    // Batch-resolve each distinct conference → owning organization once, so the
    // per-conversation recipient scoping below never re-reads the same
    // conference. A conference whose organization is unresolvable (pre-backfill
    // or missing) maps to `null` and its conversations are SKIPPED — never
    // broadcast to the global organizer set (B4).
    const conferenceIds = [
      ...new Set(
        conversations
          .map((c) => c.conferenceId)
          .filter((id): id is string => Boolean(id)),
      ),
    ]
    const orgByConference = new Map<string, string | null>()
    if (conferenceIds.length > 0) {
      const rows =
        (await clientReadUncached.fetch<
          { _id: string; orgId: string | null }[]
        >(
          `*[_type == "conference" && _id in $conferenceIds]{
            "_id": _id,
            "orgId": organization._ref
          }`,
          { conferenceIds },
          { cache: 'no-store' },
        )) ?? []
      for (const row of rows) {
        orgByConference.set(row._id, row.orgId ?? null)
      }
    }

    for (const conversation of conversations) {
      try {
        // A thread with no resolvable conference can't be notified about (the
        // notification requires a conference ref); skip without stamping.
        if (!conversation.conferenceId) continue

        // Resolve THIS conversation's tenant (its conference's organization).
        // NO global fallback: if the org is unresolvable we must not broadcast
        // to other tenants' organizers, so skip (without stamping) and warn —
        // the thread is retried once the conference is backfilled. (B4)
        const orgId = orgByConference.get(conversation.conferenceId) ?? null
        if (!orgId) {
          console.warn(
            `Stale nudge: conversation ${conversation._id} has no resolvable organization; skipping (never broadcasting to the global organizer set)`,
          )
          continue
        }

        // Route down the TEAMS-2 chain: the assignee when set → else the
        // thread's team (`sponsors` for a sponsor thread, `cfp` otherwise) →
        // else every organizer OF THIS ORG (the team-else-all fallback). If
        // nobody can be notified (no assignee AND no team AND no organizers),
        // skip without stamping so the thread is retried once organizers exist.
        // The per-org organizer read happens only when the routed set is
        // actually needed (a FIRST nudge on an assigned thread never needs it)
        // and is cached per-org by getOrganizerSpeakerIds, so same-org
        // conversations share one read.
        //
        // ESCALATION (B1b) short-circuits the FIRST step of that chain — and
        // only that step: an assigned thread still unanswered after the further
        // escalation window fans out to the routed set UNION the assignee, so
        // the owner keeps the alarm and the team gains it. Escalation can never
        // produce an empty recipient set (the assignee is always in it), so the
        // skip below only ever guards the genuinely unassigned case.
        const escalate = shouldEscalate(conversation, escalationCutoff)
        const routedIds =
          conversation.assignedToId && !escalate
            ? []
            : await resolveRoutedOrganizerIds({
                conferenceId: conversation.conferenceId,
                teamKey:
                  conversation.conversationType === 'sponsor'
                    ? 'sponsors'
                    : 'cfp',
                allOrganizerIds: await getOrganizerSpeakerIdsForOrg(orgId),
              })
        const recipientIds = conversation.assignedToId
          ? [...new Set([conversation.assignedToId, ...routedIds])]
          : routedIds
        if (recipientIds.length === 0) continue

        const link = conversationLinkPath(
          {
            _id: conversation._id,
            conversationType: conversation.conversationType,
            proposalId: conversation.proposalId ?? undefined,
          },
          true,
        )
        const subject = conversation.subject ?? 'Conversation'
        const inputs: NotificationInput[] = recipientIds.map((recipientId) => ({
          recipientId,
          conferenceId: conversation.conferenceId as string,
          notificationType: 'message_stale',
          title: (escalate
            ? `Still awaiting reply: ${subject}`
            : `Awaiting reply: ${subject}`
          ).slice(0, 200),
          message: escalate
            ? `No organizer reply in over ${STALE_AFTER_DAYS + ESCALATE_AFTER_DAYS} days — escalated to the team.`
            : `No organizer reply in over ${STALE_AFTER_DAYS} days.`,
          link,
          ...(conversation.proposalId
            ? { relatedProposalId: conversation.proposalId }
            : {}),
        }))

        // createNotifications never throws; the stamp write can, so it is inside
        // the per-conversation try/catch and runs only after the notifications.
        await createNotifications(inputs)
        await clientWrite
          .patch(conversation._id)
          .set({ lastStaleNudgeAt: new Date().toISOString() })
          .commit()

        summary.nudged += 1
        summary.notifications += inputs.length
        if (escalate) summary.escalated += 1
      } catch (error) {
        summary.failed += 1
        console.error(
          `Stale nudge: failed for conversation ${conversation._id}:`,
          error,
        )
      }
    }
  } catch (error) {
    // Never-fail envelope: a read failure zeroes the run rather than throwing
    // into the cron (whose other steps must still complete).
    console.error('Stale nudge: run failed:', error)
  }

  return summary
}
