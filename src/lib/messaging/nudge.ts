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
 * CONTRACT: NEVER throws. Like the notification/messaging retention jobs this is
 * cron-invoked, but it wraps its whole run so a read failure only zeroes the
 * summary; each conversation is additionally isolated so one bad thread cannot
 * stop the rest. Returns aggregate counts for structured cron logging.
 */

/** Days without an organizer reply before an open thread is nudged. */
export const STALE_AFTER_DAYS = 3

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
    const cutoff = staleConversationCutoff()

    // Selection: open (or absent status) AND no activity since the cutoff AND
    // NOT globally archived (archivedAt >= lastMessageAt) AND not already nudged
    // for this trailing message (lastStaleNudgeAt < lastMessageAt) AND a last
    // message exists whose author is NOT an organizer. HAS_ANY_MESSAGE (not
    // `defined(LAST_AUTHOR_REF)`) gates existence so a SPONSOR-authored last
    // message — which has no author ref — still qualifies, keeping the nudge
    // consistent with the inbox needs-reply tab/badge. (M3)
    const conversations =
      (await clientReadUncached.fetch<StaleConversation[]>(
        `*[_type == "conversation"
          && coalesce(status, 'open') == 'open'
          && lastMessageAt < $cutoff
          && (!defined(archivedAt) || archivedAt < lastMessageAt)
          && (!defined(lastStaleNudgeAt) || lastStaleNudgeAt < lastMessageAt)
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
        { cutoff, organizerIds: selectionOrganizerIds },
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
        // The per-org organizer read happens only on the unassigned branch
        // (assigned threads never need it) and is cached per-org by
        // getOrganizerSpeakerIds, so same-org conversations share one read.
        const recipientIds = conversation.assignedToId
          ? [conversation.assignedToId]
          : await resolveRoutedOrganizerIds({
              conferenceId: conversation.conferenceId,
              teamKey:
                conversation.conversationType === 'sponsor'
                  ? 'sponsors'
                  : 'cfp',
              allOrganizerIds: await getOrganizerSpeakerIdsForOrg(orgId),
            })
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
          title: `Awaiting reply: ${subject}`.slice(0, 200),
          message: `No organizer reply in over ${STALE_AFTER_DAYS} days.`,
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
