/**
 * Server-only data layer for the persistent notification hub.
 *
 * Design:
 * - Notifications are fanned out PER RECIPIENT (one document each), so read
 *   state is per-user and reads are a simple recipient filter.
 * - EXCEPTION (M5): `message_received` collapses to ONE persistent document per
 *   (recipient, conversation) — see `upsertMessageNotifications`.
 * - A fan-out writes all recipients in ONE transaction.
 * - `createNotifications` NEVER throws into the caller: a failed notification
 *   must not fail the business mutation that produced it (see its doc).
 * - Inbox reads use `clientReadUncached`: for a notification inbox, freshness
 *   (read-your-writes after marking read / a new notification) matters more
 *   than CDN caching.
 */
import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import { createReference } from '@/lib/sanity/helpers'
import { sendPushForNotifications } from '@/lib/push/send'
import {
  truncateToGraphemeBoundary,
  conversationLinkPath,
} from '@/lib/messaging/links'
import type {
  MessageNotificationInput,
  NotificationInput,
  NotificationItem,
} from './types'

/**
 * Persist one `notification` document per input, all in a SINGLE
 * `clientWrite.transaction()`.
 *
 * CONTRACT: this function NEVER throws into the caller's flow. A failure to
 * persist notifications is caught and logged (`console.error`) — a broken
 * notification write must not roll back or fail the business mutation that
 * triggered it (a submitted proposal is still submitted even if the organizer
 * notification write fails). Callers therefore do not (and must not) wrap this
 * in a try/catch expecting to react to failures.
 */
export async function createNotifications(
  items: NotificationInput[],
): Promise<void> {
  if (items.length === 0) {
    return
  }

  try {
    const createdAt = new Date().toISOString()
    const tx = clientWrite.transaction()

    for (const item of items) {
      const doc: { _type: string; [key: string]: unknown } = {
        _type: 'notification',
        recipient: createReference(item.recipientId),
        conference: createReference(item.conferenceId),
        notificationType: item.notificationType,
        title: item.title,
        createdAt,
      }
      if (item.message) {
        doc.message = item.message
      }
      if (item.link) {
        doc.link = item.link
      }
      if (item.actorId) {
        doc.actor = createReference(item.actorId)
      }
      if (item.relatedProposalId) {
        // Weak reference so a later proposal deletion doesn't orphan-block.
        doc.relatedProposal = {
          ...createReference(item.relatedProposalId),
          _weak: true,
        }
      }
      tx.create(doc)
    }

    await tx.commit()

    // Bridge to web push (#444): mirror each committed notification to the
    // recipient's opt-in push subscriptions. Push is a pure delivery CHANNEL —
    // the hub already decided WHAT/WHEN above. This runs inside the same
    // never-throw contract: `sendPushForNotifications` never throws, but we also
    // isolate it so that even an unexpected failure can neither fail the
    // (already committed) notification write nor the business mutation.
    try {
      await sendPushForNotifications(items)
    } catch (pushError) {
      console.error('Failed to send web push for notifications:', pushError)
    }
  } catch (error) {
    // Never propagate — see the contract above.
    console.error('Failed to create notifications:', error)
  }
}

/**
 * Deterministic id for the SINGLE collapsed message notification a recipient
 * holds per conversation (M5 collapse model — see `sanity/schemaTypes/notification.ts`).
 */
export function messageNotificationId(
  conversationId: string,
  recipientId: string,
): string {
  return `notification.message.${conversationId}.${recipientId}`
}

/** Schema cap on `notification.title` (Rule.max(200)). */
const NOTIFICATION_TITLE_MAX = 200

/**
 * Title copy for a collapsed message notification: a single unread message
 * names its author; an accumulated pile leads with the count (the latest
 * author still appears via the excerpt/actor line).
 */
function messageNotificationTitle(
  count: number,
  authorName: string,
  subject: string,
): string {
  const title =
    count > 1
      ? `${count} new messages — ${subject}`
      : `New message from ${authorName} — ${subject}`
  // Grapheme-safe cut (an emoji in the author name or subject can straddle the
  // 200-char cap) so the stored title never ends in a lone surrogate (�).
  return truncateToGraphemeBoundary(title, NOTIFICATION_TITLE_MAX)
}

