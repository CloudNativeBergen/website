/**
 * @vitest-environment node
 */
import { aggregateSponsorPipeline } from '@/lib/sponsor-crm/pipeline'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import { isConferenceOver } from '@/lib/conference/state'
import { createMockConference } from '../../testdata/conference'

describe('api/cron/weekly-update', () => {
  describe('Conference State', () => {
    it('should detect conference has ended', () => {
      const conference = createMockConference({
        endDate: '2025-01-01',
      })
      expect(isConferenceOver(conference)).toBe(true)
    })

    it('should detect conference is upcoming', () => {
      const conference = createMockConference({
        endDate: '2099-06-15',
      })
      expect(isConferenceOver(conference)).toBe(false)
    })
  })

  describe('Ticket Splitting', () => {
    it('should separate paid and free tickets correctly', () => {
      const tickets = [
        { sum: '100' },
        { sum: '0' },
        { sum: '250' },
        { sum: '0' },
        { sum: '75' },
      ]

      const paidTickets = tickets.filter((t) => parseFloat(t.sum) > 0)
      const freeTickets = tickets.filter((t) => parseFloat(t.sum) === 0)

      expect(paidTickets.length).toBe(3)
      expect(freeTickets.length).toBe(2)
    })

    it('should handle all paid tickets', () => {
      const tickets = [{ sum: '100' }, { sum: '200' }]

      const paidTickets = tickets.filter((t) => parseFloat(t.sum) > 0)
      const freeTickets = tickets.filter((t) => parseFloat(t.sum) === 0)

      expect(paidTickets.length).toBe(2)
      expect(freeTickets.length).toBe(0)
    })

    it('should handle all free tickets', () => {
      const tickets = [{ sum: '0' }, { sum: '0' }]

      const paidTickets = tickets.filter((t) => parseFloat(t.sum) > 0)
      const freeTickets = tickets.filter((t) => parseFloat(t.sum) === 0)

      expect(paidTickets.length).toBe(0)
      expect(freeTickets.length).toBe(2)
    })

    it('should handle empty ticket list', () => {
      const tickets: { sum: string }[] = []

      const paidTickets = tickets.filter((t) => parseFloat(t.sum) > 0)
      const freeTickets = tickets.filter((t) => parseFloat(t.sum) === 0)

      expect(paidTickets.length).toBe(0)
      expect(freeTickets.length).toBe(0)
    })
  })

  describe('Sponsor Pipeline Aggregation', () => {
    function createSponsor(
      overrides: Partial<SponsorForConferenceExpanded>,
    ): SponsorForConferenceExpanded {
      return {
        _id: 'sfc-1',
        _createdAt: '2026-01-01',
        _updatedAt: '2026-01-01',
        sponsor: { _id: 's1', name: 'Sponsor', website: '', logo: '' },
        conference: { _id: 'c1', title: 'Conf' },
        status: 'prospect',
        contractStatus: 'none',
        invoiceStatus: 'not-sent',
        contractCurrency: 'NOK',
        ...overrides,
      } as SponsorForConferenceExpanded
    }

    it('should aggregate sponsor statuses correctly', () => {
      const sponsors = [
        createSponsor({
          status: 'prospect',
          contractStatus: 'none',
          invoiceStatus: 'not-sent',
        }),
        createSponsor({
          status: 'contacted',
          contractStatus: 'none',
          invoiceStatus: 'not-sent',
        }),
        createSponsor({
          status: 'negotiating',
          contractStatus: 'verbal-agreement',
          invoiceStatus: 'not-sent',
        }),
        createSponsor({
          status: 'closed-won',
          contractStatus: 'contract-signed',
          invoiceStatus: 'paid',
          contractValue: 50000,
        }),
        createSponsor({
          status: 'closed-won',
          contractStatus: 'contract-signed',
          invoiceStatus: 'sent',
          contractValue: 75000,
        }),
        createSponsor({
          status: 'closed-lost',
          contractStatus: 'none',
          invoiceStatus: 'not-sent',
        }),
      ]

      const result = aggregateSponsorPipeline(sponsors)

      expect(result.byStatus['prospect']).toBe(1)
      expect(result.byStatus['contacted']).toBe(1)
      expect(result.byStatus['negotiating']).toBe(1)
      expect(result.byStatus['closed-won']).toBe(2)
      expect(result.byStatus['closed-lost']).toBe(1)
      expect(result.closedWonCount).toBe(2)
      expect(result.closedLostCount).toBe(1)
      expect(result.totalContractValue).toBe(125000)
      expect(result.activeDeals).toBe(3)
      expect(result.totalSponsors).toBe(6)
    })

    it('should handle sponsors without contract values', () => {
      const sponsors = [
        createSponsor({ status: 'closed-won', contractValue: undefined }),
        createSponsor({ status: 'closed-won', contractValue: 0 }),
      ]

      const result = aggregateSponsorPipeline(sponsors)

      expect(result.totalContractValue).toBe(0)
      expect(result.closedWonCount).toBe(2)
    })

    it('should count active deals correctly', () => {
      const sponsors = [
        createSponsor({ status: 'prospect' }),
        createSponsor({ status: 'prospect' }),
        createSponsor({ status: 'contacted' }),
        createSponsor({ status: 'negotiating' }),
        createSponsor({ status: 'negotiating' }),
        createSponsor({ status: 'closed-won', contractValue: 50000 }),
        createSponsor({ status: 'closed-lost' }),
      ]

      const result = aggregateSponsorPipeline(sponsors)

      expect(result.activeDeals).toBe(5)
      expect(result.totalSponsors).toBe(7)
    })

    it('should derive currency from first sponsor', () => {
      const sponsors = [createSponsor({ contractCurrency: 'EUR' })]

      const result = aggregateSponsorPipeline(sponsors)

      expect(result.contractCurrency).toBe('EUR')
    })
  })
})
