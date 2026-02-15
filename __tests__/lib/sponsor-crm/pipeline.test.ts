import { describe, it, expect } from '@jest/globals'
import { aggregateSponsorPipeline } from '@/lib/sponsor-crm/pipeline'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'

function createSponsor(
  overrides: Partial<SponsorForConferenceExpanded> = {},
): SponsorForConferenceExpanded {
  return {
    _id: 'sfc-1',
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: '2026-01-01T00:00:00Z',
    sponsor: {
      _id: 's1',
      name: 'Test',
      website: 'https://test.com',
      logo: '<svg></svg>',
    },
    conference: { _id: 'c1', title: 'Conf' },
    contractStatus: 'none',
    status: 'prospect',
    invoiceStatus: 'not-sent',
    contractCurrency: 'NOK',
    ...overrides,
  }
}

describe('aggregateSponsorPipeline', () => {
  it('handles empty array', () => {
    const result = aggregateSponsorPipeline([])

    expect(result.totalSponsors).toBe(0)
    expect(result.closedWonCount).toBe(0)
    expect(result.closedLostCount).toBe(0)
    expect(result.activeDeals).toBe(0)
    expect(result.totalContractValue).toBe(0)
    expect(result.contractCurrency).toBe('NOK')
  })

  describe('status counting', () => {
    it('counts sponsors by pipeline status', () => {
      const sponsors = [
        createSponsor({ _id: 'a', status: 'prospect' }),
        createSponsor({ _id: 'b', status: 'prospect' }),
        createSponsor({ _id: 'c', status: 'contacted' }),
        createSponsor({ _id: 'd', status: 'negotiating' }),
        createSponsor({ _id: 'e', status: 'closed-won' }),
      ]
      const result = aggregateSponsorPipeline(sponsors)

      expect(result.byStatus['prospect']).toBe(2)
      expect(result.byStatus['contacted']).toBe(1)
      expect(result.byStatus['negotiating']).toBe(1)
      expect(result.byStatus['closed-won']).toBe(1)
      expect(result.totalSponsors).toBe(5)
    })

    it('counts sponsors by contract status', () => {
      const sponsors = [
        createSponsor({ _id: 'a', contractStatus: 'none' }),
        createSponsor({ _id: 'b', contractStatus: 'none' }),
        createSponsor({ _id: 'c', contractStatus: 'contract-sent' }),
        createSponsor({ _id: 'd', contractStatus: 'contract-signed' }),
      ]
      const result = aggregateSponsorPipeline(sponsors)

      expect(result.byContractStatus['none']).toBe(2)
      expect(result.byContractStatus['contract-sent']).toBe(1)
      expect(result.byContractStatus['contract-signed']).toBe(1)
    })

    it('counts sponsors by invoice status', () => {
      const sponsors = [
        createSponsor({ _id: 'a', invoiceStatus: 'not-sent' }),
        createSponsor({ _id: 'b', invoiceStatus: 'sent' }),
        createSponsor({ _id: 'c', invoiceStatus: 'paid' }),
        createSponsor({ _id: 'd', invoiceStatus: 'overdue' }),
      ]
      const result = aggregateSponsorPipeline(sponsors)

      expect(result.byInvoiceStatus['not-sent']).toBe(1)
      expect(result.byInvoiceStatus['sent']).toBe(1)
      expect(result.byInvoiceStatus['paid']).toBe(1)
      expect(result.byInvoiceStatus['overdue']).toBe(1)
    })
  })

  describe('value aggregation', () => {
    it('sums contract values for closed-won sponsors only', () => {
      const sponsors = [
        createSponsor({
          _id: 'a',
          status: 'closed-won',
          contractValue: 50000,
        }),
        createSponsor({
          _id: 'b',
          status: 'closed-won',
          contractValue: 75000,
        }),
        createSponsor({
          _id: 'c',
          status: 'negotiating',
          contractValue: 100000,
        }),
      ]
      const result = aggregateSponsorPipeline(sponsors)

      expect(result.totalContractValue).toBe(125000)
    })

    it('ignores closed-won sponsors without contractValue', () => {
      const sponsors = [
        createSponsor({
          _id: 'a',
          status: 'closed-won',
          contractValue: 50000,
        }),
        createSponsor({
          _id: 'b',
          status: 'closed-won',
        }),
      ]
      const result = aggregateSponsorPipeline(sponsors)

      expect(result.totalContractValue).toBe(50000)
    })

    it('tracks value by status', () => {
      const sponsors = [
        createSponsor({
          _id: 'a',
          status: 'prospect',
          contractValue: 30000,
        }),
        createSponsor({
          _id: 'b',
          status: 'closed-won',
          contractValue: 50000,
        }),
      ]
      const result = aggregateSponsorPipeline(sponsors)

      expect(result.byStatusValue['prospect']).toBe(30000)
      expect(result.byStatusValue['closed-won']).toBe(50000)
    })
  })

  describe('deal tracking', () => {
    it('counts closed-won and closed-lost separately', () => {
      const sponsors = [
        createSponsor({ _id: 'a', status: 'closed-won' }),
        createSponsor({ _id: 'b', status: 'closed-won' }),
        createSponsor({ _id: 'c', status: 'closed-lost' }),
      ]
      const result = aggregateSponsorPipeline(sponsors)

      expect(result.closedWonCount).toBe(2)
      expect(result.closedLostCount).toBe(1)
    })

    it('calculates active deals as sum of prospect + contacted + negotiating', () => {
      const sponsors = [
        createSponsor({ _id: 'a', status: 'prospect' }),
        createSponsor({ _id: 'b', status: 'contacted' }),
        createSponsor({ _id: 'c', status: 'negotiating' }),
        createSponsor({ _id: 'd', status: 'closed-won' }),
        createSponsor({ _id: 'e', status: 'closed-lost' }),
      ]
      const result = aggregateSponsorPipeline(sponsors)

      expect(result.activeDeals).toBe(3)
    })
  })

  describe('currency handling', () => {
    it('uses first sponsor currency as default', () => {
      const sponsors = [
        createSponsor({ _id: 'a', contractCurrency: 'USD' }),
        createSponsor({ _id: 'b', contractCurrency: 'EUR' }),
      ]
      const result = aggregateSponsorPipeline(sponsors)

      expect(result.contractCurrency).toBe('USD')
    })

    it('defaults to NOK for empty array', () => {
      const result = aggregateSponsorPipeline([])
      expect(result.contractCurrency).toBe('NOK')
    })
  })
})