/**
 * Collapse-aware writer for `message_received` (M5): each recipient keeps ONE
 * persistent notification per conversation (deterministic id via
 * {@link messageNotificationId}) which every new message re-surfaces instead of
 * stacking a new document.
 *
 * Mechanics — ONE batched read, then ONE transaction:
 * - the current `{readAt, count}` of every target id is fetched in a single
 *   GROQ query;
 * - per recipient the transaction chains `createIfNotExists` (base doc,
 *   count 1) and a `patch` that bumps `createdAt` to now (bubbling the item to
 *   the top of the createdAt-desc inbox), UNSETS `readAt` (re-unread), refreshes
 *   title/message/link/actor to the latest message, and sets
 *   `count = (existing && unread ? existing.count || 1 : 0) + 1` — unread
 *   accumulates, read-or-new resets to 1.
 *
 * Web push rides along exactly as in {@link createNotifications} (category
 * `messages`), one push per recipient per message.
 *
 * CONTRACT: NEVER throws into the caller's flow — identical envelope to
 * {@link createNotifications}. Non-message notification types are unaffected
 * and keep using `createNotifications`.
 */
export async function upsertMessageNotifications(
  items: MessageNotificationInput[],
): Promise<void> {
  if (items.length === 0) {
    return
  }

  try {
    const ids = items.map((item) =>
      messageNotificationId(item.conversationId, item.recipientId),
    )

    // ONE batched read: the collapse state of every target document.
    const existingRows = await clientReadUncached.fetch<
      { _id: string; readAt?: string | null; count?: number | null }[]
    >(`*[_type == "notification" && _id in $ids]{ _id, readAt, count }`, {
      ids,
    })
    const existingById = new Map(
      (existingRows ?? []).map((row) => [row._id, row]),
    )

    const now = new Date().toISOString()

    // Precompute the count-aware title + deterministic id per recipient ONCE so
    // the transaction write and the push payload share the exact same title.
    const prepared = items.map((item) => {
      const id = messageNotificationId(item.conversationId, item.recipientId)
      const existing = existingById.get(id)
      // Unread accumulates; a read (or brand-new) document resets to 1.
      const count =
        (existing && !existing.readAt ? (existing.count ?? 1) : 0) + 1
      return {
        item,
        id,
        count,
        title: messageNotificationTitle(count, item.authorName, item.subject),
      }
    })

    // Chunk the per-recipient upserts so ONE malformed recipient ref can't fail
    // the whole fan-out (per-recipient failure isolation): each chunk commits in
    // its own transaction via `Promise.allSettled`, and the push bridge fires
    // only for the recipients whose chunk actually committed.
    const CHUNK_SIZE = 10
    const chunks: (typeof prepared)[] = []
    for (let i = 0; i < prepared.length; i += CHUNK_SIZE) {
      chunks.push(prepared.slice(i, i + CHUNK_SIZE))
    }

    const commitResults = await Promise.allSettled(
      chunks.map((chunk) => {
        const tx = clientWrite.transaction()
        for (const { item, id, title, count } of chunk) {
          const set: Record<string, unknown> = {
            // Bubbles the collapsed item back to the top of the inbox.
            createdAt: now,
            title,
            count,
          }
          if (item.message) {
            set.message = item.message
          }
          if (item.link) {
            set.link = item.link
          }
          if (item.actorId) {
            set.actor = createReference(item.actorId)
          }
          if (item.relatedProposalId) {
            // Weak reference so a later proposal deletion doesn't orphan-block.
            set.relatedProposal = {
              ...createReference(item.relatedProposalId),
              _weak: true,
            }
          }

          tx.createIfNotExists({
            _id: id,
            _type: 'notification',
            recipient: createReference(item.recipientId),
            conference: createReference(item.conferenceId),
            notificationType: 'message_received',
            title,
            count: 1,
            createdAt: now,
          }).patch(id, { set, unset: ['readAt'] })
        }
        return tx.commit()
      }),
    )

    // Build push items ONLY for the chunks that committed; a rejected chunk is
    // logged and its recipients simply get no hub/push for this message.
    const pushItems: NotificationInput[] = []
    commitResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(
          'Failed to commit a message-notification chunk:',
          result.reason,
        )
        return
      }
      for (const { item, title } of chunks[index]) {
        pushItems.push({
          recipientId: item.recipientId,
          conferenceId: item.conferenceId,
          notificationType: 'message_received',
          title,
          // Stable per-conversation tag: successive pushes for the same thread
          // REPLACE each other on the device instead of stacking N lock-screen
          // notifications while the hub shows one collapsed item (M5).
          tag: `msg:${item.conversationId}`,
          ...(item.message ? { message: item.message } : {}),
          ...(item.link ? { link: item.link } : {}),
          ...(item.actorId ? { actorId: item.actorId } : {}),
          ...(item.relatedProposalId
            ? { relatedProposalId: item.relatedProposalId }
            : {}),
        })
      }
    })

    // Same isolated push bridge as `createNotifications`: a push failure can
    // neither fail the (already committed) upsert nor the business mutation.
    // Skip entirely when no chunk committed (nothing to deliver).
    if (pushItems.length > 0) {
      try {
        await sendPushForNotifications(pushItems)
      } catch (pushError) {
        console.error(
          'Failed to send web push for message notifications:',
          pushError,
        )
      }
    }
  } catch (error) {
    // Never propagate — see the contract above.
    console.error('Failed to upsert message notifications:', error)
  }
}

