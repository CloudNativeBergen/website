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
import { tallyParticipants } from './participants'

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

  it('reports the count as unverified when the discount list could not be read', () => {
    const tickets = [
      withEmail('ada@example.com', { coupon: 'ACMECLOUD1234', sum: '0.00' }),
      withEmail('ada@example.com'),
    ]

    const tally = tallyParticipants(tickets, null)

    expect(tally.certain).toBe(false)
    // Still the admits rule, never a fallback to the old price split.
    expect(tally.participants).toBe(1)
    expect(tallyParticipants(tickets, context).certain).toBe(true)
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
