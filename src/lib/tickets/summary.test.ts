/**
 * @vitest-environment node
 *
 * The figures `/admin/tickets`, `tickets.admin.summary` and the CLI all read.
 *
 * The cases that matter are the ones a second implementation gets wrong: the
 * paid/free split by GRANT rather than price, one dedup over the whole set, and
 * every `'unknown'` staying `'unknown'`. A `0` in place of one of those is this
 * module asserting a fact nobody obtained — which is how an organizer ends up
 * chasing speakers who already hold their ticket.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  resolveAccess: vi.fn(),
  getSpeakers: vi.fn(),
  getOrganizerCount: vi.fn(),
  fetchSpeakerTicketInputs: vi.fn(),
  resolveSpeakerTicketType: vi.fn(),
  fetchEventTickets: vi.fn(),
  listDiscounts: vi.fn(),
}))

vi.mock('@/lib/speaker/sanity', () => ({
  getSpeakers: h.getSpeakers,
  getOrganizerCount: h.getOrganizerCount,
}))
vi.mock('@/lib/speaker/ticketInputs', () => ({
  fetchSpeakerTicketInputs: h.fetchSpeakerTicketInputs,
}))
vi.mock('./admin-access', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resolveTicketingAdminAccess: h.resolveAccess,
}))
vi.mock('./speakerStatus', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resolveSpeakerTicketType: h.resolveSpeakerTicketType,
}))

import { buildTicketSummary, type TicketSummaryReady } from './summary'
import type { Conference } from '@/lib/conference/types'
import type { EventTicket } from './types'

const crm = (email: string) => ({ first_name: 'A', last_name: 'B', email })

const conference = {
  _id: 'conf-1',
  title: 'Test Conf',
  organization: { _ref: 'org-A' },
  startDate: '2026-06-01',
  ticketCapacity: 100,
  ticketTargets: {
    enabled: true,
    salesStartDate: '2026-01-01',
    targetCurve: 'linear',
    milestones: [],
  },
  // Only the upgrade is declared; everything else is left undeclared so the
  // tally has to report how sure it is.
  ticketTypeRoles: [{ typeName: 'Workshop upgrade', admits: false }],
  sponsors: [
    {
      sponsor: { name: 'Acme' },
      tier: { title: 'Gold', ticketEntitlement: 2 },
    },
  ],
} as unknown as Conference

const ticket = (t: Partial<EventTicket> & { id: number; order_id: number }) =>
  ({
    order_date: '2026-02-01T10:00:00Z',
    category: 'Regular',
    customer_name: null,
    sum: '0',
    sum_left: '0',
    fields: [],
    crm: crm('x@example.com'),
    ...t,
  }) as EventTicket

const TICKETS: EventTicket[] = [
  ticket({ id: 1, order_id: 100, sum: '2500', crm: crm('a@example.com') }),
  ticket({ id: 2, order_id: 101, sum: '2500', crm: crm('b@example.com') }),
  ticket({
    id: 3,
    order_id: 102,
    category: 'Speaker ticket',
    crm: crm('speaker@example.com'),
  }),
  ticket({
    id: 4,
    order_id: 103,
    coupon: 'ACME100',
    crm: crm('sponsored@example.com'),
  }),
  ticket({
    id: 5,
    order_id: 100,
    category: 'Workshop upgrade',
    sum: '500',
    crm: crm('a@example.com'),
  }),
]

async function ready(): Promise<TicketSummaryReady> {
  const summary = await buildTicketSummary(conference)
  if (summary.state !== 'ready') {
    throw new Error(`expected a ready summary, got ${summary.state}`)
  }
  return summary
}

beforeEach(() => {
  vi.clearAllMocks()
  h.fetchEventTickets.mockResolvedValue(TICKETS)
  h.listDiscounts.mockResolvedValue({
    discounts: [
      {
        id: 1,
        triggerValue: 'ACME100',
        type: 'percent',
        value: '100',
        tickets: [],
      },
    ],
    ticketTypes: [{ id: 10, name: 'Regular' }],
  })
  h.resolveAccess.mockResolvedValue({
    state: 'ready',
    providerType: 'checkin',
    eventRef: { provider: 'checkin', customerId: 7, eventId: 4242 },
    provider: {
      amountsIncludeVat: false,
      amountBasis: 'per-order',
      fetchEventTickets: h.fetchEventTickets,
      listDiscounts: h.listDiscounts,
    },
  })
  h.resolveSpeakerTicketType.mockResolvedValue({
    id: 11,
    name: 'Speaker ticket',
  })
  h.getSpeakers.mockResolvedValue({
    speakers: [{ _id: 'sp-1' }, { _id: 'sp-2' }],
    err: null,
  })
  h.getOrganizerCount.mockResolvedValue({ count: 3, err: null })
  h.fetchSpeakerTicketInputs.mockResolvedValue([
    {
      speakerId: 'sp-1',
      emails: ['speaker@example.com'],
      invitedAt: '2026-01-05',
    },
    { speakerId: 'sp-2', emails: ['other@example.com'], invitedAt: null },
  ])
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('the counts', () => {
  it('splits paid from free by grant, not by price', async () => {
    const { ticketCounts } = await ready()
    // Free: the invitation-gated speaker ticket and the 100%-off redemption.
    // Paid: two Regular and the priced upgrade — a grant bills nobody.
    expect(ticketCounts).toEqual({ all: 5, paid: 3, free: 2 })
  })

  it('counts a human once, however many tickets they hold', async () => {
    const { participants, seatsUsed } = await ready()
    // a holds a seat and an add-on; the add-on seats nobody.
    expect(participants.participants).toBe(4)
    expect(participants.addOnsWithSeat).toBe(1)
    expect(participants.addOnsWithoutSeat).toBe(0)
    expect(seatsUsed).toBe(4)
  })

  it('says the headcount rests on undeclared types', async () => {
    const { participants } = await ready()
    expect(participants.roleBasis).toBe('unknown')
  })

  it('totals revenue over the paid tickets only', async () => {
    const { statistics } = await ready()
    expect(statistics.totalRevenue).toBe(5500)
    expect(statistics.totalPaidTickets).toBe(3)
    expect(statistics.totalOrders).toBe(2)
  })

  it('breaks the paid tickets down by type, each type keeping its own money', async () => {
    const { categoryStats } = await ready()
    expect(categoryStats).toEqual([
      expect.objectContaining({ category: 'Regular', count: 2, revenue: 5000 }),
      expect.objectContaining({
        category: 'Workshop upgrade',
        count: 1,
        revenue: 500,
      }),
    ])
  })

  it('allocates sponsor seats from the tier, not from redemptions', async () => {
    const { sponsorTicketsByTier, sponsorAllocationTotal } = await ready()
    expect(sponsorTicketsByTier).toEqual({
      Gold: { sponsors: 1, tickets: 2, ticketsPerSponsor: 2 },
    })
    expect(sponsorAllocationTotal).toBe(2)
  })
})

describe('what it refuses to flatten', () => {
  it('reports organizer claims as unknown — never as zero', async () => {
    const { freeTicketAllocation } = await ready()
    // Uncountable by construction: an organizer comp is indistinguishable from
    // any other free ticket. A 0 here reads as "three organizers have not
    // claimed" and sends someone chasing them.
    expect(freeTicketAllocation.organizers.claimed).toBe('unknown')
    expect(freeTicketAllocation.organizers.allocated).toBe(3)
    // The total therefore covers the two rows that CAN be counted, and says so.
    expect(freeTicketAllocation.totalClaimed).toBe(2)
    expect(freeTicketAllocation.claimedCovers).toEqual(['sponsors', 'speakers'])
  })

  it('keeps a failed roster read unknown rather than calling it none', async () => {
    h.getOrganizerCount.mockResolvedValue({ count: 0, err: new Error('down') })
    h.getSpeakers.mockResolvedValue({ speakers: [], err: new Error('down') })

    const { freeTicketAllocation } = await ready()
    expect(freeTicketAllocation.organizers.allocated).toBe('unknown')
    expect(freeTicketAllocation.speakers.allocated).toBe('unknown')
    expect(freeTicketAllocation.totalAllocated).toBe('unknown')
  })

  it('keeps speaker claims unknown when the provider could not be checked', async () => {
    h.resolveSpeakerTicketType.mockResolvedValue(undefined)
    h.fetchSpeakerTicketInputs.mockResolvedValue(null)

    const { freeTicketAllocation } = await ready()
    expect(freeTicketAllocation.speakers.claimed).toBe('unknown')
  })

  it('carries the provider VAT basis and apportioning', async () => {
    const summary = await ready()
    // Checkin: amounts ex VAT, one amount per ORDER — so a mixed order's
    // per-type revenue is an even split, exact only in the event total.
    expect(summary.amountsIncludeVat).toBe(false)
    expect(summary.revenueApportioned).toBe(true)
    expect(summary.providerLabel).toBe('Checkin.no')
  })

  it('does not apportion for a per-ticket provider', async () => {
    h.resolveAccess.mockResolvedValue({
      state: 'ready',
      providerType: 'tito',
      eventRef: { provider: 'tito', accountSlug: 'a', eventSlug: 'e' },
      provider: {
        amountsIncludeVat: true,
        amountBasis: 'per-ticket',
        fetchEventTickets: h.fetchEventTickets,
        listDiscounts: h.listDiscounts,
      },
    })

    const summary = await ready()
    expect(summary.revenueApportioned).toBe(false)
    expect(summary.amountsIncludeVat).toBe(true)
    expect(summary.providerLabel).toBe('Tito')
  })
})

describe('the states that are not numbers', () => {
  it.each(['unconfigured', 'unavailable', 'disabled'] as const)(
    'passes %s through instead of inventing zeros',
    async (state) => {
      h.resolveAccess.mockResolvedValue({ state, providerType: 'checkin' })

      const summary = await buildTicketSummary(conference)
      expect(summary).toEqual({
        state,
        providerType: 'checkin',
        providerLabel: 'Checkin.no',
      })
      expect(h.fetchEventTickets).not.toHaveBeenCalled()
    },
  )

  it('reports a failed provider read as an error, not as an empty event', async () => {
    h.fetchEventTickets.mockRejectedValue(new Error('502 from vendor'))

    const summary = await buildTicketSummary(conference)
    expect(summary).toEqual({
      state: 'error',
      message: 'Unable to fetch tickets: 502 from vendor',
    })
  })

  it('reports an event with no tickets as ready and empty — a real zero', async () => {
    h.fetchEventTickets.mockResolvedValue([])

    const summary = await ready()
    expect(summary.analysis.paid).toEqual({ status: 'empty' })
    expect(summary.analysis.all).toEqual({ status: 'empty' })
    expect(summary.ticketCounts).toEqual({ all: 0, paid: 0, free: 0 })
  })
})

describe('claimedCoverageNote in the payload', () => {
  it('carries the composed caveat, not just the categories to compose it from', async () => {
    // A consumer that cannot call `claimedCoverageNote` — the CLI is Rust —
    // would otherwise word this itself, and two places wording the same
    // caveat about which figures can be trusted is how they come to differ.
    const summary = await buildTicketSummary(conference)
    if (summary.state !== 'ready') throw new Error('expected a ready summary')

    // Organizer comps are never countable, so the total covers two of three.
    expect(summary.freeTicketAllocation.claimedCovers).toEqual([
      'sponsors',
      'speakers',
    ])
    expect(summary.claimedCoverageNote).toBe('sponsors and speakers only')
  })
})