/**
 * A recipient's notifications for a conference, newest first. Supports keyset
 * pagination via `before` (a `createdAt` cursor): pass the `createdAt` of the
 * last item on the previous page to fetch the next page.
 */
export async function getNotificationsForSpeaker({
  speakerId,
  conferenceId,
  limit = 20,
  before,
}: {
  speakerId: string
  conferenceId: string
  limit?: number
  before?: string
}): Promise<NotificationItem[]> {
  // `limit` is inlined into the GROQ slice (slice bounds must be literals), so
  // clamp it to a safe integer range — it never reaches the query as free text.
  const safeLimit = Math.min(Math.max(1, Math.floor(limit) || 20), 50)

  const params: Record<string, unknown> = { speakerId, conferenceId }
  let cursor = ''
  if (before) {
    cursor = ' && createdAt < $before'
    params.before = before
  }

  const query = `*[_type == "notification" && recipient._ref == $speakerId && conference._ref == $conferenceId${cursor}] | order(createdAt desc) [0...${safeLimit}] {
    "id": _id,
    "type": notificationType,
    title,
    message,
    link,
    readAt,
    createdAt,
    actor->{
      _id,
      name,
      "image": coalesce(image.asset->url, imageURL)
    }
  }`

  const results = await clientReadUncached.fetch<NotificationItem[]>(
    query,
    params,
  )
  return results || []
}

/** Count of unread notifications (no `readAt`) for a recipient in a conference. */
export async function getUnreadCount({
  speakerId,
  conferenceId,
}: {
  speakerId: string
  conferenceId: string
}): Promise<number> {
  const count = await clientReadUncached.fetch<number>(
    `count(*[_type == "notification" && recipient._ref == $speakerId && conference._ref == $conferenceId && !defined(readAt)])`,
    { speakerId, conferenceId },
  )
  return count || 0
}

/**
 * Mark the given notification ids as read for `speakerId`, returning how many
 * were actually patched.
 *
 * SECURITY: the ids come from the client, so a caller must not be able to mark
 * ANOTHER user's notifications read. We first fetch the subset of ids whose
 * `recipient._ref == speakerId` and patch ONLY that verified set — a foreign id
 * is silently dropped rather than patched.
 */
export async function markNotificationsRead({
  speakerId,
  ids,
}: {
  speakerId: string
  ids: string[]
}): Promise<number> {
  if (ids.length === 0) {
    return 0
  }

  const ownedIds = await clientReadUncached.fetch<string[]>(
    `*[_type == "notification" && _id in $ids && recipient._ref == $speakerId]._id`,
    { ids, speakerId },
  )

  if (!ownedIds || ownedIds.length === 0) {
    return 0
  }

  const now = new Date().toISOString()
  const tx = clientWrite.transaction()
  for (const id of ownedIds) {
    tx.patch(id, { set: { readAt: now } })
  }
  await tx.commit()

  return ownedIds.length
}

/** The maximum number of distinct links accepted by `markNotificationsReadByLinks`. */
const MARK_READ_BY_LINKS_LIMIT = 8

/**
 * Mark every UNREAD notification whose `link` is one of `links` read for
 * `speakerId`, returning how many were patched. Used to auto-clear a
 * conversation's message notifications when the recipient opens the thread
 * (they navigate by the same deep link the notification carries).
 *
 * SECURITY: mirrors {@link markNotificationsRead}. The recipient filter
 * (`recipient._ref == $speakerId`) IS the ownership guard — only the caller's
 * own notifications are ever fetched and patched, so a foreign link can clear
 * nothing but the caller's own matching notifications. `links` is bounded to
 * {@link MARK_READ_BY_LINKS_LIMIT} defensively (the router also caps it).
 */
