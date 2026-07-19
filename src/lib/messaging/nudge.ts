import 'server-only'
import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import {
  createNotifications,
  getOrganizerSpeakerIds,
} from '@/lib/notification/sanity'
import { resolveRoutedOrganizerIds } from '@/lib/teams'
import type { NotificationInput } from '@/lib/notification/types'
import { conversationLinkPath } from './links'
// Single home for the last-author projection (R1): sharing the exact string with
// the inbox `needs-reply` filter guarantees the nudge selection and the inbox can
// never disagree on which thread's ball is in the organizers' court.
import { LAST_AUTHOR_REF } from './sanity'

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
    const organizerIds = await getOrganizerSpeakerIds()
    const cutoff = staleConversationCutoff()

    // Selection: open (or absent status) AND no activity since the cutoff AND
    // NOT globally archived (archivedAt >= lastMessageAt) AND not already nudged
    // for this trailing message (lastStaleNudgeAt < lastMessageAt) AND a last
    // message exists whose author is NOT an organizer.
    const conversations =
      (await clientReadUncached.fetch<StaleConversation[]>(
        `*[_type == "conversation"
          && coalesce(status, 'open') == 'open'
          && lastMessageAt < $cutoff
          && (!defined(archivedAt) || archivedAt < lastMessageAt)
          && (!defined(lastStaleNudgeAt) || lastStaleNudgeAt < lastMessageAt)
          && defined(${LAST_AUTHOR_REF})
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
        { cutoff, organizerIds },
        { cache: 'no-store' },
      )) ?? []

    summary.scanned = conversations.length

    for (const conversation of conversations) {
      try {
        // A thread with no resolvable conference can't be notified about (the
        // notification requires a conference ref); skip without stamping.
        if (!conversation.conferenceId) continue

        // Route down the TEAMS-2 chain: the assignee when set → else the
        // thread's team (`sponsors` for a sponsor thread, `cfp` otherwise) →
        // else every organizer (the team-else-all fallback). If nobody can be
        // notified (no assignee AND no team AND no organizers), skip without
        // stamping so the thread is retried once organizers exist.
        const recipientIds = conversation.assignedToId
          ? [conversation.assignedToId]
          : await resolveRoutedOrganizerIds({
              conferenceId: conversation.conferenceId,
              teamKey:
                conversation.conversationType === 'sponsor'
                  ? 'sponsors'
                  : 'cfp',
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
