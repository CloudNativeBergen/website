import { describe, it, expect, vi, beforeEach, assert } from 'vitest'

// B7: getPublicTicketTypes must route through the request-boundary resolver so a
// tenant's per-org Checkin key is honored, and must preserve the prior soft-fail
// (null on unconfigured/error). The `'use cache'` directive is inert in vitest;
// the next/cache helpers are stubbed to no-ops.
vi.mock('next/cache', () => ({
  cacheLife: () => {},
  cacheTag: () => {},
}))
const resolveTicketingProviderMock = vi.fn()
vi.mock('./provider', () => ({
  resolveTicketingProvider: (...a: unknown[]) =>
    resolveTicketingProviderMock(...a),
}))

import {
  getPublicTicketTypes,
  getTicketAvailability,
  resolveDisplayTickets,
} from './public'
import type { PublicTicketType } from './provider/types'

const CONF = {
  checkinCustomerId: 42,
  checkinEventId: 7,
  organization: { _ref: 'org-xyz' },
}

function pubTicket(over: Record<string, unknown>) {
  return {
    id: 1,
    name: 'General',
    description: '',
    requiresInvitation: false,
    position: 0,
    price: [{ price: '1000', vat: '25' }],
    ...over,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('getPublicTicketTypes — resolver routing (B7)', () => {
  it('resolves from the conference and fetches with the resolved eventRef', async () => {
    const fetchPublicTicketTypes = vi.fn().mockResolvedValue({
      event: { id: 7, name: 'Event' },
      tickets: [pubTicket({})],
    })
    resolveTicketingProviderMock.mockResolvedValue({
      configured: true,
      provider: { fetchPublicTicketTypes },
      eventRef: { customerId: 42, eventId: 7 },
    })

    const result = await getPublicTicketTypes(CONF)

    expect(resolveTicketingProviderMock).toHaveBeenCalledWith(CONF)
    // Now passes the provider-shaped eventRef (not a bare id) so a Tito-bound
    // conference can route to its account/event slugs.
    expect(fetchPublicTicketTypes).toHaveBeenCalledWith({
      customerId: 42,
      eventId: 7,
    })
    expect(result.status).toBe('ok')
    assert(result.status === 'ok')
    expect(result.tickets).toHaveLength(1)
  })

  it('reports not-configured (never throws) when the conference is unconfigured', async () => {
    resolveTicketingProviderMock.mockResolvedValue({
      configured: false,
      provider: null,
      eventRef: null,
    })
    expect(await getPublicTicketTypes({})).toEqual({
      status: 'not-configured',
    })
  })

  it('reports unavailable (never throws) when the provider fetch errors', async () => {
    resolveTicketingProviderMock.mockResolvedValue({
      configured: true,
      provider: {
        fetchPublicTicketTypes: vi
          .fn()
          .mockRejectedValue(new Error('checkin down')),
      },
      eventRef: { customerId: 42, eventId: 7 },
    })
    const result = await getPublicTicketTypes(CONF)
    expect(result.status).toBe('unavailable')
  })
})

/**
 * #846. A failed vendor read and an event that genuinely publishes no tickets
 * both used to be `null`, and an all-free event was filtered down to `[]` —
 * three different worlds, one confident "tickets are not yet available".
 */
describe('getPublicTicketTypes — empty is not unknown, and free is not empty', () => {
  function withTickets(tickets: Record<string, unknown>[]) {
    resolveTicketingProviderMock.mockResolvedValue({
      configured: true,
      provider: {
        fetchPublicTicketTypes: vi
          .fn()
          .mockResolvedValue({ event: { id: 7, name: 'Event' }, tickets }),
      },
      eventRef: { customerId: 42, eventId: 7 },
    })
  }

  it('an all-free event keeps its ticket types instead of vanishing', async () => {
    withTickets([
      pubTicket({ id: 1, name: 'Free entry', price: [] }),
      pubTicket({
        id: 2,
        name: 'Free entry (day 2)',
        price: [{ price: '0', vat: '0' }],
      }),
    ])

    const result = await getPublicTicketTypes(CONF)

    assert(result.status === 'ok')
    // No priced types — but the event HAS tickets, and now says so.
    expect(result.tickets).toHaveLength(0)
    expect(result.freeTickets.map((t) => t.name)).toEqual([
      'Free entry',
      'Free entry (day 2)',
    ])
  })

  it('a genuinely empty event is distinguishable from a failed read', async () => {
    withTickets([])
    const empty = await getPublicTicketTypes(CONF)

    resolveTicketingProviderMock.mockResolvedValue({
      configured: true,
      provider: {
        fetchPublicTicketTypes: vi.fn().mockRejectedValue(new Error('boom')),
      },
      eventRef: { customerId: 42, eventId: 7 },
    })
    const failed = await getPublicTicketTypes(CONF)

    // THE point of the union: these two must not be the same value.
    expect(empty.status).toBe('ok')
    expect(failed.status).toBe('unavailable')
    expect(empty.status).not.toBe(failed.status)
  })

  it('invitation-only types are in neither public bucket', async () => {
    withTickets([
      pubTicket({ id: 1, name: 'Crew', price: [], requiresInvitation: true }),
      pubTicket({ id: 2, name: 'Free entry', price: [] }),
    ])

    const result = await getPublicTicketTypes(CONF)

    assert(result.status === 'ok')
    expect(result.tickets).toHaveLength(0)
    expect(result.freeTickets.map((t) => t.name)).toEqual(['Free entry'])
  })
})

describe('resolveDisplayTickets', () => {
  const paid = pubTicket({ id: 1, name: 'General' }) as PublicTicketType
  const gratis = pubTicket({
    id: 2,
    name: 'Free entry',
    price: [],
  }) as unknown as PublicTicketType

  it('shows the free types when the event has no priced type', () => {
    const { tickets, free } = resolveDisplayTickets({
      tickets: [],
      freeTickets: [gratis],
    })
    expect(tickets).toEqual([gratis])
    expect(free).toBe(true)
  })

  it('shows only the priced types when the event charges for entry', () => {
    // The deliberate limit: a paid event's zero-priced types are crew/organizer
    // far more often than they are public, so they do NOT join the paid grid.
    const { tickets, free } = resolveDisplayTickets({
      tickets: [paid],
      freeTickets: [gratis],
    })
    expect(tickets).toEqual([paid])
    expect(free).toBe(false)
  })

  it('shows nothing, and does not claim to be free, when there is nothing', () => {
    const { tickets, free } = resolveDisplayTickets({
      tickets: [],
      freeTickets: [],
    })
    expect(tickets).toEqual([])
    expect(free).toBe(false)
  })

  // #860: the organizer's per-type opt-in for a paid event's public free tier.
  describe('publicFreeTicketIds opt-in', () => {
    const student = pubTicket({
      id: 3,
      name: 'Student',
      position: 1,
      price: [],
    }) as unknown as PublicTicketType
    const paidLater = pubTicket({
      id: 4,
      name: 'Late Bird',
      position: 2,
    }) as PublicTicketType

    it('joins an opted-in free type to the paid grid, position-sorted, still not "free"', () => {
      const { tickets, free } = resolveDisplayTickets(
        { tickets: [paid, paidLater], freeTickets: [student] },
        [3],
      )
      expect(tickets.map((t) => t.name)).toEqual([
        'General',
        'Student',
        'Late Bird',
      ])
      expect(free).toBe(false)
    })

    it('keeps a free type hidden unless its id is opted in', () => {
      const { tickets } = resolveDisplayTickets(
        { tickets: [paid], freeTickets: [student, gratis] },
        [3],
      )
      expect(tickets.map((t) => t.name)).toEqual(['General', 'Student'])
    })

    it('ignores a stale id that matches no current free type', () => {
      const { tickets, free } = resolveDisplayTickets(
        { tickets: [paid], freeTickets: [student] },
        [999],
      )
      expect(tickets).toEqual([paid])
      expect(free).toBe(false)
    })

    it('is ignored by an all-free event — every free type shows regardless (#855)', () => {
      const { tickets, free } = resolveDisplayTickets(
        { tickets: [], freeTickets: [student, gratis] },
        [3],
      )
      expect(tickets).toEqual([student, gratis])
      expect(free).toBe(true)
    })

    it('cannot surface an invite-only type: it never enters the freeTickets bucket', async () => {
      // End-to-end over the real bucketing: a crew type flagged invite-only is
      // excluded upstream, so opting its id in matches nothing downstream.
      resolveTicketingProviderMock.mockResolvedValue({
        configured: true,
        provider: {
          fetchPublicTicketTypes: vi.fn().mockResolvedValue({
            event: { id: 7, name: 'Event' },
            tickets: [
              pubTicket({ id: 1, name: 'General' }),
              pubTicket({
                id: 5,
                name: 'Crew',
                price: [],
                requiresInvitation: true,
              }),
            ],
          }),
        },
        eventRef: { customerId: 42, eventId: 7 },
      })
      const result = await getPublicTicketTypes(CONF)
      assert(result.status === 'ok')

      const { tickets } = resolveDisplayTickets(result, [5])
      expect(tickets.map((t) => t.name)).toEqual(['General'])
    })
  })
})

describe('getTicketAvailability', () => {
  const FUTURE = '2999-01-01T00:00:00Z'
  const PAST = '2000-01-01T00:00:00Z'

  function t(over: Record<string, unknown>): PublicTicketType {
    return pubTicket({
      available: null,
      visibleStartsAt: null,
      visibleEndsAt: null,
      type: 'standard',
      ...over,
    }) as unknown as PublicTicketType
  }

  it('is unknown with no tickets at all', () => {
    expect(getTicketAvailability([])).toBe('unknown')
  })

  it('is unknown when every ticket has expired', () => {
    expect(getTicketAvailability([t({ visibleEndsAt: PAST })])).toBe('unknown')
  })

  it('is upcoming when nothing is on sale yet', () => {
    expect(getTicketAvailability([t({ visibleStartsAt: FUTURE })])).toBe(
      'upcoming',
    )
  })

  it('is on-sale when a ticket is inside its window', () => {
    expect(getTicketAvailability([t({})])).toBe('on-sale')
  })

  it('is sold-out only when every active ticket positively reports zero', () => {
    expect(
      getTicketAvailability([t({ available: 0 }), t({ available: 0 })]),
    ).toBe('sold-out')
  })

  it('degrades to on-sale when any active ticket reports an unknown count', () => {
    expect(
      getTicketAvailability([t({ available: 0 }), t({ available: null })]),
    ).toBe('on-sale')
  })

  it('is on-sale when some tickets remain', () => {
    expect(
      getTicketAvailability([t({ available: 0 }), t({ available: 5 })]),
    ).toBe('on-sale')
  })

  it('ignores invitation-only types entirely', () => {
    // An invite-only type with stock left must not mask a public sell-out...
    expect(
      getTicketAvailability([
        t({ available: 0 }),
        t({ available: 10, requiresInvitation: true }),
      ]),
    ).toBe('sold-out')
    // ...and an invite-only type alone is not a public sale.
    expect(
      getTicketAvailability([t({ available: 0, requiresInvitation: true })]),
    ).toBe('unknown')
  })
})
