/**
 * @vitest-environment node
 *
 * What discovery may claim from the evidence, and — more importantly — what it
 * may not: a clean sweep over two holders, a role a human already declared, and
 * a count it is never allowed to move on its own.
 */
import { describe, it, expect } from 'vitest'
import type { EventDiscount } from '@/lib/discounts/types'
import { classifyTicket } from './classification'
import {
  CO_HOLD_MIN_SAMPLE,
  proposalFor,
  proposeTicketTypeRoles,
} from './discovery'
import { tallyParticipants } from './participants'
import type { EventTicket } from './types'

let nextId = 1

function ticket(email: string, category: string, sum = '4500.00'): EventTicket {
  return {
    id: nextId++,
    order_id: 100,
    order_date: '2026-03-01',
    category,
    customer_name: email,
    sum,
    sum_left: '0.00',
    fields: [],
    crm: { first_name: 'X', last_name: 'Y', email },
  }
}

const SEAT = 'Conference day'
const UPGRADE = 'Sponsor discount (workshop upgrade)'
const SPEAKER = 'Speaker ticket'

const person = (n: number) => `person${n}@example.com`

/** `count` upgrade holders who each also hold a conference ticket, plus filler
 *  seats so the seat type is strictly the bigger of the two. */
function coHoldingSet(count: number, filler = 20): EventTicket[] {
  const tickets: EventTicket[] = []
  for (let i = 0; i < count; i += 1) {
    tickets.push(ticket(person(i), SEAT))
    tickets.push(ticket(person(i), UPGRADE, '800.00'))
  }
  for (let i = 0; i < filler; i += 1) {
    tickets.push(ticket(`filler${i}@example.com`, SEAT))
  }
  return tickets
}

const compCode: EventDiscount = {
  trigger: 'coupon',
  type: 'percent',
  value: '100',
  triggerValue: 'ACMECLOUD1234',
  affects: 'total',
  includeBooking: false,
  affectsValue: '2',
  modes: ['default'],
  tickets: ['7'],
  ticketsOnly: false,
  times: 1,
  timesTotal: 2,
}

describe('co-holding', () => {
  it('proposes an add-on when every holder also holds a bigger type, with the evidence', () => {
    const proposals = proposeTicketTypeRoles({ tickets: coHoldingSet(10) })
    const upgrade = proposalFor(UPGRADE, proposals)

    expect(upgrade).toBeDefined()
    expect(upgrade!.admits).toBe(false)
    expect(upgrade!.sampleSize).toBe(10)
    expect(upgrade!.confidence).toBe('high')
    expect(upgrade!.evidence).toContain(
      `10 of 10 holders also hold a “${SEAT}” ticket`,
    )
  })

  it('does NOT reason backwards: the bigger type is not proposed as an add-on', () => {
    // Every upgrade holder also holds a conference ticket, so without the
    // "bigger type" clause the conference ticket would look like an add-on to
    // the upgrade and the headcount would collapse.
    const seat = proposalFor(
      SEAT,
      proposeTicketTypeRoles({ tickets: coHoldingSet(10) }),
    )

    expect(seat).toBeUndefined()
  })

  it('will not offer a two-holder sweep with confidence', () => {
    const proposals = proposeTicketTypeRoles({ tickets: coHoldingSet(2) })
    const upgrade = proposalFor(UPGRADE, proposals)

    // Still surfaced — a human may want to look — but never actionable.
    expect(upgrade!.admits).toBe(false)
    expect(upgrade!.sampleSize).toBe(2)
    expect(upgrade!.confidence).toBe('low')
  })

  it('places the confidence floor exactly at CO_HOLD_MIN_SAMPLE', () => {
    const below = proposalFor(
      UPGRADE,
      proposeTicketTypeRoles({ tickets: coHoldingSet(CO_HOLD_MIN_SAMPLE - 1) }),
    )
    const at = proposalFor(
      UPGRADE,
      proposeTicketTypeRoles({ tickets: coHoldingSet(CO_HOLD_MIN_SAMPLE) }),
    )

    expect(below!.confidence).toBe('low')
    expect(at!.confidence).toBe('high')
  })

  it('proposes nothing for a type whose holders do not all hold a seat', () => {
    const tickets = coHoldingSet(10)
    // One upgrade holder holds nothing else: the sweep is no longer clean.
    tickets.push(ticket('lone@example.com', UPGRADE, '800.00'))

    expect(
      proposalFor(UPGRADE, proposeTicketTypeRoles({ tickets })),
    ).toBeUndefined()
  })
})

