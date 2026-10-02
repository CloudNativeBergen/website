/**
 * @vitest-environment node
 *
 * The defect: a provider failure used to take the CONFERENCE's configuration
 * down with it. `/admin/tickets` answered `null` for a Tito tenant or a failed
 * `listDiscounts`, `tallyParticipants` classified against an empty context, and
 * with no `ticketTypeRoles` every ticket type admits again — so a declared
 * workshop-upgrade add-on counted as a participant, which is the exact bug the
 * classifier was written to remove.
 */

const links = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('@/lib/sanity/client', () => ({
  clientReadCached: links,
  clientReadUncached: links,
  clientWrite: links,
}))
import { describe, expect, it, vi } from 'vitest'
import type { Conference } from '@/lib/conference/types'
import type { EventTicket } from '@/lib/tickets/types'
import type { TicketingProvider } from './provider'
import { buildClassificationContext } from './classificationContext'
import { tallyParticipants } from './participants'

const UPGRADE = 'Sponsor discount (workshop upgrade)'

const conference = {
  _id: 'conf-1',
  ticketTypeRoles: [
    { typeName: UPGRADE, admits: false },
    { typeName: 'Conference day', admits: true },
  ],
  sponsors: [{ sponsor: { _id: 'sponsor-acme', name: 'Acme Cloud' } }],
} as unknown as Conference

/** Only the two members this module touches; everything else would be unused. */
const providerWith = (
  listDiscounts: TicketingProvider['listDiscounts'],
): TicketingProvider =>
  ({
    listDiscounts,
    fetchPublicTicketTypes: vi
      .fn()
      .mockRejectedValue(new Error('types unavailable')),
  }) as unknown as TicketingProvider

const ticket = (category: string, email: string): EventTicket =>
  ({
    id: Math.random(),
    order_id: 1,
    order_date: '2026-03-01',
    category,
    customer_name: 'Ada',
    sum: '0.00',
    sum_left: '0.00',
    fields: [],
    crm: { first_name: 'Ada', last_name: 'L', email },
  }) as EventTicket

// Two DIFFERENT people: one seat, one workshop upgrade. If the roles are lost,
// the upgrade admits and the headcount goes from 1 to 2 — the live defect.
const TICKETS = [
  ticket('Conference day', 'ada@example.com'),
  ticket(UPGRADE, 'grace@example.com'),
]

describe('buildClassificationContext', () => {
  it('keeps the conference roles when the discount read fails', async () => {
    const context = await buildClassificationContext(
      {
        provider: providerWith(
          vi.fn().mockRejectedValue(new Error('checkin down')),
        ),
        eventRef: { provider: 'checkin', customerId: 1, eventId: 2 },
      },
      conference,
    )

    // The codes are gone — honestly absent, not an empty list that would read
    // as "no code discounted anything".
    expect(context.discounts).toBeUndefined()
    expect(context.ticketTypeRoles).toEqual(conference.ticketTypeRoles)

    const tally = tallyParticipants(TICKETS, context)
    expect(tally.participants).toBe(1)
    expect(tally.addOnsWithoutSeat).toBe(1)
    expect(tally.roleBasis).toBe('declared')
  })

  it('keeps the conference roles for a Tito tenant, which has no discount API', async () => {
    const listDiscounts = vi.fn()
    const context = await buildClassificationContext(
      {
        provider: providerWith(listDiscounts),
        eventRef: { provider: 'tito', accountSlug: 'a', eventSlug: 'e' },
      },
      conference,
    )

    expect(listDiscounts).not.toHaveBeenCalled()
    expect(context.discounts).toBeUndefined()
    expect(tallyParticipants(TICKETS, context).participants).toBe(1)
  })

  /**
   * A provider that throws SYNCHRONOUSLY — the shape a stub or a misbuilt
   * adapter has — used to escape the soft-fail: `resolveSpeakerTicketType` is
   * not an `async` function, so the throw happened before `.catch()` was
   * attached and took the whole context down, and with it the caller's ticket
   * section. Every failure here costs the derived speaker type, nothing more.
   */
  it('survives a provider that throws synchronously', async () => {
    const provider = {
      listDiscounts: () => {
        throw new TypeError('not a function')
      },
      fetchPublicTicketTypes: () => {
        throw new TypeError('not a function')
      },
    } as unknown as TicketingProvider

    const context = await buildClassificationContext(
      {
        provider,
        eventRef: { provider: 'checkin', customerId: 1, eventId: 2 },
      },
      conference,
    )

    expect(context.discounts).toBeUndefined()
    expect(context.ticketTypeRoles).toEqual(conference.ticketTypeRoles)
    expect(tallyParticipants(TICKETS, context).participants).toBe(1)
  })

  it('carries the codes through when they can be read', async () => {
    const discounts = [
      {
        trigger: 'coupon',
        type: 'percent',
        value: '100',
        triggerValue: 'ACMECLOUD1234',
      },
    ]
    const context = await buildClassificationContext(
      {
        provider: providerWith(vi.fn().mockResolvedValue({ discounts })),
        eventRef: { provider: 'checkin', customerId: 1, eventId: 2 },
      },
      conference,
    )

    expect(context.discounts).toBe(discounts)
    expect(context.sponsors).toEqual([
      { id: 'sponsor-acme', name: 'Acme Cloud', linkedCodes: [] },
    ])
  })

  it("carries each sponsor's STORED codes (#1262), joined by sponsor id", async () => {
    links.fetch.mockResolvedValueOnce([
      {
        _id: 'sfc-acme',
        sponsorId: 'sponsor-acme',
        name: 'Acme Cloud',
        linkedCodes: ['COMP-7Q2'],
      },
      // Not a conference sponsor (not closed-won) but it STORES a code: it
      // owns that code — and only that, never anything by name.
      { _id: 'sfc-x', sponsorId: 'sponsor-x', name: 'X', linkedCodes: ['X1'] },
      // Not a conference sponsor and stores nothing: claims nothing at all.
      { _id: 'sfc-y', sponsorId: 'sponsor-y', name: 'Y', linkedCodes: null },
    ])
    const context = await buildClassificationContext(
      {
        provider: providerWith(vi.fn().mockResolvedValue({ discounts: [] })),
        eventRef: { provider: 'checkin', customerId: 1, eventId: 2 },
      },
      conference,
    )
    expect(context.sponsors).toEqual([
      {
        id: 'sponsor-acme',
        name: 'Acme Cloud',
        linkedCodes: ['COMP-7Q2'],
        sponsorForConferenceId: 'sfc-acme',
      },
      {
        id: 'sponsor-x',
        name: 'X',
        linkedCodes: ['X1'],
        sponsorForConferenceId: 'sfc-x',
      },
    ])
  })

  it('falls back to name attribution when the links cannot be read', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    links.fetch.mockRejectedValueOnce(new Error('sanity down'))
    const context = await buildClassificationContext(
      {
        provider: providerWith(vi.fn().mockResolvedValue({ discounts: [] })),
        eventRef: { provider: 'checkin', customerId: 1, eventId: 2 },
      },
      conference,
    )
    expect(context.sponsors).toEqual([
      { id: 'sponsor-acme', name: 'Acme Cloud', linkedCodes: [] },
    ])
  })
})
