import { describe, it, expect } from 'vitest'
import {
  evaluateInvoiceReadiness,
  toInvoiceRow,
  totalsByCurrency,
} from './invoice'
import { buildInvoicesCsv, invoicesCsvFilename } from './invoice-csv'
import {
  mockSponsor,
  mockBillingInfo,
  mockSponsorTier,
} from '@/__mocks__/sponsor-data'
import type { SponsorForConferenceExpanded } from './types'

/** A deal that is fully ready to invoice, as the baseline to break. */
function invoiceable(
  overrides: Partial<SponsorForConferenceExpanded> = {},
): SponsorForConferenceExpanded {
  return mockSponsor({
    status: 'closed-won',
    contractStatus: 'contract-signed',
    contractValue: 50000,
    contractCurrency: 'NOK',
    billing: mockBillingInfo({ invoiceFormat: 'pdf' }),
    ...overrides,
  })
}

const blockerFields = (sfc: SponsorForConferenceExpanded) =>
  evaluateInvoiceReadiness(sfc).blockers.map((blocker) => blocker.field)

describe('evaluateInvoiceReadiness', () => {
  it('passes a signed, priced deal with complete billing', () => {
    expect(evaluateInvoiceReadiness(invoiceable())).toEqual({
      ready: true,
      blockers: [],
    })
  })

  it('blocks a deal with no amount anywhere', () => {
    const sfc = invoiceable({ contractValue: undefined, tier: undefined })

    expect(blockerFields(sfc)).toEqual(['contractValue'])
  })

  it('accepts a tier price when no value was negotiated', () => {
    const sfc = invoiceable({ contractValue: undefined })

    expect(evaluateInvoiceReadiness(sfc).ready).toBe(true)
  })

  it('blocks an unsigned contract', () => {
    const sfc = invoiceable({ contractStatus: 'contract-sent' })

    expect(blockerFields(sfc)).toEqual(['contractStatus'])
  })

  it('inherits the billing gaps, including EHF without an org. number', () => {
    const sfc = invoiceable({
      billing: mockBillingInfo({ invoiceFormat: 'ehf' }),
      sponsor: { ...mockSponsor().sponsor, orgNumber: undefined },
    })

    expect(blockerFields(sfc)).toEqual(['sponsor.orgNumber'])
  })

  it('reports every blocker at once', () => {
    const sfc = invoiceable({
      billing: undefined,
      contractValue: undefined,
      tier: undefined,
      contractStatus: 'none',
    })

    expect(blockerFields(sfc)).toEqual([
      'billing',
      'contractValue',
      'contractStatus',
    ])
  })
})

describe('toInvoiceRow', () => {
  it('flags an amount that came from the tier rather than the contract', () => {
    const row = toInvoiceRow(invoiceable({ contractValue: undefined }))

    expect(row.amountFromTier).toBe(true)
    expect(row.amount).toBeGreaterThan(0)
  })

  it('does not flag a negotiated amount as tier-derived', () => {
    expect(toInvoiceRow(invoiceable()).amountFromTier).toBe(false)
  })

  it('carries the delivery details a finance person needs', () => {
    const row = toInvoiceRow(
      invoiceable({ billing: mockBillingInfo({ invoiceFormat: 'ehf' }) }),
    )

    expect(row.invoiceFormat).toBe('EHF (digital invoice)')
    expect(row.billingEmail).toBe('billing@example.com')
    expect(row.orgNumber).toBe('123456789')
    expect(row.reference).toBe('PO-2026-001')
  })

  it('leaves the format null rather than guessing when none is recorded', () => {
    const row = toInvoiceRow(
      invoiceable({
        billing: {
          ...mockBillingInfo(),
          invoiceFormat: undefined as unknown as 'pdf',
        },
      }),
    )

    expect(row.invoiceFormat).toBeNull()
  })
})

describe('totalsByCurrency', () => {
  it('keeps currencies apart and puts NOK first', () => {
    const rows = [
      toInvoiceRow(
        invoiceable({ contractValue: 1000, contractCurrency: 'EUR' }),
      ),
      toInvoiceRow(invoiceable({ contractValue: 50000 })),
      toInvoiceRow(invoiceable({ contractValue: 25000 })),
    ]

    expect(totalsByCurrency(rows)).toEqual([
      { currency: 'NOK', amount: 75000, count: 2 },
      { currency: 'EUR', amount: 1000, count: 1 },
    ])
  })

  it('returns nothing for an empty list', () => {
    expect(totalsByCurrency([])).toEqual([])
  })
})

describe('buildInvoicesCsv', () => {
  const lines = (csv: string) => csv.trimEnd().split('\n')

  it('writes one line per invoice with a plain numeric amount', () => {
    const csv = buildInvoicesCsv([toInvoiceRow(invoiceable())])

    const row = lines(csv)[1]
    expect(row).toContain('50000')
    expect(row).not.toContain('50 000')
    expect(row).toContain('Acme Corporation')
  })

  it('exports blocked rows too, naming what blocks them', () => {
    const csv = buildInvoicesCsv([
      toInvoiceRow(invoiceable({ contractStatus: 'none' })),
    ])

    expect(lines(csv)).toHaveLength(2)
    expect(lines(csv)[1]).toContain('Signed contract')
  })

  it('leaves the blockers column empty for a ready row', () => {
    const csv = buildInvoicesCsv([toInvoiceRow(invoiceable())])

    expect(lines(csv)[1].endsWith(',')).toBe(true)
  })

  it('writes dates a spreadsheet can parse', () => {
    const csv = buildInvoicesCsv([
      toInvoiceRow(
        invoiceable({
          contractSignedAt: '2026-03-14T09:30:00Z',
          invoiceStatus: 'sent',
          invoiceSentAt: '2026-04-01T08:00:00Z',
        }),
      ),
    ])

    expect(lines(csv)[1]).toContain('2026-03-14')
    expect(lines(csv)[1]).toContain('2026-04-01')
  })

  it('lists add-ons in a single cell', () => {
    const csv = buildInvoicesCsv([
      toInvoiceRow(
        invoiceable({
          addons: [
            {
              ...mockSponsorTier(),
              _id: 'a1',
              title: 'Workshop',
              tierType: 'addon',
            },
            {
              ...mockSponsorTier(),
              _id: 'a2',
              title: 'Booth',
              tierType: 'addon',
            },
          ] as SponsorForConferenceExpanded['addons'],
        }),
      ),
    ])

    expect(lines(csv)[1]).toContain('Workshop; Booth')
  })
})

describe('invoicesCsvFilename', () => {
  it('slugifies the conference title', () => {
    expect(invoicesCsvFilename('Cloud Native Days Norway 2026')).toBe(
      'sponsor-invoices-cloud-native-days-norway-2026.csv',
    )
  })
})