export async function markNotificationsReadByLinks({
  speakerId,
  links,
}: {
  speakerId: string
  links: string[]
}): Promise<number> {
  const boundedLinks = links.slice(0, MARK_READ_BY_LINKS_LIMIT)
  if (boundedLinks.length === 0) {
    return 0
  }

  const ids = await clientReadUncached.fetch<string[]>(
    `*[_type == "notification" && recipient._ref == $speakerId && !defined(readAt) && link in $links]._id`,
    { speakerId, links: boundedLinks },
  )

  if (!ids || ids.length === 0) {
    return 0
  }

  const now = new Date().toISOString()
  const tx = clientWrite.transaction()
  for (const id of ids) {
    tx.patch(id, { set: { readAt: now } })
  }
  await tx.commit()

  return ids.length
}

/**
 * Delete a speaker's collapsed `message_received` notifications for the given
 * proposal threads and/or general conversations. Called when a participant
 * LOSES access to a thread (e.g. a co-speaker removed from a proposal): their
 * message notifications would otherwise linger as PERMANENT phantom unread — the
 * bell keeps counting them, the deep link 403/404s once access is gone, and
 * mark-read can never fire because they can no longer open the thread to clear
 * it. Deletes both read and unread (a thread they can't reach shouldn't show up
 * at all).
 *
 * Matching is by the recipient + the audience deep links of each thread (both
 * variants), so it's robust to whichever audience the speaker actually received.
 *
 * NEVER-FAIL: wrapped so a cleanup failure can't fail the access-change mutation
 * that triggered it; returns how many were deleted (0 on error / no match).
 */
export async function deleteMessageNotificationsFor({
  proposalIds = [],
  conversationIds = [],
  speakerId,
}: {
  proposalIds?: string[]
  conversationIds?: string[]
  speakerId: string
}): Promise<number> {
  const links: string[] = []
  for (const proposalId of proposalIds) {
    const conv = { _id: '', conversationType: 'proposal' as const, proposalId }
    links.push(
      conversationLinkPath(conv, true),
      conversationLinkPath(conv, false),
    )
  }
  for (const conversationId of conversationIds) {
    const conv = {
      _id: conversationId,
      conversationType: 'general' as const,
      proposalId: undefined,
    }
    links.push(
      conversationLinkPath(conv, true),
      conversationLinkPath(conv, false),
    )
  }
  if (links.length === 0) {
    return 0
  }

  try {
    const ids = await clientReadUncached.fetch<string[]>(
      `*[_type == "notification" && recipient._ref == $speakerId && notificationType == "message_received" && link in $links]._id`,
      { speakerId, links },
    )
    if (!ids || ids.length === 0) {
      return 0
    }
    const tx = clientWrite.transaction()
    for (const id of ids) {
      tx.delete(id)
    }
    await tx.commit()
    return ids.length
  } catch (error) {
    console.error(
      'Failed to delete message notifications for access loss:',
      error,
    )
    return 0
  }
}

/** The maximum number of notifications marked read in one `markAllRead` call. */
const MARK_ALL_READ_LIMIT = 500

/**
 * Mark all unread notifications for a recipient in a conference as read (bounded
 * to the first {@link MARK_ALL_READ_LIMIT}), returning how many were patched.
 */
export async function markAllRead({
  speakerId,
  conferenceId,
}: {
  speakerId: string
  conferenceId: string
}): Promise<number> {
  const ids = await clientReadUncached.fetch<string[]>(
    `*[_type == "notification" && recipient._ref == $speakerId && conference._ref == $conferenceId && !defined(readAt)][0...${MARK_ALL_READ_LIMIT}]._id`,
    { speakerId, conferenceId },
  )

  if (!ids || ids.length === 0) {
    return 0
  }

  const now = new Date().toISOString()
  const tx = clientWrite.transaction()
  for (const id of ids) {
    tx.patch(id, { set: { readAt: now } })
  }
  await tx.commit()

  return ids.length
}

/** How many expired notifications are fetched and deleted per cleanup batch. */
const RETENTION_DELETE_BATCH_SIZE = 500

