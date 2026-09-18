/**
 * What a ticket type PROBABLY is, from the data we already hold.
 *
 * `./classification` removed a hardcoded list of ticket-type NAMES and put the
 * one question no provider answers — "does this type seat a human?" — into
 * `conference.ticketTypeRoles`. That is honest, but it relocates the same
 * failure into configuration: a ticket type created in Checkin this morning has
 * no entry, so it silently counts as a seat until somebody remembers to go
 * declare it. A page that can see the evidence should say what it sees.
 *
 * So this module PROPOSES a role per type, from evidence the page already
 * fetched, and proposes nothing else:
 *
 *  - CO-HOLDING, the strongest signal. If every holder of a type also holds a
 *    ticket of a BIGGER type, the type is an add-on to a seat its holders
 *    already have — which is exactly how "Sponsor discount (workshop upgrade)"
 *    reveals itself (10 of 10 holders also hold a conference ticket) without
 *    anyone naming it. The "bigger type" clause is what stops the inference
 *    running backwards: without it, every conference ticket held by an upgrade
 *    buyer would make the CONFERENCE type look like an add-on too.
 *  - `requiresInvitation` on the provider's own type — the same field
 *    `findSpeakerTicketType` derives the speaker type from. An invitation-gated
 *    type seats someone and was granted, not sold.
 *  - `EventDiscount.tickets` joined to `removesFullPrice`: a type targeted by a
 *    100%-off code is comp-granting. It says nothing about seating — a sponsor's
 *    100%-off code can target a workshop UPGRADE — so that signal moves `grants`
 *    and never `admits`.
 *
 * EVIDENCE IS THE PRODUCT, not the verdict. Every proposal carries the sample it
 * rests on and a sentence an organizer can check against their own event, because
 * the thing being proposed is unfalsifiable from the inside: 10 of 10 is
 * evidence, 2 of 2 is a coincidence with a denominator. That is the whole job of
 * {@link CO_HOLD_MIN_SAMPLE} — below it a proposal still surfaces, as a
 * suggestion, never as something a caller may act on unattended.
 *
 * A PROPOSAL NEVER BEATS A HUMAN, and never moves a count on its own: a declared
 * `ticketTypeRoles` entry wins outright (see `classifyTicket`), and an
 * undeclared type keeps the "every type seats someone" default while the surface
 * says it is assuming. Confirming a proposal is an organizer's act.
 *
 * Pure: no fetching, no I/O. `./classificationContext` assembles the inputs.
 */
import type { EventDiscount } from '@/lib/discounts/types'
import {
  removesFullPrice,
  typeKey,
  type TicketTypeRole,
} from './classification'
import type { EventTicket } from './types'

/**
 * How many holders a co-holding proposal needs before a caller may act on it.
 *
 * Under a coin-flip null (a holder of this type holds another ticket half the
 * time) a clean sweep of 5 lands at p ≈ 3%, and of 2 at p = 25% — so five is
 * the smallest sample where "all of them" is not routine. It is a floor on
 * CONFIDENCE, not on reporting: a 2-of-2 sweep is still proposed, marked `low`,
 * for a human to look at.
 */
export const CO_HOLD_MIN_SAMPLE = 5

/** Whether a caller may offer a proposal for one-click confirmation. */
export type ProposalConfidence = 'high' | 'low'

/** One type's proposed role, with the evidence that produced it. */
export interface TicketTypeProposal {
  /** The provider's OWN type name, as it appears in `EventTicket.category`. */
  typeName: string
  /**
   * Does this type seat a human? `'unknown'` when the evidence speaks only to
   * how the ticket was PAID for — the discount signal does not answer this.
   */
  admits: boolean | 'unknown'
  /** Granted rather than sold. `'unknown'` when nothing says either way. */
  grants: boolean | 'unknown'
  /** The reason, in words an organizer can check against their own event. */
  evidence: string
  /** Holders this rests on. `0` for a type nobody holds yet. */
  sampleSize: number
  confidence: ProposalConfidence
}

/** A provider ticket type, as much of one as discovery needs. */
export interface DiscoveredTicketType {
  id?: string | number
  name: string
  requiresInvitation?: boolean
}

