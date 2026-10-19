import { describe, expect, it } from 'vitest'
import { feedbackTotals, sharePercent } from './totals'

describe('feedbackTotals (speaker feedback spec §4.3)', () => {
  it('adds live responses, folded totals and Card Counts per colour', () => {
    const totals = feedbackTotals({
      live: { green: 5, yellow: 2, red: 1 },
      folded: { greenCount: 10, yellowCount: 0, redCount: 3 },
      cards: { greenCount: 20, yellowCount: 4, redCount: 0 },
    })
    expect(totals.scanned).toEqual({ green: 15, yellow: 2, red: 4 })
    expect(totals.cards).toEqual({ green: 20, yellow: 4, red: 0 })
    expect(totals.combined).toEqual({ green: 35, yellow: 6, red: 4 })
    expect(totals.total).toBe(45)
    expect(totals.scannedTotal).toBe(21)
    expect(totals.cardsTotal).toBe(24)
  })

  it('reads an absent fold or absent Card Counts as zero', () => {
    const totals = feedbackTotals({
      live: { green: 1, yellow: 1, red: 0 },
      folded: null,
      cards: undefined,
    })
    expect(totals.combined).toEqual({ green: 1, yellow: 1, red: 0 })
    expect(totals.cardsTotal).toBe(0)
  })

  it('reads a missing, negative or fractional count as a whole, non-negative number', () => {
    const totals = feedbackTotals({
      live: { green: 2, yellow: 0, red: 0 },
      // Card Counts are typed by hand in Studio: a field can be missing.
      cards: { greenCount: 3 } as never,
      folded: { greenCount: -4, yellowCount: 1.7, redCount: Number.NaN },
    })
    expect(totals.combined).toEqual({ green: 5, yellow: 1, red: 0 })
  })

  it('gives the share that loved it, rounded to a whole percent', () => {
    // 2 of 3 = 66.67 %
    expect(
      feedbackTotals({ live: { green: 2, yellow: 1, red: 0 } }).lovedItPercent,
    ).toBe(67)
  })

  it('never rounds a mixed result to 100 % or 0 %', () => {
    // 199 of 200 is 99.5 %, and 1 of 201 is 0.5 %: neither is "all" or "none".
    expect(
      feedbackTotals({ live: { green: 199, yellow: 0, red: 1 } })
        .lovedItPercent,
    ).toBe(99)
    expect(
      feedbackTotals({ live: { green: 1, yellow: 0, red: 200 } })
        .lovedItPercent,
    ).toBe(1)
    expect(sharePercent(0, 5)).toBe(0)
    expect(sharePercent(5, 5)).toBe(100)
  })

  it('has no loved-it share when there is nothing to share', () => {
    expect(
      feedbackTotals({ live: { green: 0, yellow: 0, red: 0 } }).lovedItPercent,
    ).toBeNull()
  })
})
