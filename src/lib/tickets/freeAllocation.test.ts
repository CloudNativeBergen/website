/**
 * The defect this covers: one claimed number for the whole event, taken from
 * `freeTickets.length`, spread across three categories that are claimed in
 * three different ways. Live it read "37 / 100 claimed" while sponsors were at
 * 0 of 40, organizers at 0 of 9, and the 37 was entirely speakers.
 *
 * So every case below asserts the number for ONE category against ONE source,
 * and the unknowns assert the thing the old table could not do: NOT a zero.
 */
import { describe, expect, it } from 'vitest'
import {
  calculateFreeTicketAllocation,
  countOrUnknown,
  freeTicketClaimRate,
  type FreeTicketAllocationInput,
} from './freeAllocation'
import type { EventDiscountWithUsage } from '@/lib/discounts/types'
import type { SpeakerTicketStatus } from './speakerStatus'

const code = (
  triggerValue: string,
  overrides: Partial<EventDiscountWithUsage> = {},
): EventDiscountWithUsage => ({
  trigger: 'coupon',
  type: 'percent',
  value: '100',
  triggerValue,
  affects: 'total',
  includeBooking: false,
  affectsValue: null,
  modes: [],
  tickets: [],
  ticketsOnly: false,
  times: 0,
  timesTotal: 0,
  actualUsage: { usageCount: 0, ticketIds: [], totalPaid: 0 },
  ...overrides,
})

const redeemed = (n: number) => ({
  actualUsage: { usageCount: n, ticketIds: [], totalPaid: 0 },
})

const speaker = (
  speakerId: string,
  state: SpeakerTicketStatus['state'],
): SpeakerTicketStatus => ({ speakerId, state })

const input = (
  overrides: Partial<FreeTicketAllocationInput> = {},
): FreeTicketAllocationInput => ({
  sponsors: [],
  discounts: [],
  speakerCount: 0,
  speakerStatuses: [],
  organizerCount: 0,
  ...overrides,
})

describe('sponsors — redemptions of their own 100%-off code', () => {
  it('counts redemptions of the code, not zero-priced tickets', () => {
    const { sponsors } = calculateFreeTicketAllocation(
      input({
        sponsors: [{ name: 'Acme Cloud', tier: { ticketEntitlement: 5 } }],
        discounts: [code('ACMECLOUD1234', redeemed(2))],
      }),
    )

    expect(sponsors.allocated).toBe(5)
    expect(sponsors.claimed).toBe(2)
    expect(sponsors.fromProvider).toBe(false)
  })

  it('reports redemptions beyond the entitlement rather than clamping', () => {
    const { sponsors } = calculateFreeTicketAllocation(
      input({
        sponsors: [{ name: 'Acme Cloud', tier: { ticketEntitlement: 1 } }],
        discounts: [code('ACMECLOUD1234', redeemed(5))],
      }),
    )

    expect(sponsors.allocated).toBe(1)
    expect(sponsors.claimed).toBe(5)
  })

  it('a sponsor with no code has claimed nothing, and the row says so', () => {
    const { sponsors } = calculateFreeTicketAllocation(
      input({
        sponsors: [
          { name: 'Acme Cloud', tier: { ticketEntitlement: 5 } },
          { name: 'Globex', tier: { ticketEntitlement: 2 } },
        ],
        discounts: [code('ACMECLOUD1234', redeemed(1))],
      }),
    )

    expect(sponsors.allocated).toBe(7)
    expect(sponsors.claimed).toBe(1)
    expect(sponsors.status).toContain('1 sponsor with an allowance has no code')
  })

  it('a PARTIAL discount is a purchase, not a comp', () => {
    const { sponsors } = calculateFreeTicketAllocation(
      input({
        sponsors: [{ name: 'Acme Cloud', tier: { ticketEntitlement: 5 } }],
        discounts: [code('ACMECLOUD1234', { value: '20', ...redeemed(4) })],
      }),
    )

    expect(sponsors.claimed).toBe(0)
  })

  it('a code we cannot value makes the row unknown, never 0', () => {
    const { sponsors } = calculateFreeTicketAllocation(
      input({
        sponsors: [{ name: 'Acme Cloud', tier: { ticketEntitlement: 5 } }],
        // A fixed-amount code: whether it removes the whole price needs the
        // ticket type's list price, which no ticket carries.
        discounts: [code('ACMECLOUD1234', { type: 'amount', ...redeemed(3) })],
      }),
    )

    expect(sponsors.claimed).toBe('unknown')
  })

  it('an unreadable code list is unknown, not zero claims', () => {
    const { sponsors } = calculateFreeTicketAllocation(
      input({
        sponsors: [{ name: 'Acme Cloud', tier: { ticketEntitlement: 5 } }],
        discounts: null,
      }),
    )

    expect(sponsors.allocated).toBe(5)
    expect(sponsors.claimed).toBe('unknown')
  })

  it("names the provider's counter when we have no count of our own", () => {
    const { sponsors } = calculateFreeTicketAllocation(
      input({
        sponsors: [{ name: 'Acme Cloud', tier: { ticketEntitlement: 5 } }],
        discounts: [
          code('ACMECLOUD1234', { actualUsage: undefined, times: 3 }),
        ],
      }),
    )

    expect(sponsors.claimed).toBe(3)
    expect(sponsors.fromProvider).toBe(true)
  })
})

