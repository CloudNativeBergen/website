/**
 * The not-set notice (workshop tickets spec §8, #1335): organizers are told
 * when a ticket type has no workshop decision.
 *
 * Two call sites raise it, the Checkin ticket-sold webhook and the portal
 * refusal in `./eligibility`, through {@link reportNotSetTicketTypes}. The
 * notification is written by the bus handler
 * (`@/lib/events/handlers/ticketTypeNotSetNotification`).
 *
 * ONCE PER TYPE PER CONFERENCE rests on two layers, and they guarantee
 * different things:
 *
 *  1. THE DOCUMENT ID, in the handler. A second write of a notification that
 *     exists changes nothing, from any server instance. This is what holds
 *     across processes, for as long as the document exists (the 90-day purge
 *     removes it; spec §9).
 *  2. THE MEMO here, per process. It keeps the refusal path cheap: that path
 *     runs on every request of a refused attendee, and a type this process has
 *     already raised costs no Sanity read and no write. On its own it
 *     guarantees nothing across instances or restarts.
 */
import { eventBus } from '@/lib/events/bus'
import type { WorkshopTicketTypeNotSetEvent } from '@/lib/events/types'
import {
  type TicketTypeRole,
  typeKey,
  workshopAccessOf,
} from '@/lib/tickets/classification'
import { runAfterResponse } from '@/server/runAfterResponse'

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
 * THE MEMO: the (conference, type) pairs this process has raised. In module
 * scope, so per warm instance; a cold start begins empty and its first raise is
 * absorbed by the document id. A type whose write failed stays in it: the next
 * process that meets the type writes it.
 *
 * Its size is bounded by the ticket types the providers name: a key is only
 * added for a type on a ticket the provider returned, or on a webhook delivery
 * whose signature verified.
 */
const raised = new Set<string>()

/** Forget everything, as a restarted process would. For tests. */
export function __resetNotSetNoticeMemo(): void {
  raised.clear()
}

/**
 * Raise the not-set event for each not-set type among `typeNames` that this
 * process has not raised yet. The ONE entry point for both call sites.
 *
 * WHAT A CALL COSTS. Deciding is the rule plus a set lookup: no I/O. For a
 * type already raised here, that is all that happens. For a new one the event
 * is published AFTER the response, so neither the webhook's answer nor the
 * attendee's refusal waits for Sanity or can be changed by it.
 *
 * NEVER THROWS. Both callers sit inside a `try` whose `catch` answers for the
 * whole request (a 500 before any workshop email is sent; "unable to verify"
 * instead of the refusal), so a throw from here would change their answer.
 */
export function reportNotSetTicketTypes(params: {
  /** The server-resolved conference. Absent: nothing can be raised. */
  conferenceId: string | undefined
  typeNames: readonly (string | null | undefined)[]
  ticketTypeRoles: readonly TicketTypeRole[] | null | undefined
  source: WorkshopTicketTypeNotSetEvent['metadata']['source']
}): void {
  try {
    const { conferenceId, source } = params
    if (!conferenceId) return

    const due = notSetTicketTypes(
      params.typeNames,
      params.ticketTypeRoles,
    ).filter((typeName) => {
      const key = JSON.stringify([conferenceId, typeKey(typeName)])
      if (raised.has(key)) return false
      // Claimed here, before the work is even scheduled, so a burst of
      // requests for one type raises it once and not once each.
      raised.add(key)
      return true
    })
    if (due.length === 0) return

    runAfterResponse(async () => {
      // The registry subscribes the handler. Loaded here and not at the top:
      // it is every handler in the application, and this module is imported
      // by the attendee portal and the webhook, which would carry all of it
      // for a type that is rarely met.
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
    })
  } catch (error) {
    console.error('workshop.ticket-type.not-set: could not be raised', error)
  }
}
