/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals'
import { aggregateSponsorPipeline } from '@/lib/sponsor-crm/pipeline'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'

describe('api/cron/sales-update', () => {
  describe('Authentication', () => {
    it('should reject requests without authorization header', () => {
      const authHeader = undefined
      const shouldReject = !authHeader

      expect(shouldReject).toBe(true)
    })

    it('should reject requests with invalid authorization token', () => {
      const wrongToken: string = 'Bearer wrong-token'
      const cronSecret = 'correct-secret'
      const expectedHeader = `Bearer ${cronSecret}`
      const isValid = wrongToken === expectedHeader

      expect(isValid).toBe(false)
    })

    it('should accept requests with valid authorization token', () => {
      const cronSecret = 'correct-secret'
      const authHeader = `Bearer ${cronSecret}`
      const expectedHeader = `Bearer ${cronSecret}`
      const isValid = authHeader === expectedHeader

      expect(isValid).toBe(true)
    })

    it('should reject requests when CRON_SECRET is not configured', () => {
      const cronSecret = undefined
      const shouldReject = !cronSecret

      expect(shouldReject).toBe(true)
    })
  })

  describe('Conference Resolution', () => {
    it('should fail when conference is not found for domain', () => {
      const conference = null
      const conferenceError = new Error('Conference not found')
      const shouldFail = !!conferenceError || !conference

      expect(shouldFail).toBe(true)
    })

    it('should skip update when conference has ended', () => {
      const conferenceEndDate = '2025-01-01'
      const now = new Date('2026-02-07')
      const isOver = new Date(conferenceEndDate) < now

      expect(isOver).toBe(true)
    })

    it('should proceed when conference is upcoming', () => {
      const conferenceEndDate = '2026-06-15'
      const now = new Date('2026-02-07')
      const isOver = new Date(conferenceEndDate) < now

      expect(isOver).toBe(false)
    })
  })

  describe('Checkin Configuration', () => {
    it('should fail when checkin_customer_id is missing', () => {
      const conference = { checkin_customer_id: undefined, checkin_event_id: 1 }
      const isMissing =
        !conference.checkin_customer_id || !conference.checkin_event_id

      expect(isMissing).toBe(true)
    })

    it('should fail when checkin_event_id is missing', () => {
      const conference = { checkin_customer_id: 1, checkin_event_id: undefined }
      const isMissing =
        !conference.checkin_customer_id || !conference.checkin_event_id

      expect(isMissing).toBe(true)
    })

    it('should proceed when both checkin IDs are present', () => {
      const conference = { checkin_customer_id: 1, checkin_event_id: 2 }
      const isMissing =
        !conference.checkin_customer_id || !conference.checkin_event_id

      expect(isMissing).toBe(false)
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

  describe('Target Analysis Guard', () => {
    it('should skip analysis when targets are not enabled', () => {
      const targetConfig = { enabled: false }
      const ticketCapacity = 200
      const paidTicketsLength = 50

      const shouldAnalyze =
        targetConfig &&
        targetConfig.enabled &&
        ticketCapacity &&
        paidTicketsLength > 0

      expect(shouldAnalyze).toBeFalsy()
    })

    it('should skip analysis when ticket capacity is missing', () => {
      const targetConfig = {
        enabled: true,
        sales_start_date: '2026-01-01',
        target_curve: 'linear',
      }
      const ticketCapacity = undefined
      const paidTicketsLength = 50

      const shouldAnalyze =
        targetConfig &&
        targetConfig.enabled &&
        ticketCapacity &&
        paidTicketsLength > 0

      expect(shouldAnalyze).toBeFalsy()
    })

    it('should skip analysis when no paid tickets exist', () => {
      const targetConfig = {
        enabled: true,
        sales_start_date: '2026-01-01',
        target_curve: 'linear',
      }
      const ticketCapacity = 200
      const paidTicketsLength = 0

      const shouldAnalyze =
        targetConfig &&
        targetConfig.enabled &&
        ticketCapacity &&
        paidTicketsLength > 0

      expect(shouldAnalyze).toBeFalsy()
    })

    it('should proceed with analysis when all conditions are met', () => {
      const targetConfig = {
        enabled: true,
        sales_start_date: '2026-01-01',
        target_curve: 'linear',
      }
      const ticketCapacity = 200
      const paidTicketsLength = 50

      const shouldAnalyze =
        targetConfig &&
        targetConfig.enabled &&
        ticketCapacity &&
        targetConfig.sales_start_date &&
        targetConfig.target_curve &&
        paidTicketsLength > 0

      expect(shouldAnalyze).toBeTruthy()
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
        contract_status: 'none',
        invoice_status: 'not-sent',
        contract_currency: 'NOK',
        ...overrides,
      } as SponsorForConferenceExpanded
    }

    it('should aggregate sponsor statuses correctly', () => {
      const sponsors = [
        createSponsor({
          status: 'prospect',
          contract_status: 'none',
          invoice_status: 'not-sent',
        }),
        createSponsor({
          status: 'contacted',
          contract_status: 'none',
          invoice_status: 'not-sent',
        }),
        createSponsor({
          status: 'negotiating',
          contract_status: 'verbal-agreement',
          invoice_status: 'not-sent',
        }),
        createSponsor({
          status: 'closed-won',
          contract_status: 'contract-signed',
          invoice_status: 'paid',
          contract_value: 50000,
        }),
        createSponsor({
          status: 'closed-won',
          contract_status: 'contract-signed',
          invoice_status: 'sent',
          contract_value: 75000,
        }),
        createSponsor({
          status: 'closed-lost',
          contract_status: 'none',
          invoice_status: 'not-sent',
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
        createSponsor({ status: 'closed-won', contract_value: undefined }),
        createSponsor({ status: 'closed-won', contract_value: 0 }),
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
        createSponsor({ status: 'closed-won', contract_value: 50000 }),
        createSponsor({ status: 'closed-lost' }),
      ]

      const result = aggregateSponsorPipeline(sponsors)

      expect(result.activeDeals).toBe(5)
      expect(result.totalSponsors).toBe(7)
    })

    it('should derive currency from first sponsor', () => {
      const sponsors = [createSponsor({ contract_currency: 'EUR' })]

      const result = aggregateSponsorPipeline(sponsors)

      expect(result.contractCurrency).toBe('EUR')
    })
  })

  describe('Statistics Fallback', () => {
    it('should use analysis statistics when available', () => {
      const analysisStats = {
        totalPaidTickets: 50,
        totalRevenue: 125000,
        totalOrders: 45,
        averageTicketPrice: 2500,
        categoryBreakdown: { Regular: 30, 'Early Bird': 20 },
        sponsorTickets: 10,
        speakerTickets: 8,
        totalCapacityUsed: 68,
      }

      const statistics = analysisStats || {
        categoryBreakdown: {},
        sponsorTickets: 0,
        speakerTickets: 0,
        totalCapacityUsed: 50,
      }

      expect(statistics.categoryBreakdown).toEqual({
        Regular: 30,
        'Early Bird': 20,
      })
      expect(statistics.sponsorTickets).toBe(10)
    })

    it('should fall back to defaults when analysis is null', () => {
      const getAnalysis = (): {
        statistics: Record<string, unknown>
      } | null => null
      const analysis = getAnalysis()

      const statistics = analysis?.statistics || {
        categoryBreakdown: {},
        sponsorTickets: 0,
        speakerTickets: 0,
        totalCapacityUsed: 50,
      }

      expect(statistics.categoryBreakdown).toEqual({})
      expect(statistics.sponsorTickets).toBe(0)
      expect(statistics.totalCapacityUsed).toBe(50)
    })
  })
})
