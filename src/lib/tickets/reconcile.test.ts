import { describe, it, expect } from 'vitest'
import { reconcileOrderAmounts } from './reconcile'

describe('reconcileOrderAmounts', () => {
  it('does not call a wide order per-order on rows the aggregate band would blur', () => {
    // 100 seats: the aggregate tolerance is 1.00, so rows 0.50 apart would
    // read as equal. They are not, and the order total matching the first row
    // must not be enough to claim the amount is the order's.
    const seatSums = Array.from({ length: 100 }, (_, i) =>
      i % 2 === 0 ? '100.00' : '100.50',
    )
    const result = reconcileOrderAmounts({ orderSum: '100.00', seatSums })

    expect(result!.verdict).not.toBe('per-order')
  })

  it('reports per-ticket when the seats sum to the order total', () => {
    expect(
      reconcileOrderAmounts({
        orderSum: '15000.00',
        orderSumVat: '3750.00',
        seatSums: ['5000.00', '5000.00', '5000.00'],
      }),
    ).toEqual({
      verdict: 'per-ticket',
      orderTotal: 15000,
      seatSum: 15000,
      seats: 3,
    })
  })

  it('reports per-order when equal seats each carry the order total', () => {
    expect(
      reconcileOrderAmounts({
        orderSum: '5000.00',
        orderSumVat: '1250.00',
        seatSums: ['5000.00', '5000.00', '5000.00'],
      }),
    ).toEqual({
      verdict: 'per-order',
      orderTotal: 5000,
      seatSum: 15000,
      seats: 3,
    })
  })

  it('reports a VAT-sized difference as VAT, not as a basis mismatch', () => {
    // Checkin's ticket rows are ex-VAT (`amountsIncludeVat = false`); an order
    // endpoint reporting the gross total differs by exactly `sumVat`.
    const result = reconcileOrderAmounts({
      orderSum: '18750.00',
      orderSumVat: '3750.00',
      seatSums: ['5000.00', '5000.00', '5000.00'],
    })
    expect(result).toEqual({
      verdict: 'vat',
      direction: 'total-includes-vat',
      vat: 3750,
      orderTotal: 18750,
      seatSum: 15000,
      seats: 3,
    })
    expect(result?.verdict).not.toBe('per-order')
    expect(result?.verdict).not.toBe('unknown')
  })

  it('reports the opposite VAT direction when the seats are the gross side', () => {
    expect(
      reconcileOrderAmounts({
        orderSum: '15000.00',
        orderSumVat: '3750.00',
        seatSums: ['6250.00', '6250.00', '6250.00'],
      }),
    ).toEqual({
      verdict: 'vat',
      direction: 'seats-include-vat',
      vat: 3750,
      orderTotal: 15000,
      seatSum: 18750,
      seats: 3,
    })
  })

  it('reports unknown for a difference nothing explains', () => {
    expect(
      reconcileOrderAmounts({
        orderSum: '9000.00',
        orderSumVat: '1250.00',
        seatSums: ['5000.00', '5000.00'],
      }),
    ).toEqual({
      verdict: 'unknown',
      orderTotal: 9000,
      seatSum: 10000,
      seats: 2,
    })
  })

  it('will not claim confirmation from a single-seat order', () => {
    // One seat: per-ticket and per-order are the same number by construction.
    expect(
      reconcileOrderAmounts({
        orderSum: '5000.00',
        orderSumVat: '1250.00',
        seatSums: ['5000.00'],
      }),
    ).toEqual({
      verdict: 'indistinguishable',
      orderTotal: 5000,
      seatSum: 5000,
      seats: 1,
    })
  })

  it('still explains VAT on a single-seat order', () => {
    expect(
      reconcileOrderAmounts({
        orderSum: '6250.00',
        orderSumVat: '1250.00',
        seatSums: ['5000.00'],
      })?.verdict,
    ).toBe('vat')
  })

  it('accepts rounding drift within tolerance', () => {
    // Exact float equality fails here: 0.1 + 0.2 === 0.30000000000000004.
    expect(
      reconcileOrderAmounts({
        orderSum: '0.30',
        seatSums: ['0.10', '0.20'],
      })?.verdict,
    ).toBe('per-ticket')

    // Per-seat øre rounding across a three-way split.
    expect(
      reconcileOrderAmounts({
        orderSum: '100.00',
        seatSums: ['33.33', '33.33', '33.34'],
      })?.verdict,
    ).toBe('per-ticket')
  })

  it('rejects a difference one øre past tolerance', () => {
    expect(
      reconcileOrderAmounts({
        orderSum: '100.00',
        seatSums: ['50.00', '50.05'],
      })?.verdict,
    ).toBe('unknown')
  })

  it('returns null when there are no seats to compare against', () => {
    expect(
      reconcileOrderAmounts({ orderSum: '5000.00', seatSums: [] }),
    ).toBeNull()
  })

  it('does not invent a VAT explanation when no VAT amount is reported', () => {
    expect(
      reconcileOrderAmounts({
        orderSum: '18750.00',
        orderSumVat: null,
        seatSums: ['5000.00', '5000.00', '5000.00'],
      })?.verdict,
    ).toBe('unknown')
  })
})
