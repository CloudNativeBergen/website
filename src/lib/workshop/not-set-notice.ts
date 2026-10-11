/**
 * The not-set notice (workshop tickets spec §8, #1335): organizers are told
 * when a ticket type has no workshop decision.
 *
 * Two call sites raise it, the Checkin ticket-sold webhook and the portal
 * refusal in `./eligibility`, through {@link reportNotSetTicketTypes}. The
 * notification itself is written by the bus handler
 * (`@/lib/events/handlers/ticketTypeNotSetNotification`).
 *
 * ONCE PER TYPE PER CONFERENCE rests on two layers, and they guarantee
 * different things:
 *
 *  1. THE DOCUMENT ID. Each organizer's notification has an id derived from
 *     (conference, ticket type, organizer) and is written with
 *     `createIfNotExists`. A second write of it, from another server instance
 *     or after a restart, changes nothing. This is what holds across
 *     processes. It holds for as long as the document exists: the 90-day purge
 *     removes it, after which a type still not set is notified again (spec §9).
 *  2. THE MEMO in this module, per process. It is what keeps the refusal path
 *     cheap: that path runs on every request of a refused attendee, and a
 *     type this process has already handled costs no Sanity read and no write.
 *     On its own it guarantees nothing across instances or restarts.
 */
import { createHash } from 'node:crypto'
import { eventBus } from '@/lib/events/bus'
import { truncateToGraphemeBoundary } from '@/lib/messaging/links'
import type { OnceNotificationInput } from '@/lib/notification/types'
import {
  type TicketTypeRole,
  typeKey,
  workshopAccessOf,
} from '@/lib/tickets/classification'
import { runAfterResponse } from '@/server/runAfterResponse'

/** Schema cap on `notification.title` (`Rule.max(200)`). */
const TITLE_MAX = 200

/**
 * The not-set types among `typeNames`, each once, as first spelled.
 *
 * "Not set" is the rule's own `unclassified` answer and nothing else: it is
 * never re-derived here. The rule only gives that answer on a conference that
 * has marked at least one type, so a conference that has marked nothing has no
 * not-set types.
 */
export function notSetTicketTypes(
  typeNames: readonly (string | null | undefined)[],
  ticketTypeRoles: readonly TicketTypeRole[] | null | undefined,
): string[] {
  const byKey = new Map<string, string>()
  for (const name of typeNames) {
    if (!name || byKey.has(typeKey(name))) continue
    if (workshopAccessOf(name, ticketTypeRoles) !== 'unclassified') continue
    byKey.set(typeKey(name), name)
  }
  return [...byKey.values()]
}

/**
 * The document id of one organizer's notification for one type. A hash,
 * because a type name is free text from the ticketing provider and a Sanity id
 * allows only `[A-Za-z0-9._-]`, 128 characters at most. The type is hashed by
 * {@link typeKey}, the comparison the rule itself uses, so two spellings the
 * rule treats as one type are one notification.
 */
function noticeId(
  conferenceId: string,
  typeName: string,
  organizerId: string,
): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([conferenceId, typeKey(typeName), organizerId]))
    .digest('hex')
  return `notification.workshop-not-set.${digest}`
}

/**
 * One notification per organizer for one not-set type. It stores the ticket
 * type's name and nothing about the buyer or the refused attendee.
 */
export function ticketTypeNotSetNotifications(params: {
  conferenceId: string
  typeName: string
  organizerIds: readonly string[]
}): OnceNotificationInput[] {
  const { conferenceId, organizerIds } = params
  const typeName = params.typeName.trim()
  const opening = 'Set workshop access for “'
  const title = `${opening}${truncateToGraphemeBoundary(
    typeName,
    TITLE_MAX - opening.length - 1,
  )}”`

  return [...new Set(organizerIds)].filter(Boolean).map((organizerId) => ({
    id: noticeId(conferenceId, typeName, organizerId),
    recipientId: organizerId,
    conferenceId,
    notificationType: 'workshop_ticket_type_not_set',
    title,
    message:
      'Its holders can’t sign up for workshops until you choose whether it grants workshop access.',
    link: '/admin/workshops',
  }))
}

