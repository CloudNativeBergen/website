/**
 * @vitest-environment node
 *
 * The counting bugs `/admin/tickets` shipped: one human counted twice because a
 * comp and a purchase were deduped in separate buckets, and add-ons counted as
 * people and then reported as "upgrades".
 */
import { describe, it, expect } from 'vitest'
import type { EventDiscount } from '@/lib/discounts/types'
import type { EventTicket } from '@/lib/tickets/types'
import type { TicketClassificationContext } from './classification'
import { seatsUsed, tallyParticipants } from './participants'

let nextId = 1

function ticket(overrides: Partial<EventTicket> = {}): EventTicket {
  return {
    id: nextId++,
    order_id: 100,
    order_date: '2026-03-01',
    category: 'Conference day',
    customer_name: 'Ada Lovelace',
    sum: '4500.00',
    sum_left: '0.00',
    fields: [],
    crm: { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' },
    ...overrides,
  }
}

function withEmail(email: string, overrides: Partial<EventTicket> = {}) {
  return ticket({
    crm: { first_name: 'X', last_name: 'Y', email },
    ...overrides,
  })
}

const UPGRADE = 'Sponsor discount (workshop upgrade)'

const comp: EventDiscount = {
  trigger: 'coupon',
  type: 'percent',
  value: '100',
  triggerValue: 'ACMECLOUD1234',
  affects: 'total',
  includeBooking: false,
  affectsValue: '2',
  modes: ['default'],
  tickets: ['1'],
  ticketsOnly: false,
  times: 1,
  timesTotal: 2,
}

const context: TicketClassificationContext = {
  discounts: [comp],
  sponsorNames: ['Acme Cloud'],
  ticketTypeRoles: [{ typeName: UPGRADE, admits: false }],
}

describe('tallyParticipants', () => {
  it('counts one human holding a comp and a paid ticket exactly once', () => {
    const tally = tallyParticipants(
      [
        withEmail('ada@example.com', { coupon: 'ACMECLOUD1234', sum: '0.00' }),
        withEmail('ada@example.com'),
      ],
      context,
    )

    // The old code deduped paid and free separately and added: 1 + 1 = 2.
    expect(tally.participants).toBe(1)
    expect(tally.repeatTickets).toBe(1)
    expect(tally.addOnsWithSeat).toBe(0)
  })

  it('does not count a workshop upgrade as a second participant', () => {
    const tally = tallyParticipants(
      [
        withEmail('ada@example.com'),
        withEmail('ada@example.com', { category: UPGRADE, sum: '800.00' }),
      ],
      context,
    )

    expect(tally.participants).toBe(1)
    expect(tally.addOnsWithSeat).toBe(1)
    expect(tally.addOnsWithoutSeat).toBe(0)
    // An add-on is not a repeat seat, and must not be reported as one.
    expect(tally.repeatTickets).toBe(0)
  })

  it('counts an upgrade whose holder has no seat as neither a participant nor an attendee add-on', () => {
    const tally = tallyParticipants(
      [withEmail('grace@example.com', { category: UPGRADE, sum: '800.00' })],
      context,
    )

    expect(tally.participants).toBe(0)
    expect(tally.addOnsWithSeat).toBe(0)
    expect(tally.addOnsWithoutSeat).toBe(1)
  })

  it('keeps two different humans apart', () => {
    const tally = tallyParticipants(
      [withEmail('ada@example.com'), withEmail('grace@example.com')],
      context,
    )

    expect(tally.participants).toBe(2)
    expect(tally.repeatTickets).toBe(0)
  })

  it('does not merge tickets that carry no email', () => {
    const tally = tallyParticipants(
      [withEmail(''), withEmail(''), withEmail('ada@example.com')],
      context,
    )

    // Two anonymous tickets cannot be shown to be the same person.
    expect(tally.participants).toBe(3)
    expect(tally.repeatTickets).toBe(0)
  })

  it('keeps excluding a configured add-on when the discount list is missing', () => {
    // The page used to hand `null` to this function for a Tito tenant or a
    // failed `listDiscounts`, dropping `ticketTypeRoles` with it — and every
    // add-on admitted again. The roles come from the CONFERENCE and survive any
    // provider failure.
    const withoutDiscounts: TicketClassificationContext = {
      sponsorNames: context.sponsorNames,
      ticketTypeRoles: [
        { typeName: UPGRADE, admits: false },
        { typeName: 'Conference day', admits: true },
      ],
    }

    const tally = tallyParticipants(
      [
        withEmail('ada@example.com'),
        withEmail('ada@example.com', { category: UPGRADE, sum: '800.00' }),
      ],
      withoutDiscounts,
    )

    expect(tally.participants).toBe(1)
    expect(tally.addOnsWithSeat).toBe(1)
    // The discount list decides `comp`, which this tally never reads. Missing
    // codes therefore say nothing about the headcount's certainty.
    expect(tally.certain).toBe(true)
  })

  it('is uncertain when a ticket type has no declared role, however good the codes are', () => {
    const tally = tallyParticipants(
      [
        // Declared: admits.
        withEmail('ada@example.com', { category: 'Conference day' }),
        // Undeclared: admits by assumption only.
        withEmail('grace@example.com', { category: 'Workshop day' }),
      ],
      {
        ...context,
        ticketTypeRoles: [
          { typeName: UPGRADE, admits: false },
          { typeName: 'Conference day', admits: true },
        ],
      },
    )

    expect(tally.participants).toBe(2)
    expect(tally.certain).toBe(false)
  })

  it('is certain once every type in the set is declared', () => {
    const tally = tallyParticipants(
      [
        withEmail('ada@example.com'),
        withEmail('ada@example.com', { category: UPGRADE, sum: '800.00' }),
      ],
      {
        ...context,
        ticketTypeRoles: [
          { typeName: UPGRADE, admits: false },
          { typeName: 'Conference day', admits: true },
        ],
      },
    )

    expect(tally.certain).toBe(true)
  })

  it('counts nothing for no tickets', () => {
    expect(tallyParticipants([], context)).toEqual({
      participants: 0,
      addOnsWithSeat: 0,
      addOnsWithoutSeat: 0,
      repeatTickets: 0,
      certain: true,
    })
  })
})

describe('seatsUsed', () => {
  it('counts a sponsor comp as a seat', () => {
    const tally = tallyParticipants(
      [
        withEmail('ada@example.com', { coupon: 'ACMECLOUD1234', sum: '0.00' }),
        withEmail('grace@example.com'),
      ],
      context,
    )

    expect(seatsUsed(tally)).toBe(2)
  })

  it('excludes add-ons, whether or not their holder has a seat', () => {
    const tally = tallyParticipants(
      [
        withEmail('ada@example.com'),
        withEmail('ada@example.com', { category: UPGRADE, sum: '800.00' }),
        withEmail('grace@example.com', { category: UPGRADE, sum: '800.00' }),
      ],
      context,
    )

    expect(seatsUsed(tally)).toBe(1)
  })

  it('counts every seat a repeat email holds, unlike the headcount', () => {
    const tally = tallyParticipants(
      [withEmail('ada@example.com'), withEmail('ada@example.com')],
      context,
    )

    // One person, two chairs in the room.
    expect(tally.participants).toBe(1)
    expect(seatsUsed(tally)).toBe(2)
  })

  it('is zero when nothing was sold or granted', () => {
    expect(seatsUsed(tallyParticipants([], context))).toBe(0)
  })
})