describe('provider and discount signals', () => {
  it('proposes an invitation-gated type as a granted seat', () => {
    const proposals = proposeTicketTypeRoles({
      tickets: [ticket('grace@example.com', SPEAKER, '0.00')],
      ticketTypes: [{ id: 3, name: SPEAKER, requiresInvitation: true }],
    })
    const speaker = proposalFor(SPEAKER, proposals)

    expect(speaker!.admits).toBe(true)
    expect(speaker!.grants).toBe(true)
    expect(speaker!.confidence).toBe('high')
    expect(speaker!.evidence).toContain('invitation-only')
  })

  it('proposes a type targeted by a 100%-off code as comp-granting, and says nothing about seating', () => {
    const proposals = proposeTicketTypeRoles({
      tickets: [ticket('ada@example.com', SEAT, '0.00')],
      discounts: [compCode],
      ticketTypes: [{ id: 7, name: SEAT }],
    })
    const seat = proposalFor(SEAT, proposals)

    expect(seat!.grants).toBe(true)
    // A 100%-off code can just as easily target an upgrade, so it is never
    // evidence that the type seats anyone.
    expect(seat!.admits).toBe('unknown')
    expect(seat!.evidence).toContain('ACMECLOUD1234')
  })

  it('ignores a partial discount: a discounted sale is not a grant', () => {
    const proposals = proposeTicketTypeRoles({
      tickets: [ticket('ada@example.com', SEAT, '3600.00')],
      discounts: [{ ...compCode, value: '20' }],
      ticketTypes: [{ id: 7, name: SEAT }],
    })

    expect(proposalFor(SEAT, proposals)).toBeUndefined()
  })

  it('reports a type with no signal at all as unknown by saying nothing', () => {
    const proposals = proposeTicketTypeRoles({
      tickets: [
        ticket('ada@example.com', SEAT),
        ticket('grace@example.com', SEAT),
      ],
    })

    expect(proposals).toEqual([])
  })
})

describe('a declaration beats a proposal', () => {
  it('keeps the declared role when discovery proposes the opposite', () => {
    const tickets = coHoldingSet(10)
    const proposals = proposeTicketTypeRoles({ tickets })
    expect(proposalFor(UPGRADE, proposals)!.admits).toBe(false)

    const classification = classifyTicket(ticket('ada@example.com', UPGRADE), {
      // A human says this type DOES seat someone, against ten clean holders.
      ticketTypeRoles: [{ typeName: UPGRADE, admits: true }],
      ticketTypeProposals: proposals,
    })

    expect(classification.admits).toBe(true)
    expect(classification.admitsSource).toBe('declared')
  })

  it('does not treat a declared add-on as evidence that its holders have a seat', () => {
    // Two add-on types, the second declared. Holding a declared add-on must not
    // make the first one look like an add-on to it.
    const tickets: EventTicket[] = []
    for (let i = 0; i < 10; i += 1) {
      tickets.push(ticket(person(i), UPGRADE, '800.00'))
      tickets.push(ticket(person(i), 'Dinner', '400.00'))
      tickets.push(ticket(person(i), 'Dinner', '400.00'))
    }

    const proposals = proposeTicketTypeRoles({
      tickets,
      ticketTypeRoles: [{ typeName: 'Dinner', admits: false }],
    })

    expect(proposalFor(UPGRADE, proposals)).toBeUndefined()
  })
})

describe('a proposal changes the certainty, never the count', () => {
  it('reports proposed rather than unknown, with the same numbers', () => {
    const tickets = coHoldingSet(10)
    const proposals = proposeTicketTypeRoles({ tickets })

    // The seat type is declared, so the upgrade is the only undeclared type
    // left and it is the one the proposal speaks to. (`roleBasis` is the
    // WEAKEST basis in the set: one type with no signal at all would keep the
    // whole tally at `unknown`, which is the point of it.)
    const ticketTypeRoles = [{ typeName: SEAT, admits: true }]
    const withoutProposals = tallyParticipants(tickets, { ticketTypeRoles })
    const withProposals = tallyParticipants(tickets, {
      ticketTypeRoles,
      ticketTypeProposals: proposals,
    })

    expect(withoutProposals.roleBasis).toBe('unknown')
    expect(withProposals.roleBasis).toBe('proposed')
    // The add-on proposal is NOT applied: the ten upgrade holders still count
    // as seats, exactly as before. Confirming it is what moves this number.
    expect(withProposals.participants).toBe(withoutProposals.participants)
    expect(withProposals.addOnsWithSeat).toBe(0)
  })

  it('stays declared when every type in the set was declared', () => {
    const tickets = coHoldingSet(10)
    const tally = tallyParticipants(tickets, {
      ticketTypeRoles: [
        { typeName: SEAT, admits: true },
        { typeName: UPGRADE, admits: false },
      ],
      ticketTypeProposals: proposeTicketTypeRoles({ tickets }),
    })

    expect(tally.roleBasis).toBe('declared')
    // Declared, so it IS applied: the ten upgrades seat nobody.
    expect(tally.participants).toBe(30)
    expect(tally.addOnsWithSeat).toBe(10)
  })
})
