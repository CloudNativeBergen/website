import { describe, it, expect } from 'vitest'
import {
  evaluateBilling,
  invoiceFormatLabel,
  isBillingComplete,
} from './billing'
import { mockSponsor, mockBillingInfo } from '@/__mocks__/sponsor-data'
import type { SponsorForConferenceExpanded } from './types'

const gapFields = (sfc: SponsorForConferenceExpanded) =>
  evaluateBilling(sfc).gaps.map((gap) => gap.field)

describe('invoiceFormatLabel', () => {
  it('labels the stored formats', () => {
    expect(invoiceFormatLabel('ehf')).toBe('EHF (digital invoice)')
    expect(invoiceFormatLabel('pdf')).toBe('PDF via email')
  })

  it('returns null instead of guessing a format when none is stored', () => {
    expect(invoiceFormatLabel(undefined)).toBeNull()
    expect(invoiceFormatLabel(null)).toBeNull()
  })
})

describe('evaluateBilling', () => {
  it('accepts a complete PDF setup', () => {
    const sfc = mockSponsor({
      billing: mockBillingInfo({ invoiceFormat: 'pdf' }),
    })

    expect(evaluateBilling(sfc)).toEqual({
      hasBilling: true,
      complete: true,
      gaps: [],
    })
  })

  it('accepts EHF when the company has an organisation number', () => {
    const sfc = mockSponsor({
      billing: mockBillingInfo({ invoiceFormat: 'ehf' }),
    })

    expect(isBillingComplete(sfc)).toBe(true)
  })

  it('reports a single gap when no billing object exists', () => {
    const sfc = mockSponsor({ billing: undefined })
    const readiness = evaluateBilling(sfc)

    expect(readiness.hasBilling).toBe(false)
    expect(readiness.complete).toBe(false)
    expect(readiness.gaps).toHaveLength(1)
    expect(readiness.gaps[0].field).toBe('billing')
  })

  it('flags a blank billing email even when the format is set', () => {
    const sfc = mockSponsor({
      billing: mockBillingInfo({ email: '   ' }),
    })

    expect(gapFields(sfc)).toEqual(['billing.email'])
  })

  it('flags a missing invoice format rather than assuming PDF', () => {
    const sfc = mockSponsor({
      // Simulates a record written before `invoiceFormat` was required — the
      // cast is the only way to express a state the type no longer allows.
      billing: {
        ...mockBillingInfo(),
        invoiceFormat: undefined as unknown as 'pdf',
      },
    })

    expect(gapFields(sfc)).toEqual(['billing.invoiceFormat'])
  })

  it('flags EHF without an organisation number — it cannot be delivered', () => {
    const sfc = mockSponsor({
      billing: mockBillingInfo({ invoiceFormat: 'ehf' }),
      sponsor: { ...mockSponsor().sponsor, orgNumber: undefined },
    })

    expect(gapFields(sfc)).toEqual(['sponsor.orgNumber'])
    expect(isBillingComplete(sfc)).toBe(false)
  })

  it('does not require an organisation number for PDF invoicing', () => {
    const sfc = mockSponsor({
      billing: mockBillingInfo({ invoiceFormat: 'pdf' }),
      sponsor: { ...mockSponsor().sponsor, orgNumber: undefined },
    })

    expect(isBillingComplete(sfc)).toBe(true)
  })

  it('collects every gap at once', () => {
    const sfc = mockSponsor({
      billing: { invoiceFormat: 'ehf', email: '' },
      sponsor: { ...mockSponsor().sponsor, orgNumber: '' },
    })

    expect(gapFields(sfc)).toEqual(['billing.email', 'sponsor.orgNumber'])
  })
})
