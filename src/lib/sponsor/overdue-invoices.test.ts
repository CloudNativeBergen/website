import { describe, it, expect } from 'vitest'
import { osloTodayDateString } from '@/lib/time'
import {
  buildOverdueInvoicesMessage,
  selectOverdueInvoices,
  shouldRemind,
  type InvoiceRow,
} from './overdue-invoices'

const row = (over: Partial<InvoiceRow> = {}): InvoiceRow => ({
  sponsorName: 'Acme',
  invoiceStatus: 'sent',
  invoiceDueAt: '2026-10-01',
  invoicePaidAt: null,
  contractValue: 50000,
  contractCurrency: 'NOK',
  ...over,
})

describe('shouldRemind', () => {
  it('reminds on day 1 and every 7th day', () => {
    const days = Array.from({ length: 30 }, (_, i) => i - 1).filter(
      shouldRemind,
    )
    expect(days).toEqual([1, 7, 14, 21, 28])
  })
})

describe('selectOverdueInvoices', () => {
  it('lists a sent invoice one day past due', () => {
    expect(selectOverdueInvoices([row()], '2026-10-02')).toEqual([
      {
        sponsorName: 'Acme',
        amount: expect.stringContaining('50'),
        daysOverdue: 1,
      },
    ])
  })

  it('treats the due date itself as not overdue', () => {
    expect(selectOverdueInvoices([row()], '2026-10-01')).toEqual([])
  })

  it('skips paid, unsent, cancelled and undated invoices', () => {
    const today = '2026-10-08'
    expect(
      selectOverdueInvoices(
        [
          row({ invoiceStatus: 'paid' }),
          row({ invoicePaidAt: '2026-10-03T10:00:00Z' }),
          row({ invoiceStatus: 'not-sent' }),
          row({ invoiceStatus: 'cancelled' }),
          row({ invoiceDueAt: null }),
        ],
        today,
      ),
    ).toEqual([])
    expect(
      selectOverdueInvoices([row({ invoiceStatus: 'overdue' })], today),
    ).toHaveLength(1)
  })

  it('stays quiet between cadence days', () => {
    expect(selectOverdueInvoices([row()], '2026-10-04')).toEqual([])
    expect(selectOverdueInvoices([row()], '2026-10-15')[0].daysOverdue).toBe(14)
  })

  it('uses the Oslo date at the UTC midnight boundary', () => {
    // 23:30 UTC on 1 Oct is already 2 Oct in Oslo (CEST): day 1 overdue.
    const today = osloTodayDateString(new Date('2026-10-01T23:30:00Z'))
    expect(today).toBe('2026-10-02')
    expect(selectOverdueInvoices([row()], today)).toHaveLength(1)
    // Across the DST change (25 Oct) day counts stay whole.
    expect(
      selectOverdueInvoices(
        [row({ invoiceDueAt: '2026-10-21' })],
        '2026-10-28',
      ),
    ).toHaveLength(1)
  })
})

describe('buildOverdueInvoicesMessage', () => {
  it('lists sponsor, amount and days, and links to the invoice page', () => {
    const msg = buildOverdueInvoicesMessage(
      [
        { sponsorName: 'A<b>', amount: 'kr 1 000', daysOverdue: 1 },
        { sponsorName: 'Beta', amount: 'amount not set', daysOverdue: 14 },
      ],
      'https://example.com',
    )
    expect(msg.text).toBe('💸 2 overdue sponsor invoices')
    const json = JSON.stringify(msg.blocks)
    expect(json).toContain('kr 1 000, 1 day overdue')
    expect(json).toContain('*Beta*: amount not set, 14 days overdue')
    expect(json).toContain('A&lt;b&gt;')
    expect(json).toContain('https://example.com/admin/sponsors/invoices')
  })
})
