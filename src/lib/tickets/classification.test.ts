/**
 * @vitest-environment node
 *
 * The cases `/admin/tickets` got wrong while it classified by price: a sponsor
 * comp minted as a 100%-off code, a partial sponsor discount that is a real
 * purchase, an add-on that seats nobody, a speaker comp, and every shape where
 * the honest answer is "we do not know".
 */
import { describe, it, expect } from 'vitest'
import type { EventDiscount } from '@/lib/discounts/types'
import type { EventTicket } from '@/lib/tickets/types'
import {
  classifyTicket,
  isPaidTicket,
  type TicketClassificationContext,
} from './classification'

function ticket(overrides: Partial<EventTicket> = {}): EventTicket {
  return {
    id: 1,
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

function discount(overrides: Partial<EventDiscount> = {}): EventDiscount {
  return {
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
    ...overrides,
  }
}

const SPONSORS = ['Acme Cloud', 'Globex']

describe('classifyTicket', () => {
  it('reads a 100%-off sponsor redemption as a sponsor comp', () => {
    expect(
      classifyTicket(ticket({ coupon: 'ACMECLOUD1234', sum: '0.00' }), {
        discounts: [discount()],
        sponsorNames: SPONSORS,
      }),
    ).toEqual({
      admits: true,
      admitsSource: 'unknown',
      comp: true,
      grantedBy: 'sponsor',
      grantsWorkshop: false,
    })
  })

  it('still reads it as a comp when the order split left a nonzero sum', () => {
    // The failure price-based classification could not see: a comp inside an
    // otherwise paid order. The code, not the number, decides.
    expect(
      classifyTicket(ticket({ coupon: 'acmecloud1234', sum: '1500.00' }), {
        discounts: [discount()],
        sponsorNames: SPONSORS,
      }).comp,
    ).toBe(true)
  })

  it('reads a partial sponsor discount as a purchase, not a grant', () => {
    expect(
      classifyTicket(
        ticket({
          category: 'Sponsor discount (20% off conference day)',
          coupon: 'ACMECLOUD20',
          sum: '3600.00',
        }),
        {
          discounts: [
            discount({ triggerValue: 'ACMECLOUD20', value: '20' }),
            discount(),
          ],
          sponsorNames: SPONSORS,
        },
      ),
    ).toEqual({
      admits: true,
      admitsSource: 'unknown',
      comp: false,
      grantedBy: null,
      grantsWorkshop: false,
    })
  })

  it('does not seat a workshop upgrade its holder bought on top of a seat', () => {
    const context: TicketClassificationContext = {
      discounts: [discount({ triggerValue: 'ACMECLOUD20', value: '20' })],
      sponsorNames: SPONSORS,
      ticketTypeRoles: [
        { typeName: 'Sponsor discount (workshop upgrade)', admits: false },
      ],
    }
    const upgrade = classifyTicket(
      ticket({
        id: 2,
        category: 'Sponsor discount (workshop upgrade)',
        coupon: 'ACMECLOUD20',
        sum: '800.00',
      }),
      context,
    )
    const seat = classifyTicket(
      ticket({
        id: 3,
        crm: {
          first_name: 'Ada',
          last_name: 'Lovelace',
          email: 'ada@example.com',
        },
      }),
      context,
    )

    expect(upgrade.admits).toBe(false)
    expect(upgrade.admitsSource).toBe('declared')
    expect(upgrade.comp).toBe(false)
    // The same person's actual seat is still counted exactly once.
    expect(seat.admits).toBe(true)
  })

  it('reads a speaker ticket as a speaker comp, whatever it cost', () => {
    expect(
      classifyTicket(ticket({ category: 'Speaker ticket', sum: '0.00' }), {
        speakerTicketTypeName: 'Speaker ticket',
      }),
    ).toEqual({
      admits: true,
      admitsSource: 'unknown',
      comp: true,
      grantedBy: 'speaker',
      grantsWorkshop: false,
    })
  })

  it('uses the DERIVED speaker type name, not only the historical literal', () => {
    // `findSpeakerTicketType` resolves whatever the tenant called its
    // invitation-gated type; a hardcoded 'Speaker ticket' would miss this.
    expect(
      classifyTicket(ticket({ category: 'Foredragsholder', sum: '0.00' }), {
        speakerTicketTypeName: 'Foredragsholder',
      }).grantedBy,
    ).toBe('speaker')
  })

  it('leaves a comp unattributed when its code matches no known sponsor', () => {
    const result = classifyTicket(
      ticket({ coupon: 'ORGCREW2026', sum: '0.00' }),
      {
        discounts: [discount({ triggerValue: 'ORGCREW2026' })],
        sponsorNames: SPONSORS,
      },
    )
    expect(result.comp).toBe(true)
    expect(result.grantedBy).toBeNull()
  })

  it('treats an unconfigured ticket type as seating someone, and says so', () => {
    const result = classifyTicket(ticket({ category: 'Workshop upgrade' }), {
      ticketTypeRoles: [{ typeName: 'Something else', admits: false }],
    })
    expect(result.admits).toBe(true)
    expect(result.admitsSource).toBe('unknown')
  })

  it('reports a redeemed code of unknown worth as unknown, never as bought', () => {
    // No discount list supplied: a code was used, but not what it removed.
    expect(classifyTicket(ticket({ coupon: 'MYSTERY10' })).comp).toBe('unknown')
    // Listed codes that do not include this one are the same answer.
    expect(
      classifyTicket(ticket({ coupon: 'MYSTERY10' }), {
        discounts: [discount()],
      }).comp,
    ).toBe('unknown')
  })

  it('reads a plain paid ticket with no discount data as bought', () => {
    expect(classifyTicket(ticket())).toEqual({
      admits: true,
      admitsSource: 'unknown',
      comp: false,
      grantedBy: null,
      grantsWorkshop: false,
    })
  })

  it('will not call a zero-priced ticket with no code a comp', () => {
    // Free-to-attend events exist; price alone cannot tell one from a grant.
    expect(classifyTicket(ticket({ sum: '0.00' })).comp).toBe('unknown')
  })

  it('reads the `discount` field when `coupon` is absent', () => {
    expect(
      classifyTicket(ticket({ discount: 'ACMECLOUD1234', sum: '0.00' }), {
        discounts: [discount()],
        sponsorNames: SPONSORS,
      }).grantedBy,
    ).toBe('sponsor')
  })

  it('does not attribute a sponsor when no sponsor names are supplied', () => {
    // Attribution is substring matching; without names there is nothing to
    // match, and a comp with no named grantor beats a guessed one.
    expect(
      classifyTicket(ticket({ coupon: 'ACMECLOUD1234', sum: '0.00' }), {
        discounts: [discount()],
      }),
    ).toEqual({
      admits: true,
      admitsSource: 'unknown',
      comp: true,
      grantedBy: null,
      grantsWorkshop: false,
    })
  })

  it('cannot judge a non-percentage code, and does not pretend to', () => {
    // A fixed-amount code needs the type's list price, which is not on the
    // ticket — so whether it removed everything is genuinely unknown.
    expect(
      classifyTicket(ticket({ coupon: 'FIXED500', sum: '4000.00' }), {
        discounts: [
          discount({ triggerValue: 'FIXED500', type: 'amount', value: '500' }),
        ],
      }).comp,
    ).toBe('unknown')
  })
})

/**
 * THE PAID/FREE SPLIT, which `/admin/tickets` kept deriving from `sum > 0`
 * after this module existed — so revenue, sellable-ticket progress and the
 * paid/free toggle all still read price as the grant signal. These are the
 * cases where price and grant status DISAGREE, plus the `unknown` policy that
 * decides the rest.
 */
describe('isPaidTicket', () => {
  it('does not sell a 100%-off grant that carries a nonzero amount', () => {
    // The exact shape `classifyTicket` covers above: a comp inside an
    // otherwise paid order. By price it is a sale; by the code it is a grant.
    expect(
      isPaidTicket(ticket({ coupon: 'ACMECLOUD1234', sum: '1500.00' }), {
        discounts: [discount()],
        sponsorNames: SPONSORS,
      }),
    ).toBe(false)
  })

  it('sells a partially discounted seat, which price alone would too', () => {
    expect(
      isPaidTicket(ticket({ coupon: 'ACMECLOUD20', sum: '3600.00' }), {
        discounts: [discount({ triggerValue: 'ACMECLOUD20', value: '20' })],
      }),
    ).toBe(true)
  })

  it('never sells a speaker ticket, whatever the provider billed for it', () => {
    expect(
      isPaidTicket(ticket({ category: 'Speaker ticket', sum: '4500.00' })),
    ).toBe(false)
  })

  it('falls back to price ONLY where the grant status is unknown', () => {
    // A redeemed code we could not look up — the common `unknown`, and the
    // documented last-resort tiebreak. Both sides land where they landed
    // before, so a failed discount read costs certainty and never a number.
    const unlookupable = { coupon: 'MYSTERY' }
    expect(isPaidTicket(ticket({ ...unlookupable, sum: '4500.00' }))).toBe(true)
    expect(isPaidTicket(ticket({ ...unlookupable, sum: '0.00' }))).toBe(false)
  })

  it('reads an ordinary zero-priced ticket as free and a plain sale as paid', () => {
    expect(isPaidTicket(ticket({ sum: '0.00' }))).toBe(false)
    expect(isPaidTicket(ticket({ sum: '4500.00' }))).toBe(true)
  })
})
