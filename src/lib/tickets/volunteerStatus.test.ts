import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EventTicket } from '@/lib/tickets/types'

const resolveTicketingProviderMock = vi.fn()
vi.mock('@/lib/tickets/provider', () => ({
  resolveTicketingProvider: (...a: unknown[]) =>
    resolveTicketingProviderMock(...a),
}))

import {
  __resetRedeemedCache,
  toTicketCandidates,
} from '@/lib/tickets/speakerStatus'
import {
  findVolunteerTicketType,
  redeemedVolunteerEmails,
  joinVolunteerTicketStatus,
  fetchRedeemedVolunteerEmails,
  __resetVolunteerTicketTypeCache,
} from './volunteerStatus'

function ticket(
  email: string | null,
  category: string,
  orderId = 100,
  id = 1,
): EventTicket {
  return {
    id,
    order_id: orderId,
    category,
    crm: { email },
  } as unknown as EventTicket
}

const CONF = {
  checkinCustomerId: 42,
  checkinEventId: 7,
  organization: { _ref: 'org-xyz' },
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetRedeemedCache()
  __resetVolunteerTicketTypeCache()
})

describe('volunteerStatus', () => {
  describe('findVolunteerTicketType', () => {
    it('matches English and Norwegian volunteer ticket names and prefers invitation-gated then lowest position', () => {
      expect(
        findVolunteerTicketType([
          { name: 'Conference Pass', requiresInvitation: false, position: 1 },
          { name: 'Frivillig', requiresInvitation: false, position: 2 },
          { name: 'Volunteer ticket', requiresInvitation: true, position: 5 },
        ]),
      ).toEqual({
        name: 'Volunteer ticket',
        requiresInvitation: true,
        position: 5,
      })

      expect(
        findVolunteerTicketType([
          { name: 'Volunteer late', requiresInvitation: false, position: 4 },
          { name: 'Frivilligbillett', requiresInvitation: false, position: 1 },
        ]),
      ).toEqual({
        name: 'Frivilligbillett',
        requiresInvitation: false,
        position: 1,
      })
    })
  })

  describe('redeemedVolunteerEmails', () => {
    it('collects only volunteer/frivillig categories and keeps the highest orderId per normalized email', () => {
      const candidates = toTicketCandidates([
        ticket('Ada@Example.com ', 'Conference Pass', 10, 1),
        ticket('Ada@Example.com ', 'Volunteer Ticket', 20, 2),
        ticket('ada@example.com', 'Frivillig', 35, 3),
        ticket('bob@example.com', 'Speaker ticket', 40, 4),
      ])

      const redeemed = redeemedVolunteerEmails(candidates)
      expect([...redeemed.keys()]).toEqual(['ada@example.com'])
      expect(redeemed.get('ada@example.com')?.orderId).toBe(35)
      expect(redeemed.get('ada@example.com')?.category).toBe('Frivillig')
    })
  })

  describe('joinVolunteerTicketStatus', () => {
    it('maps volunteers to redeemed, invited, not-invited, and unknown states with Checkin manageUrl', () => {
      const candidates = toTicketCandidates([
        ticket('claimed@example.com', 'Volunteer Ticket', 555, 99),
      ])
      const redeemed = redeemedVolunteerEmails(candidates)

      const volunteers = [
        {
          _id: 'vol-1',
          email: 'Claimed@Example.com',
          approvalEmailSentAt: '2026-03-01T10:00:00.000Z',
        },
        {
          _id: 'vol-2',
          email: 'invited@example.com',
          approvalEmailSentAt: '2026-03-02T12:00:00.000Z',
        },
        {
          _id: 'vol-3',
          email: 'pending@example.com',
          approvalEmailSentAt: null,
        },
      ]

      const statuses = joinVolunteerTicketStatus(volunteers, redeemed, CONF)
      expect(statuses).toEqual([
        {
          volunteerId: 'vol-1',
          state: 'redeemed',
          invitedAt: '2026-03-01T10:00:00.000Z',
          ticketId: 99,
          orderId: 555,
          category: 'Volunteer Ticket',
          manageUrl:
            'https://app.checkin.no/customer/42/event/7/orders/order?id=555',
        },
        {
          volunteerId: 'vol-2',
          state: 'invited',
          invitedAt: '2026-03-02T12:00:00.000Z',
          ticketId: undefined,
          orderId: undefined,
          category: undefined,
          manageUrl: undefined,
        },
        {
          volunteerId: 'vol-3',
          state: 'not-invited',
          invitedAt: undefined,
          ticketId: undefined,
          orderId: undefined,
          category: undefined,
          manageUrl: undefined,
        },
      ])

      const unknownStatuses = joinVolunteerTicketStatus(volunteers, null, CONF)
      expect(unknownStatuses.map((s) => s.state)).toEqual([
        'unknown',
        'unknown',
        'unknown',
      ])

      const titoStatuses = joinVolunteerTicketStatus(volunteers, redeemed, {
        ...CONF,
        ticketingProvider: 'tito',
      })
      expect(titoStatuses[0].manageUrl).toBeUndefined()
    })
  })

  describe('fetchRedeemedVolunteerEmails', () => {
    it('reads from the shared ticket candidate cache and returns null when provider is unconfigured', async () => {
      resolveTicketingProviderMock.mockResolvedValueOnce({
        configured: false,
      })
      expect(await fetchRedeemedVolunteerEmails(CONF)).toBeNull()

      resolveTicketingProviderMock.mockResolvedValueOnce({
        configured: true,
        eventRef: { customerId: 42, eventId: 7 },
        provider: {
          fetchEventTickets: vi
            .fn()
            .mockResolvedValue([
              ticket('vol@example.com', 'Volunteer', 777, 12),
            ]),
        },
      })
      const redeemed = await fetchRedeemedVolunteerEmails(CONF)
      expect(redeemed?.get('vol@example.com')?.orderId).toBe(777)
    })
  })
})
