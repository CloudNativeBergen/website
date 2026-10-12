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
 *
 * WHAT ONE CALLER CAN MAKE IT COST. A webhook delivery carries as many ticket
 * names as its sender likes, and anyone holding an organization's Checkin
 * secret can sign one. So one call raises at most {@link MAX_TYPES_PER_CALL}
 * types in ONE event (one organizers read, one transaction), and one process
 * raises at most {@link MAX_TYPES_PER_CONFERENCE} types for one conference.
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
 * How many types one call may raise. One order, or one attendee's tickets,
 * does not hold ten different types nobody has decided. The rest are not
 * claimed, so they are not lost: the next sale or refusal that names them
 * raises them.
 */
export const MAX_TYPES_PER_CALL = 10

/**
 * How many types one process raises for one conference; no conference has a
 * hundred ticket types. When it is reached the process raises nothing more for
 * that conference, and says so once in the log. Another process starts again
 * from none. It is per conference so that one tenant filling its own cannot
 * silence another's.
 */
export const MAX_TYPES_PER_CONFERENCE = 100

/**
 * THE MEMO: per conference, the types this process has raised.
 *
 * ON `globalThis`, not in module scope. Next builds pages and route handlers
 * into separate bundles, each with its own copy of this module, so a
 * module-level set would be one per bundle and the portal page and the webhook
 * would each raise the same type. A cold start begins empty and its first
 * raise is absorbed by the document id. A type whose write failed stays in it:
 * the next process that meets the type writes it.
 */
const MEMO = Symbol.for('workshop.not-set-notice.raised')

function raisedTypes(): Map<string, Set<string>> {
  const holder = globalThis as { [MEMO]?: Map<string, Set<string>> }
  return (holder[MEMO] ??= new Map())
}

/** Forget everything, as a restarted process would. For tests. */
export function __resetNotSetNoticeMemo(): void {
  raisedTypes().clear()
}

/**
 * Raise ONE not-set event for the not-set types among `typeNames` that this
 * process has not raised yet. The one entry point for both call sites.
 *
 * WHAT A CALL COSTS. Deciding is the rule plus a set lookup: no I/O. For types
 * already raised here, that is all that happens. Otherwise the event is
 * published AFTER the response, so neither the webhook's answer nor the
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
    // A conference that exists only as a draft (the webhook can resolve one)
    // has no bell to show a notification in: the hub reads published ids.
    // Nothing is raised and nothing is claimed, so the first sale after it is
    // published raises it.
    if (!conferenceId || conferenceId.startsWith('drafts.')) return

    const memo = raisedTypes()
    const raised = memo.get(conferenceId) ?? new Set<string>()
    const room = MAX_TYPES_PER_CONFERENCE - raised.size
    if (room <= 0) return

    const due = notSetTicketTypes(params.typeNames, params.ticketTypeRoles)
      .filter((typeName) => !raised.has(typeKey(typeName)))
      .slice(0, Math.min(MAX_TYPES_PER_CALL, room))
    if (due.length === 0) return

    // Claimed here, before the work is even scheduled, so a burst of requests
    // for one type raises it once and not once each.
    for (const typeName of due) raised.add(typeKey(typeName))
    memo.set(conferenceId, raised)
    if (raised.size >= MAX_TYPES_PER_CONFERENCE) {
      console.warn(
        `workshop.ticket-type.not-set: ${MAX_TYPES_PER_CONFERENCE} types raised for one conference; this process raises no more for it`,
        { conferenceId },
      )
    }

    runAfterResponse(async () => {
      // The registry subscribes the handler. Loaded here and not at the top:
      // it is every handler in the application, and this module is imported
      // by the attendee portal and the webhook, which would carry all of it
      // for a type that is rarely met.
      await import('@/lib/events/registry')
      console.info('workshop.ticket-type.not-set: raised', {
        conferenceId,
        typeNames: due,
        source,
      })
      await eventBus.publish({
        eventType: 'workshop.ticket-type.not-set',
        timestamp: new Date(),
        conferenceId,
        typeNames: due,
        metadata: { source },
      })
    })
  } catch (error) {
    console.error('workshop.ticket-type.not-set: could not be raised', error)
  }
}
