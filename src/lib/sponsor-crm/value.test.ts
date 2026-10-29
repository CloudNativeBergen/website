import { describe, expect, it } from 'vitest'
import { sponsorValueNOK } from './value'
import type { SponsorForConferenceExpanded } from './types'

const deal = (over: Partial<SponsorForConferenceExpanded>) =>
  over as SponsorForConferenceExpanded

describe('sponsorValueNOK', () => {
  it('converts to NOK so mixed-currency deals sort by real value', () => {
    // FALLBACK_RATES: 1 EUR = 11.6 NOK.
    const eur = deal({ contractValue: 5000, contractCurrency: 'EUR' })
    const nok = deal({ contractValue: 50000, contractCurrency: 'NOK' })
    expect(sponsorValueNOK(eur)).toBeCloseTo(58000)
    expect(sponsorValueNOK(nok)).toBe(50000)
    expect(
      [nok, eur].sort((a, b) => sponsorValueNOK(b) - sponsorValueNOK(a)),
    ).toEqual([eur, nok])
  })

  it('falls back to the tier price in the tier currency, and to 0', () => {
    const tiered = deal({
      tier: {
        _id: 't',
        title: 'Gold',
        tagline: '',
        tierType: 'standard',
        price: [{ _key: 'p', amount: 1000, currency: 'EUR' }],
      },
    })
    expect(sponsorValueNOK(tiered)).toBeCloseTo(11600)
    expect(sponsorValueNOK(deal({}))).toBe(0)
  })
})