describe('speakers — the redeemed / invited / not-invited split', () => {
  it('claims the redeemed count and surfaces the actionable remainder', () => {
    const { speakers } = calculateFreeTicketAllocation(
      input({
        speakerCount: 6,
        speakerStatuses: [
          speaker('a', 'redeemed'),
          speaker('b', 'redeemed'),
          speaker('c', 'invited'),
          speaker('d', 'invited'),
          speaker('e', 'invited'),
          speaker('f', 'not-invited'),
        ],
      }),
    )

    expect(speakers.allocated).toBe(6)
    expect(speakers.claimed).toBe(2)
    expect(speakers.status).toBe(
      '3 invitations unclaimed · 1 speaker never invited.',
    )
  })

  it('an unknown state makes the row unknown — an outage is not a no-show', () => {
    const { speakers } = calculateFreeTicketAllocation(
      input({
        speakerCount: 2,
        speakerStatuses: [speaker('a', 'redeemed'), speaker('b', 'unknown')],
      }),
    )

    expect(speakers.claimed).toBe('unknown')
  })

  it('no invitation records at all is unknown, not zero claims', () => {
    const { speakers } = calculateFreeTicketAllocation(
      input({ speakerCount: 51, speakerStatuses: null }),
    )

    expect(speakers.allocated).toBe(51)
    expect(speakers.claimed).toBe('unknown')
  })
})

describe('organizers — not derivable, therefore unknown', () => {
  it('renders unknown rather than 0 claimed', () => {
    const { organizers } = calculateFreeTicketAllocation(
      input({ organizerCount: 9 }),
    )

    expect(organizers.allocated).toBe(9)
    expect(organizers.claimed).toBe('unknown')
    expect(organizers.claimed).not.toBe(0)
  })

  it('a failed organizer read is unknown allocated, not 0 allocated', () => {
    // `getOrganizerCount` answers `{ count: 0, err }` on failure.
    const organizerCount = countOrUnknown({
      count: 0,
      err: new Error('sanity unreachable'),
    })
    expect(organizerCount).toBe('unknown')

    const { organizers, totalAllocated } = calculateFreeTicketAllocation(
      input({ organizerCount, speakerCount: 51 }),
    )

    expect(organizers.allocated).toBe('unknown')
    expect(organizers.status).toContain('could not be read')
    expect(totalAllocated).toBe('unknown')
  })

  it('a successful read is still a number', () => {
    expect(countOrUnknown({ count: 9, err: null })).toBe(9)
  })
})

describe('the total refuses to state a rate it cannot compute', () => {
  it('is unknown whenever any row is unknown, and offers no percentage', () => {
    const allocation = calculateFreeTicketAllocation(
      input({
        sponsors: [{ name: 'Acme Cloud', tier: { ticketEntitlement: 40 } }],
        discounts: [code('ACMECLOUD1234', redeemed(0))],
        speakerCount: 51,
        speakerStatuses: Array.from({ length: 51 }, (_, i) =>
          speaker(`s${i}`, i < 37 ? 'redeemed' : 'not-invited'),
        ),
        organizerCount: 9,
      }),
    )

    // The live numbers the old table hid behind "37 / 100 — 37.0% claimed".
    expect(allocation.sponsors.claimed).toBe(0)
    expect(allocation.speakers.claimed).toBe(37)
    expect(allocation.organizers.claimed).toBe('unknown')

    expect(allocation.totalAllocated).toBe(100)
    expect(allocation.totalClaimed).toBe('unknown')
    expect(freeTicketClaimRate(allocation)).toBeNull()
  })

  it('states a rate once every row is countable', () => {
    const allocation = {
      ...calculateFreeTicketAllocation(
        input({ speakerCount: 8, organizerCount: 2 }),
      ),
      totalAllocated: 10 as const,
      totalClaimed: 4 as const,
    }

    expect(freeTicketClaimRate(allocation)).toBe(40)
  })

  it('has no rate to state when nothing is allocated', () => {
    const allocation = calculateFreeTicketAllocation(
      input({ organizerCount: 0, speakerCount: 0 }),
    )

    expect(allocation.totalAllocated).toBe(0)
    expect(freeTicketClaimRate({ ...allocation, totalClaimed: 0 })).toBeNull()
  })
})