/**
 * A hard cap on how many batches a single cleanup run performs, so a runaway
 * query (or a clock/skew bug) can never spin forever. At
 * {@link RETENTION_DELETE_BATCH_SIZE} per batch this bounds one run to ~10k
 * deletions; the next daily run picks up any remainder.
 */
const RETENTION_MAX_BATCHES = 20

/**
 * Permanently delete every `notification` document created more than `days` days
 * ago, in bounded batches — each batch is fetched by id and deleted in ONE
 * `clientWrite.transaction()` (chained `.delete()`), looping until none remain
 * or the {@link RETENTION_MAX_BATCHES} safety cap is reached. Returns the total
 * number of documents deleted.
 *
 * UNREAD MESSAGE EXCEPTION: an unread collapsed `message_received` notification
 * is the ONLY store of a conversation's per-recipient unread state (the messages
 * themselves are immortal — they have no retention policy). Purging it at the
 * horizon would silently drop that unread signal, so we EXCLUDE unread message
 * notifications from the cutoff. Once read (`readAt` set) they age out normally;
 * every OTHER type ages out at the cutoff even when unread (the hub is not an
 * archive).
 *
 * CONTRACT: unlike the fan-out write paths, this function MAY throw. It backs a
 * retention cron route that reports (and should surface) failures rather than
 * silently swallowing them, so the caller is expected to handle errors.
 */
export async function deleteNotificationsOlderThan(
  days: number,
): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  let deleted = 0
  for (let batch = 0; batch < RETENTION_MAX_BATCHES; batch++) {
    const ids = await clientReadUncached.fetch<string[]>(
      `*[_type == "notification" && createdAt < $cutoff && !(notificationType == "message_received" && !defined(readAt))][0...${RETENTION_DELETE_BATCH_SIZE}]._id`,
      { cutoff },
    )

    if (!ids || ids.length === 0) {
      break
    }

    const tx = clientWrite.transaction()
    for (const id of ids) {
      tx.delete(id)
    }
    await tx.commit()

    deleted += ids.length

    // A short batch means the backlog is drained — stop before an empty fetch.
    if (ids.length < RETENTION_DELETE_BATCH_SIZE) {
      break
    }
  }

  return { deleted }
}

/**
 * Per-instance cache TTL for the organizer id set. Organizer membership changes
 * are RARE (promoting/removing an organizer is an infrequent admin action), so a
 * short TTL is an ample freshness bound while collapsing the many per-request
 * reads (EVERY notification fan-out and messaging list resolves organizers) into
 * ~one read per instance per minute.
 *
 * SERVERLESS NOTE: this cache lives in module scope, so it is PER WARM INSTANCE,
 * not global — each lambda/instance refreshes independently and a cold start
 * always reads fresh. The worst-case staleness any caller can observe is
 * {@link ORGANIZER_CACHE_TTL_MS} on whichever instance served them, which is an
 * acceptable bound for organizer membership.
 */
const ORGANIZER_CACHE_TTL_MS = 60_000

/** Upper bound on the organizer fetch; the organizer set is tiny in practice. */
const ORGANIZER_FETCH_LIMIT = 200

let organizerCache: { ids: string[]; expiresAt: number } | null = null

/**
 * The `_id`s of every organizer speaker (bounded to
 * [0...{@link ORGANIZER_FETCH_LIMIT}]). `isOrganizer` is GLOBAL (an organizer of
 * one edition is an organizer everywhere); the conference scoping happens
 * implicitly because the created notification carries the conference ref. Cached
 * per instance for {@link ORGANIZER_CACHE_TTL_MS} (see the note above). The
 * returned array is treated as read-only by callers (they wrap it in a Set).
 */
export async function getOrganizerSpeakerIds(): Promise<string[]> {
  const now = Date.now()
  if (organizerCache && organizerCache.expiresAt > now) {
    return organizerCache.ids
  }
  const ids = await clientReadUncached.fetch<string[]>(
    `*[_type == "speaker" && isOrganizer == true][0...${ORGANIZER_FETCH_LIMIT}]._id`,
  )
  const resolved = ids || []
  organizerCache = { ids: resolved, expiresAt: now + ORGANIZER_CACHE_TTL_MS }
  return resolved
}

/**
 * Clear the per-instance organizer cache. Exposed for tests (which assert fresh
 * reads) and as a hook if a future admin flow wants to invalidate eagerly after
 * changing organizer membership.
 */
export function clearOrganizerSpeakerIdsCache(): void {
  organizerCache = null
}
