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

import { getPublicTicketTypes } from './public'

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
  it('resolves from the conference and fetches with the resolved eventId', async () => {
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
    expect(fetchPublicTicketTypes).toHaveBeenCalledWith(7)
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
