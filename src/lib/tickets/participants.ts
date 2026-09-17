/**
 * How many HUMANS hold tickets — one rule, applied once.
 *
 * `/admin/tickets` used to split tickets into paid and free BY PRICE, dedupe
 * each bucket by email on its own, and add the two counts. Every person holding
 * both a comp and a purchase was therefore counted twice, and the leftover
 * (`total - sum of the two`) was labelled "ticket upgrades" — so a sponsor
 * workshop add-on, and a colleague buying two seats on one email, both read as
 * an upgrade nobody performed.
 *
 * The rule here: a participant is ONE unique email across every ticket whose
 * `admits` is true (see `./classification`). An add-on mints no participant,
 * whatever it cost. Dedup runs ONCE over the whole set, so a comp and a
 * purchase on the same address collapse into one person.
 *
 * `deduplicateTicketsByEmail` keeps tickets with NO email distinct on purpose
 * (they cannot be shown to be the same person), and that is preserved: two
 * anonymous tickets are two participants, not one.
 */
import {
  classifyTicket,
  type TicketClassificationContext,
} from './classification'
import type { EventTicket } from './types'
import { deduplicateTicketsByEmail } from './utils'

export interface ParticipantTally {
  /** Unique emails across admitting tickets. One human, one count. */
  participants: number
  /** Add-on tickets (admits: false) whose holder also holds a seat. */
  addOnsWithSeat: number
  /**
   * Add-on tickets whose holder holds NO admitting ticket — an anomaly worth
   * showing rather than folding into the number above.
   */
  addOnsWithoutSeat: number
  /** Admitting tickets beyond the first for one email. */
  repeatTickets: number
  /**
   * `false` when the caller could not read the event's discount list, so every
   * redeemed code classified as `comp: 'unknown'`. The count is still the honest
   * admits-based one — it is NOT the old price split — but a surface must say it
   * is unverified rather than assert it.
   */
  certain: boolean
}

/**
 * Chairs in the room: every admitting ticket, comps included, add-ons excluded.
 *
 * This is NOT `participants`. One email holding two seats is one person but two
 * chairs, so occupancy counts tickets where the headcount counts humans — the
 * repeat seats are exactly the difference.
 *
 * It has NO configured denominator: the venue size is not in the schema
 * (`ticketCapacity` is the SELLABLE total, comps excluded, by its own
 * definition). So it is a count, and a surface must not turn it into a
 * percentage of a number nobody set.
 */
export const seatsUsed = (tally: ParticipantTally) =>
  tally.participants + tally.repeatTickets

const emailOf = (ticket: EventTicket) => ticket.crm?.email?.toLowerCase() || ''

/**
 * @param context classification inputs, or `null` when the discount read failed
 *                — which yields `certain: false`, never a fallback to price.
 */
export function tallyParticipants(
  tickets: EventTicket[],
  context: TicketClassificationContext | null,
): ParticipantTally {
  const admits = new Map<EventTicket, boolean>(
    tickets.map((t) => [t, classifyTicket(t, context ?? {}).admits]),
  )

  const seats = tickets.filter((t) => admits.get(t))
  const participants = deduplicateTicketsByEmail(seats)
  const seatedEmails = new Set(seats.map(emailOf).filter(Boolean))

  const addOns = tickets.filter((t) => !admits.get(t))
  const addOnsWithSeat = addOns.filter((t) =>
    seatedEmails.has(emailOf(t)),
  ).length

  return {
    participants: participants.length,
    addOnsWithSeat,
    addOnsWithoutSeat: addOns.length - addOnsWithSeat,
    repeatTickets: seats.length - participants.length,
    certain: context !== null,
  }
}
