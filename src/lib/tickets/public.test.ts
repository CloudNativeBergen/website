import { describe, it, expect, vi, beforeEach } from 'vitest'

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

import { getPublicTicketTypes, getTicketAvailability } from './public'
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
    expect(result?.tickets).toHaveLength(1)
  })

  it('soft-fails to null when the conference is unconfigured', async () => {
    resolveTicketingProviderMock.mockResolvedValue({
      configured: false,
      provider: null,
      eventRef: null,
    })
    expect(await getPublicTicketTypes({})).toBeNull()
  })

  it('soft-fails to null (never throws) when the provider fetch errors', async () => {
    resolveTicketingProviderMock.mockResolvedValue({
      configured: true,
      provider: {
        fetchPublicTicketTypes: vi
          .fn()
          .mockRejectedValue(new Error('checkin down')),
      },
      eventRef: { customerId: 42, eventId: 7 },
    })
    expect(await getPublicTicketTypes(CONF)).toBeNull()
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
