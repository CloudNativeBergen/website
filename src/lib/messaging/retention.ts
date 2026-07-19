import 'server-only'
import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import { conversationLinkPath } from './links'

/**
 * Server-only retention job for speaker↔organizer messaging data.
 *
 * POLICY (maintainer decision): a conference's messaging data — every message,
 * conversation, per-conversation preference and its collapsed `message_received`
 * notifications — is permanently deleted {@link RETENTION_MONTHS} months after
 * the conference ENDS. Messages/conversations are otherwise immortal (they carry
 * no per-document retention), so this horizon is the ONLY thing that ever purges
 * a wound-down edition's threads. The 90-day hub retention
 * (`deleteNotificationsOlderThan`) is orthogonal and deliberately EXCLUDES unread
 * message notifications; this job removes those message notifications outright
 * once their whole conference ages out.
 *
 * The privacy page documents this window (proposal + general threads are
 * "retained for 24 months after the conference ends").
 *
 * CONTRACT: like the notification retention path this MAY throw at the top level
 * (a bad conference-list read fails the run so the cron surfaces it), but a
 * single conference's deletion failure is ISOLATED — it is logged and the run
 * continues with the next conference (one edition's broken thread never blocks
 * every other edition's cleanup).
 */

/** Months after a conference's end date before its messaging data is purged. */
export const RETENTION_MONTHS = 24

/**
 * Deletes per transaction — keeps each commit well under Sanity's
 * mutation-per-transaction ceiling. Mirrors the proposal cascade
 * (`PROPOSAL_DELETE_CHUNK_SIZE`) so both deletion paths behave identically.
 */
const DELETE_CHUNK_SIZE = 100

/**
 * A hard cap on how many expired conferences one run processes, so a clock/skew
 * bug (or a sudden backlog of just-aged editions) can never fan out an unbounded
 * number of per-conference deletions in a single invocation. Any remainder is
 * picked up by the next daily run. This is the messaging analogue of the
 * notification job's `RETENTION_MAX_BATCHES` safety valve.
 */
const MAX_CONFERENCES_PER_RUN = 50

/** A per-conference summary row for structured logging. */
export interface MessagingRetentionSummary {
  conferences: number
  messages: number
  conversations: number
  preferences: number
  notifications: number
}

/** Split `items` into consecutive chunks of at most `size`. */
function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/** Delete a set of document ids in chunked transactions. No-op for an empty set. */
async function commitDeletesChunked(ids: string[]): Promise<void> {
  for (const chunk of chunkArray(ids, DELETE_CHUNK_SIZE)) {
    if (chunk.length === 0) continue
    const tx = clientWrite.transaction()
    for (const id of chunk) {
      tx.delete(id)
    }
    await tx.commit()
  }
}

/**
 * The cutoff date (YYYY-MM-DD) a conference's `endDate` must precede to be
 * eligible for purge: exactly {@link RETENTION_MONTHS} months before `now`.
 *
 * `conference.endDate` is a Sanity `date` (a bare `YYYY-MM-DD`), so the GROQ
 * comparison is a lexicographic string compare against this same shape — which
 * is correct for zero-padded ISO dates. Computed in UTC for determinism.
 */
export function messagingRetentionCutoff(now: Date = new Date()): string {
  const cutoff = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
  cutoff.setUTCMonth(cutoff.getUTCMonth() - RETENTION_MONTHS)
  return cutoff.toISOString().slice(0, 10)
}

/** A conversation shape sufficient to derive its notification deep links. */
interface RetentionConversation {
  _id: string
  conversationType: 'proposal' | 'general'
  // GROQ yields `null` for an absent `proposal._ref`; `conversationLinkPath`
  // treats a falsy `proposalId` as "no proposal", so null and undefined are
  // equivalent here. Typed to match `conversationLinkPath`'s parameter.
  proposalId?: string
}

/**
 * Purge all messaging data for every conference whose `endDate` is more than
 * {@link RETENTION_MONTHS} months in the past.
 *
 * For each eligible conference (processed independently — see the module
 * CONTRACT) the deletion runs in this ORDER so no delete is ever blocked by an
 * inbound STRONG reference:
 *   1. messages            (strong ref → conversation)
 *   2. conversationPreferences (strong ref → conversation)
 *   3. conversations       (now free of strong referrers)
 *   4. message_received notifications (link-matched; no stored ref)
 *
 * NOTE on step 2: `conversationPreference.conversation` is a STRONG reference
 * (see its schema), so preferences MUST precede their conversations — the same
 * reason messages precede conversations. (The task's headline "messages →
 * conversations → preferences" ordering would 409 on the conversation delete;
 * preferences are hoisted ahead of conversations here for correctness.)
 *
 * Preferences and notifications are matched via the conversation refs / deep
 * links rather than by reconstructing their deterministic ids, which is robust
 * to either audience variant and to any legacy id shape.
 *
 * Returns aggregate counts across all conferences processed this run.
 */
