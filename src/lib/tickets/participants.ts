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
  type TicketRoleSource,
} from './classification'
import type { EventTicket } from './types'
import { deduplicateTicketsByEmail } from './utils'

export interface ParticipantTally {
  /** Unique emails across admitting tickets. One human, one count. */
  participants: number
  /** Unique emails across admitting tickets who ALSO hold workshop access. */
  workshopParticipants: number
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
   * The WEAKEST basis any ticket's `admits` rested on — `declared` only when
   * every type in the set was declared, `proposed` when the softest thing left
   * is a proposal `./discovery` can show its evidence for, `unknown` when at
   * least one type has neither.
   *
   * This keys on the only input the count actually rests on. `admits` is the
   * whole rule here, and `classifyTicket` derives it from `ticketTypeRoles`
   * alone — the discount list moves `comp`, which this tally never reads. A
   * missing discount list therefore does NOT make the headcount uncertain, and
   * an unconfigured conference does, however well the codes were read.
   *
   * A `proposed` basis does not change a single number above it: the proposal
   * is not applied. It changes what a surface may claim about them.
   */
  roleBasis: TicketRoleSource
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
 * @param context classification inputs. The conference-derived parts
 *                (`ticketTypeRoles` above all) must ALWAYS be passed: they are
 *                what decides `admits`, and they do not depend on any provider
 *                read succeeding. Dropping the whole context because the
 *                discount list could not be read would re-admit every add-on —
 *                the defect this module exists to remove.
 */
export function tallyParticipants(
  tickets: EventTicket[],
  context: TicketClassificationContext,
): ParticipantTally {
  const classified = tickets.map(
    (t) => [t, classifyTicket(t, context)] as const,
  )
  const admits = new Map(classified.map(([t, c]) => [t, c.admits]))

  const seats = tickets.filter((t) => admits.get(t))
  const participants = deduplicateTicketsByEmail(seats)
  const seatedEmails = new Set(seats.map(emailOf).filter(Boolean))

  const workshopGrants = new Map(
    classified.map(([t, c]) => [t, c.grantsWorkshop]),
  )
  const workshopTickets = tickets.filter((t) => workshopGrants.get(t))
  const workshopEmails = new Set(workshopTickets.map(emailOf).filter(Boolean))
  const workshopParticipants = participants.filter((t) => {
    const email = emailOf(t)
    if (email && workshopEmails.has(email)) return true
    return workshopGrants.get(t) || false
  }).length

  const addOns = tickets.filter((t) => !admits.get(t))
  const addOnsWithSeat = addOns.filter((t) =>
    seatedEmails.has(emailOf(t)),
  ).length

  return {
    participants: participants.length,
    workshopParticipants,
    addOnsWithSeat,
    addOnsWithoutSeat: addOns.length - addOnsWithSeat,
    repeatTickets: seats.length - participants.length,
    roleBasis: weakestSource(classified.map(([, c]) => c.admitsSource)),
  }
}

/** Weakest first: one undeclared type is enough to qualify the whole number. */
const SOURCE_ORDER: TicketRoleSource[] = ['unknown', 'proposed', 'declared']

function weakestSource(sources: TicketRoleSource[]): TicketRoleSource {
  return (
    SOURCE_ORDER.find((source) => sources.includes(source)) ??
    // No tickets at all: nothing was assumed, so nothing needs qualifying.
    'declared'
  )
}
