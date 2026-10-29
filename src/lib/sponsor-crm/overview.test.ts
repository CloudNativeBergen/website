import { describe, it, expect } from 'vitest'
import { mockSponsor } from '@/__mocks__/sponsor-data'
import {
  boardActionHref,
  organizerWorklist,
  sponsorHasAction,
} from './action-items'
import {
  actionTypeCounts,
  moneyTotals,
  pipelineStageTotals,
  tierCapacity,
} from './overview'

const me = { _id: 'me', name: 'Me', email: 'me@x.no' }
const other = { _id: 'other', name: 'Other', email: 'o@x.no' }
// EUR at 10 NOK, so the conversion is visible in the sums.
const toNOK = (amount: number, currency: string) =>
  currency === 'EUR' ? amount * 10 : amount

describe('organizerWorklist', () => {
  it('keeps mine and unassigned sponsors, most urgent first', () => {
    const items = organizerWorklist(
      [
        mockSponsor({ _id: 'mine', assignedTo: me, invoiceStatus: 'overdue' }),
        mockSponsor({
          _id: 'theirs',
          assignedTo: other,
          invoiceStatus: 'overdue',
        }),
        mockSponsor({ _id: 'nobody' }),
      ],
      'me',
    )
    const ids = new Set(items.map((i) => i.sponsor.id))
    expect(ids).toEqual(new Set(['mine', 'nobody']))
    expect(items[0]).toMatchObject({ type: 'overdue', sponsor: { id: 'mine' } })
    expect(items.map((i) => i.priority)).toEqual(
      [...items.map((i) => i.priority)].sort((a, b) => a - b),
    )
  })
})

describe('actionTypeCounts', () => {
  it('counts per type with plural labels and skips renewals', () => {
    const items = organizerWorklist(
      [
        mockSponsor({ _id: 'a', invoiceStatus: 'overdue' }),
        mockSponsor({ _id: 'b', invoiceStatus: 'overdue' }),
      ],
      'me',
      {
        edition: { title: '2025', origin: null },
        candidates: [{ _id: 'old', name: 'Old Co' }],
      },
    )
    const counts = actionTypeCounts(items)
    expect(counts[0]).toEqual({
      type: 'overdue',
      count: 2,
      label: '2 overdue invoices',
    })
    expect(counts.find((c) => c.type === 'unassigned')?.label).toBe(
      '2 no owner',
    )
    expect(counts.find((c) => c.type === 'follow-up')).toBeUndefined()
  })

  it('links each type to the board filter', () => {
    expect(boardActionHref('overdue')).toBe(
      '/admin/sponsors/crm?action=overdue',
    )
    expect(boardActionHref('all')).toBe('/admin/sponsors/crm?action=all')
  })
})

describe('sponsorHasAction', () => {
  it('matches only sponsors with an open item of the type', () => {
    const late = mockSponsor({ invoiceStatus: 'overdue', assignedTo: me })
    const fine = mockSponsor({
      assignedTo: me,
      _updatedAt: new Date().toISOString(),
    })
    expect(sponsorHasAction(late, 'overdue')).toBe(true)
    expect(sponsorHasAction(fine, 'overdue')).toBe(false)
    expect(sponsorHasAction(late, 'all')).toBe(true)
    expect(sponsorHasAction(fine, 'all')).toBe(false)
  })
})

describe('pipelineStageTotals', () => {
  it('counts and sums each stage in NOK', () => {
    const stages = pipelineStageTotals(
      [
        mockSponsor({ status: 'prospect', contractValue: 1000 }),
        mockSponsor({
          status: 'prospect',
          contractValue: 100,
          contractCurrency: 'EUR',
        }),
        mockSponsor({ status: 'closed-won', contractValue: 5000 }),
      ],
      toNOK,
    )
    expect(stages.map((s) => [s.status, s.count, s.value])).toEqual([
      ['prospect', 2, 2000],
      ['contacted', 0, 0],
      ['negotiating', 0, 0],
      ['closed-won', 1, 5000],
      ['closed-lost', 0, 0],
    ])
  })
})

describe('moneyTotals', () => {
  it('puts each deal in one bucket, past-due sent invoices as overdue', () => {
    const now = new Date('2026-10-29T12:00:00Z')
    const totals = moneyTotals(
      [
        mockSponsor({
          contractStatus: 'contract-signed',
          contractValue: 100,
        }),
        mockSponsor({ invoiceStatus: 'sent', contractValue: 200 }),
        mockSponsor({
          invoiceStatus: 'sent',
          invoiceDueAt: '2026-10-01',
          contractValue: 400,
        }),
        mockSponsor({ invoiceStatus: 'overdue', contractValue: 800 }),
        mockSponsor({
          invoiceStatus: 'paid',
          contractValue: 10,
          contractCurrency: 'EUR',
        }),
        mockSponsor({
          status: 'closed-lost',
          invoiceStatus: 'paid',
          contractValue: 9999,
        }),
      ],
      toNOK,
      now,
    )
    expect(totals).toEqual({
      signed: 100,
      invoiced: 200,
      paid: 100,
      overdue: 1200,
    })
  })
})

describe('tierCapacity', () => {
  it('counts won deals in capped tiers against the caps', () => {
    const won = mockSponsor({ status: 'closed-won' })
    expect(
      tierCapacity(
        [won, mockSponsor({ status: 'prospect' })],
        [
          { _id: won.tier!._id, maxQuantity: 4 },
          { _id: 'uncapped', maxQuantity: null },
        ],
      ),
    ).toEqual({ used: 1, total: 4 })
  })
})