export async function deleteExpiredMessagingData(): Promise<MessagingRetentionSummary> {
  const cutoff = messagingRetentionCutoff()

  const conferences =
    (await clientReadUncached.fetch<{ _id: string; title: string | null }[]>(
      `*[_type == "conference" && defined(endDate) && endDate < $cutoff][0...${MAX_CONFERENCES_PER_RUN}]{ _id, title }`,
      { cutoff },
      { cache: 'no-store' },
    )) ?? []

  const summary: MessagingRetentionSummary = {
    conferences: 0,
    messages: 0,
    conversations: 0,
    preferences: 0,
    notifications: 0,
  }

  for (const conference of conferences) {
    try {
      const perConference = await deleteMessagingDataForConference(
        conference._id,
      )

      summary.conferences += 1
      summary.messages += perConference.messages
      summary.conversations += perConference.conversations
      summary.preferences += perConference.preferences
      summary.notifications += perConference.notifications

      // Structured per-conference log (counts) so a run is auditable.
      console.log(
        `Messaging retention: purged conference ${conference._id}` +
          ` (${conference.title ?? 'untitled'}) —` +
          ` messages=${perConference.messages}` +
          ` conversations=${perConference.conversations}` +
          ` preferences=${perConference.preferences}` +
          ` notifications=${perConference.notifications}`,
      )
    } catch (error) {
      // Per-conference isolation: log and continue so one edition's failure
      // cannot stop the others from being purged.
      console.error(
        `Messaging retention: failed to purge conference ${conference._id}:`,
        error,
      )
    }
  }

  return summary
}

/**
 * Delete all messaging data for ONE conference and return its counts. Extracted
 * so {@link deleteExpiredMessagingData} can wrap each conference in its own
 * try/catch for isolation.
 */
async function deleteMessagingDataForConference(
  conferenceId: string,
): Promise<Omit<MessagingRetentionSummary, 'conferences'>> {
  const conversations =
    (await clientReadUncached.fetch<RetentionConversation[]>(
      `*[_type == "conversation" && conference._ref == $conferenceId]{
        _id,
        conversationType,
        "proposalId": proposal._ref
      }`,
      { conferenceId },
      { cache: 'no-store' },
    )) ?? []

  if (conversations.length === 0) {
    return { messages: 0, conversations: 0, preferences: 0, notifications: 0 }
  }

  const conversationIds = conversations.map((conversation) => conversation._id)

  // Messages and preferences BOTH strong-ref their conversation, so both are
  // gathered by conversation ref (robust to the preference's deterministic id
  // shape) and deleted before the conversations themselves.
  const messageIds =
    (await clientReadUncached.fetch<string[]>(
      `*[_type == "message" && conversation._ref in $conversationIds]._id`,
      { conversationIds },
      { cache: 'no-store' },
    )) ?? []

  const preferenceIds =
    (await clientReadUncached.fetch<string[]>(
      `*[_type == "conversationPreference" && conversation._ref in $conversationIds]._id`,
      { conversationIds },
      { cache: 'no-store' },
    )) ?? []

  // Collapsed `message_received` notifications carry no conversation ref — they
  // are matched by the conversation's deep link (BOTH audience variants, since a
  // recipient only ever received one), mirroring the proposal cascade.
  const notificationLinks = conversations.flatMap((conversation) => [
    conversationLinkPath(conversation, true),
    conversationLinkPath(conversation, false),
  ])
  const notificationIds =
    (await clientReadUncached.fetch<string[]>(
      `*[_type == "notification" && notificationType == "message_received" && link in $links]._id`,
      { links: notificationLinks },
      { cache: 'no-store' },
    )) ?? []

  // Deletion order (see the exported doc): strong referrers first.
  await commitDeletesChunked(messageIds)
  await commitDeletesChunked(preferenceIds)
  await commitDeletesChunked(conversationIds)
  await commitDeletesChunked(notificationIds)

  return {
    messages: messageIds.length,
    conversations: conversationIds.length,
    preferences: preferenceIds.length,
    notifications: notificationIds.length,
  }
}
