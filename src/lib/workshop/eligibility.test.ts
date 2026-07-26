import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EventTicket } from '@/lib/tickets/types'

// B7: eligibility must route through the request-boundary resolver (so a
// tenant's per-org Checkin key is honored) instead of the platform env creds.
const resolveTicketingProviderMock = vi.fn()
vi.mock('@/lib/tickets/provider', () => ({
  resolveTicketingProvider: (...a: unknown[]) =>
    resolveTicketingProviderMock(...a),
}))
vi.mock('@/lib/email/from', () => ({
  platformFallbackContact: () => 'fallback@example.test',
}))

import { checkWorkshopEligibility } from './eligibility'

function ticket(email: string, category: string): EventTicket {
  return {
    category,
    crm: { email },
  } as unknown as EventTicket
}

const CONF = {
  checkinCustomerId: 42,
  checkinEventId: 7,
  organization: { _ref: 'org-xyz' },
}

beforeEach(() => vi.clearAllMocks())

describe('checkWorkshopEligibility — resolver routing (B7)', () => {
  it('resolves the provider from the conference (per-org creds seam) and honors eligible tickets', async () => {
    const fetchEventTickets = vi
      .fn()
      .mockResolvedValue([ticket('SpeakeR@x.test', 'Speaker ticket')])
    resolveTicketingProviderMock.mockResolvedValue({
      configured: true,
      provider: { fetchEventTickets },
      eventRef: { customerId: 42, eventId: 7 },
    })

    const result = await checkWorkshopEligibility({
      userEmail: 'speaker@x.test',
      conference: CONF,
    })

    // The whole conference (with its org ref) is handed to the resolver.
    expect(resolveTicketingProviderMock).toHaveBeenCalledWith(CONF)
    // And the resolved eventRef — not raw params — drives the fetch.
    expect(fetchEventTickets).toHaveBeenCalledWith({
      customerId: 42,
      eventId: 7,
    })
    expect(result.isEligible).toBe(true)
    expect(result.eligibleTickets).toHaveLength(1)
  })

  it('soft-fails to “unable to verify” when the conference is unconfigured', async () => {
    resolveTicketingProviderMock.mockResolvedValue({
      configured: false,
      provider: null,
      eventRef: null,
    })

    const result = await checkWorkshopEligibility({
      userEmail: 'speaker@x.test',
      conference: {},
      contactEmail: 'help@x.test',
    })

    expect(result.isEligible).toBe(false)
    expect(result.reason).toContain('help@x.test')
    expect(result.tickets).toEqual([])
  })

  it('soft-fails (never throws) when the provider fetch errors', async () => {
    resolveTicketingProviderMock.mockResolvedValue({
      configured: true,
      provider: {
        fetchEventTickets: vi.fn().mockRejectedValue(new Error('checkin down')),
      },
      eventRef: { customerId: 42, eventId: 7 },
    })

    const result = await checkWorkshopEligibility({
      userEmail: 'speaker@x.test',
      conference: CONF,
    })

    expect(result.isEligible).toBe(false)
    expect(result.reason).toContain('Unable to verify')
  })
})