export interface TicketTypeDiscoveryInput {
  /** Every ticket sold, for the co-holding signal. */
  tickets: readonly EventTicket[]
  /** The event's discount codes, when they could be read. */
  discounts?: readonly EventDiscount[]
  /**
   * The provider's ticket types, for `requiresInvitation` and for resolving the
   * ticket-type IDS in `EventDiscount.tickets` back to names.
   */
  ticketTypes?: readonly DiscoveredTicketType[]
  /**
   * Declared roles. Used ONLY to keep a declared add-on out of the pool of
   * types that count as evidence of a seat; proposals are still produced for
   * declared types, and `classifyTicket` is where declaration wins.
   */
  ticketTypeRoles?: readonly TicketTypeRole[]
}

const emailOf = (ticket: EventTicket) => ticket.crm?.email?.trim().toLowerCase()

interface TypeHolders {
  typeName: string
  /**
   * One entry per ADDRESS, not per ticket. A holder with three add-ons is one
   * holder: counting the rows inflated `emails.length`, which both overstated
   * `sampleSize` and made the strictly-larger test in `findCoHold` reject a
   * genuine add-on whose holders happened to buy several of them. Lowercased
   * and trimmed by `emailOf`, matching `deduplicateTicketsByEmail`.
   */
  emails: Set<string>
}

/** Holders per ticket type, keyed like every other type lookup here. */
function holdersByType(
  input: TicketTypeDiscoveryInput,
): Map<string, TypeHolders> {
  const holders = new Map<string, TypeHolders>()
  const ensure = (name: string) => {
    const key = typeKey(name)
    if (!key) return undefined
    let entry = holders.get(key)
    if (!entry) {
      entry = { typeName: name.trim(), emails: new Set<string>() }
      holders.set(key, entry)
    }
    return entry
  }

  for (const ticket of input.tickets) {
    const entry = ensure(ticket.category ?? '')
    const email = emailOf(ticket)
    // A ticket with no email cannot be shown to be the same person as any
    // other, so it is not evidence of co-holding in either direction.
    if (entry && email) entry.emails.add(email)
  }
  // A type the provider lists but nobody holds still gets to be proposed from
  // its own provider flags — that is the new-type case this module exists for.
  for (const type of input.ticketTypes ?? []) ensure(type.name)

  return holders
}

interface CoHold {
  /** The bigger type whose holders overlap this one completely. */
  seatTypeName: string
  sampleSize: number
}

/**
 * Do ALL of this type's holders also hold a ticket of a bigger type?
 *
 * "Bigger" is the tiebreak that makes the inference directional (see the header)
 * and it is a heuristic, not a proof: two types of equal size tell us nothing
 * and are skipped rather than guessed at.
 *
 * ponytail: O(types²) over holder sets, which is nothing at conference scale
 * (tens of types); if a tenant ever has thousands, index emails → types once.
 */
function findCoHold(
  key: string,
  holders: Map<string, TypeHolders>,
  declaredAddOns: Set<string>,
): CoHold | undefined {
  const candidate = holders.get(key)
  if (!candidate || candidate.emails.size === 0) return undefined

  let best: CoHold | undefined
  // The size of the seat type `best` names. `best.sampleSize` is the
  // CANDIDATE's size and never varies, so comparing against it would compare
  // every seat type to a constant and simply keep the last one iterated.
  let bestSeatSize = 0
  for (const [otherKey, other] of holders) {
    if (otherKey === key) continue
    // A declared add-on does not seat anyone, so holding one is not evidence
    // that its holder has a seat.
    if (declaredAddOns.has(otherKey)) continue
    if (other.emails.size <= candidate.emails.size) continue

    if (![...candidate.emails].every((email) => other.emails.has(email)))
      continue
    if (!best || other.emails.size > bestSeatSize) {
      best = {
        seatTypeName: other.typeName,
        sampleSize: candidate.emails.size,
      }
      bestSeatSize = other.emails.size
    }
  }
  return best
}

