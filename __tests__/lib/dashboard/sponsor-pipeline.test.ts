import { describe, expect, it } from 'vitest'
import { shapeSponsorPipeline } from '@/lib/dashboard/widget-data'
import type { Conference } from '@/lib/conference/types'

describe('shapeSponsorPipeline', () => {
  it('sums deals in NOK, with the tier-price fallback', () => {
    const data = shapeSponsorPipeline(
      {} as Conference,
      [
        {
          _id: 'a',
          status: 'closed-won',
          contractValue: 1000,
          contractCurrency: 'EUR',
        },
        {
          _id: 'b',
          status: 'closed-won',
          tier: { price: [{ amount: 10000, currency: 'NOK' }] },
        },
      ],
      [],
    )

    // FALLBACK_RATES: 1 EUR = 11.6 NOK.
    expect(data.totalValue).toBeCloseTo(21600)
    expect(data.stages.find((s) => s.name === 'Closed Won')?.value).toBeCloseTo(
      21600,
    )
  })
})