/**
 * How long this process leaves a type alone after a FAILED attempt. Without
 * it, a write that keeps failing (a Sanity outage, a revoked token) would be
 * retried, organizer read included, on every request of every refused
 * attendee.
 */
const RETRY_AFTER_MS = 10 * 60_000

/** Handled, or being handled, by this process: never attempt again. */
const HANDLED = Number.POSITIVE_INFINITY

/**
 * THE MEMO: per (conference, type), the earliest time this process may attempt
 * the notification again. In module scope, so per warm instance; a cold start
 * begins empty and its first attempt is absorbed by the document id.
 *
 * Its size is bounded by the ticket types the providers name: a key is only
 * ever added for a type on a ticket the provider returned, or on a webhook
 * delivery whose signature verified.
 */
const nextAttemptAt = new Map<string, number>()

const memoKey = (conferenceId: string, typeName: string) =>
  JSON.stringify([conferenceId, typeKey(typeName)])

/**
 * A failed attempt: let this process try the type again later. Called by the
 * bus handler, which is the only place that learns whether the write went
 * through.
 */
export function retryNotSetNoticeLater(
  conferenceId: string,
  typeName: string,
): void {
  nextAttemptAt.set(
    memoKey(conferenceId, typeName),
    Date.now() + RETRY_AFTER_MS,
  )
}

/** Forget everything, as a restarted process would. For tests. */
export function __resetNotSetNoticeMemo(): void {
  nextAttemptAt.clear()
}

/**
 * Raise the not-set event for each not-set type among `typeNames` that this
 * process has not handled yet. The ONE entry point for both call sites.
 *
 * WHAT A CALL COSTS. Deciding is the rule plus a map lookup: no I/O. For a
 * type already handled here, that is all that happens. For a new one the
 * event is published AFTER the response, so neither the webhook's answer nor
 * the attendee's refusal waits for Sanity.
 *
 * NEVER-FAIL. Returns nothing and never throws: the caller's answer cannot
 * depend on it. A failure is logged and the type is retried later.
 */
export function reportNotSetTicketTypes(params: {
  /** The server-resolved conference. Absent: nothing can be raised. */
  conferenceId: string | undefined
  typeNames: readonly (string | null | undefined)[]
  ticketTypeRoles: readonly TicketTypeRole[] | null | undefined
  source: 'ticket-sold' | 'portal-refusal'
}): void {
  try {
    const { conferenceId, source } = params
    if (!conferenceId) return

    const now = Date.now()
    const due = notSetTicketTypes(
      params.typeNames,
      params.ticketTypeRoles,
    ).filter((typeName) => {
      const key = memoKey(conferenceId, typeName)
      if (now < (nextAttemptAt.get(key) ?? 0)) return false
      // Claimed before the work starts, so a burst of requests for one type
      // makes one attempt, not one each.
      nextAttemptAt.set(key, HANDLED)
      return true
    })
    if (due.length === 0) return

    runAfterResponse(async () => {
      try {
        // The registry subscribes the handler. Imported here, not at the top:
        // it pulls in every handler in the application, and the refusal path
        // has no use for them until there is something to raise.
        await import('@/lib/events/registry')
        await Promise.all(
          due.map((typeName) =>
            eventBus.publish({
              eventType: 'workshop.ticket-type.not-set',
              timestamp: new Date(),
              conferenceId,
              typeName,
              metadata: { source },
            }),
          ),
        )
      } catch (error) {
        console.error('workshop.ticket-type.not-set: publish failed', error)
        for (const typeName of due) {
          retryNotSetNoticeLater(conferenceId, typeName)
        }
      }
    })
  } catch (error) {
    console.error('workshop.ticket-type.not-set: could not be raised', error)
  }
}