/** Type names targeted by a code that removes the WHOLE price. */
function compGrantingTypes(
  input: TicketTypeDiscoveryInput,
): Map<string, string[]> {
  const targeted = new Map<string, string[]>()
  const types = input.ticketTypes ?? []

  for (const discount of input.discounts ?? []) {
    if (removesFullPrice(discount) !== true) continue

    // An empty target list means the code applies to EVERY ticket type — that
    // is how `DiscountCodeManager` reads it ("All ticket types"), and how a
    // global 100%-off code is minted. Dropping such a discount left the very
    // codes that comp everything proposing nothing at all, so it expands to
    // every type we know of instead.
    const targetedTypes = discount.tickets?.length
      ? discount.tickets
          // Checkin stores ticket-type IDs here; match a name too, so a
          // provider that stores names is not silently ignored.
          .map((target) =>
            types.find(
              (t) =>
                (t.id !== undefined && String(t.id) === String(target)) ||
                typeKey(t.name) === typeKey(String(target)),
            ),
          )
          .filter((t) => t !== undefined)
      : types

    for (const type of targetedTypes) {
      const key = typeKey(type.name)
      const codes = targeted.get(key) ?? []
      codes.push(discount.triggerValue ?? discount.trigger)
      targeted.set(key, codes)
    }
  }
  return targeted
}

/**
 * Propose a role for every ticket type the evidence says anything about.
 *
 * Types with no signal are simply absent — that absence is the `unknown` state,
 * and inventing an entry for it would make "we have no idea" look like a finding.
 */
export function proposeTicketTypeRoles(
  input: TicketTypeDiscoveryInput,
): TicketTypeProposal[] {
  const holders = holdersByType(input)
  const declaredAddOns = new Set(
    (input.ticketTypeRoles ?? [])
      .filter((role) => !role.admits)
      .map((role) => typeKey(role.typeName)),
  )
  const invitationOnly = new Set(
    (input.ticketTypes ?? [])
      .filter((t) => t.requiresInvitation)
      .map((t) => typeKey(t.name)),
  )
  const comped = compGrantingTypes(input)

  const proposals: TicketTypeProposal[] = []
  for (const [key, entry] of holders) {
    const coHold = findCoHold(key, holders, declaredAddOns)
    const invited = invitationOnly.has(key)
    const codes = comped.get(key)

    const evidence: string[] = []
    let admits: boolean | 'unknown' = 'unknown'
    let grants: boolean | 'unknown' = 'unknown'
    let confidence: ProposalConfidence = 'low'

    if (coHold) {
      admits = false
      confidence = coHold.sampleSize >= CO_HOLD_MIN_SAMPLE ? 'high' : 'low'
      evidence.push(
        `${coHold.sampleSize} of ${coHold.sampleSize} holders also hold a “${coHold.seatTypeName}” ticket`,
      )
    }

    if (invited) {
      // Invitation-gating says the type was ISSUED. It also says someone was
      // invited to occupy something — but co-holding has seen the actual
      // holders, so it keeps `admits` where the two disagree.
      if (admits === 'unknown') {
        admits = true
        confidence = 'high'
      }
      grants = true
      evidence.push('the ticket provider marks this type invitation-only')
    }

    if (codes?.length) {
      // Deliberately silent on `admits`: a 100%-off sponsor code can target a
      // workshop upgrade just as easily as a seat.
      grants = true
      if (evidence.length === 0) confidence = 'high'
      evidence.push(
        codes.length === 1
          ? `the 100%-off code “${codes[0]}” applies to this type`
          : `${codes.length} 100%-off codes apply to this type`,
      )
    }

    if (evidence.length === 0) continue
    proposals.push({
      typeName: entry.typeName,
      admits,
      grants,
      evidence: evidence.join('; '),
      sampleSize: entry.emails.size,
      confidence,
    })
  }
  return proposals
}

/** The proposal for one ticket type, if discovery made one. */
export function proposalFor(
  typeName: string | null | undefined,
  proposals: readonly TicketTypeProposal[] | undefined,
): TicketTypeProposal | undefined {
  if (!proposals?.length) return undefined
  const key = typeKey(typeName)
  if (!key) return undefined
  return proposals.find((p) => typeKey(p.typeName) === key)
}
