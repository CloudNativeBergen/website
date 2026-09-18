import { parseTicketAmount } from '@/lib/tickets/amount'

/**
 * Check a provider's OWN order total against the seat rows of that same order.
 *
 * WHY THIS EXISTS: every revenue surface sums `EventTicket.sum` once per seat,
 * which is only correct if that `sum` is the amount for that seat alone —
 * `CheckinProvider.amountBasis = 'per-ticket'`. Nothing in the app confirmed
 * that; `scripts/dump-ticket-shape.ts` can, but only for someone holding
 * Checkin credentials. The product already fetches the other half of the
 * answer by an independent path: `fetchOrderPaymentDetails` returns Checkin's
 * authoritative `CheckinPayOrder.sum` for one order. Comparing the two answers
 * the question from any admin's browser, and keeps answering it if a vendor
 * changes semantics or a tenant lands on a provider that behaves differently.
 *
 * READ-ONLY: this reports, it changes no number anywhere.
 *
 * WHAT "CONSISTENT" MEANS HERE: the seat rows are the ones the app actually
 * sums, i.e. AFTER `toPerTicketAmounts` has applied the declared basis. So a
 * `'per-ticket'` verdict says the declaration currently in force produces the
 * provider's own total — which is exactly the property the revenue figures
 * depend on.
 *
 * The four outcomes are kept apart deliberately; collapsing them into
 * "mismatch" is what would make this noise. In particular a VAT difference is
 * NOT a basis problem, and `CheckinProvider.amountsIncludeVat` is false while
 * the order endpoint may well report tax-inclusive — a naive total comparison
 * would then warn on EVERY order and teach everyone to ignore the warning.
 * `CheckinPayOrder.sumVat` carries the order's actual VAT amount, so that case
 * is tested against the real figure instead of a guessed rate.
 */
export type AmountReconciliation =
  /** Σ seats ≈ order total. Consistent with the declared per-ticket basis. */
  | {
      verdict: 'per-ticket'
      orderTotal: number
      seatSum: number
      seats: number
    }
  /**
   * The order total equals ONE seat's amount and every seat carries the same
   * amount: the order total repeated per row. Revenue is then inflated by
   * seats-per-order everywhere.
   */
  | { verdict: 'per-order'; orderTotal: number; seatSum: number; seats: number }
  /**
   * The two differ by this order's own VAT amount. Not a basis problem — the
   * two endpoints disagree about tax inclusion.
   */
  | {
      verdict: 'vat'
      orderTotal: number
      seatSum: number
      seats: number
      vat: number
      /** `'total-includes-vat'`: Σ seats ≈ total − VAT (seats are net). */
      direction: 'total-includes-vat' | 'seats-include-vat'
    }
  /**
   * A single-seat order: per-ticket and per-order produce the same number, so
   * it confirms neither.
   */
  | {
      verdict: 'indistinguishable'
      orderTotal: number
      seatSum: number
      seats: number
    }
  /**
   * The difference fits none of the explanations above. Reported as unknown
   * rather than guessed at — `unknown` is a first-class outcome in this
   * codebase (`lib/tickets/public.ts`, `lib/discounts/types.ts`), never a
   * substituted zero.
   */
  | { verdict: 'unknown'; orderTotal: number; seatSum: number; seats: number }

/**
 * TOLERANCE: one øre (0.01) per seat, floor one øre.
 *
 * Provider amounts are minor-unit-precise decimal strings, so the only
 * legitimate drift is per-row rounding — the vendor rounding each seat to the
 * øre, and `toPerTicketAmounts` dividing an order across its seats — which is
 * bounded by half a minor unit per row. IEEE-754 error on a sum of a few
 * hundred such values is ~1e-10, far below that. The smallest difference that
 * could mean anything real is a whole seat's price, so a per-seat øre sits
 * orders of magnitude under every signal and above every artefact. Exact float
 * equality would fail on `0.1 + 0.2`-shaped sums and cry wolf.
 */
function tolerance(seats: number): number {
  return 0.01 * Math.max(seats, 1)
}

export function reconcileOrderAmounts(input: {
  /** `CheckinPayOrder.sum` — the provider's own total for this order. */
  orderSum: string | number | null | undefined
  /** `CheckinPayOrder.sumVat` — that order's VAT amount. */
  orderSumVat?: string | number | null | undefined
  /** `EventTicket.sum` of every seat in that same order. */
  seatSums: readonly (string | number | null | undefined)[]
}): AmountReconciliation | null {
  const seatAmounts = input.seatSums.map(parseTicketAmount)
  const seats = seatAmounts.length
  // No seats to compare against: nothing is being claimed, so claim nothing.
  if (seats === 0) return null

  const orderTotal = parseTicketAmount(input.orderSum)
  const seatSum = seatAmounts.reduce((total, amount) => total + amount, 0)
  const tol = tolerance(seats)
  const base = { orderTotal, seatSum, seats }

  if (Math.abs(seatSum - orderTotal) <= tol) {
    return seats === 1
      ? { verdict: 'indistinguishable', ...base }
      : { verdict: 'per-ticket', ...base }
  }

  // ONE row's worth, not the aggregate: `tol` scales with the seat count
  // because a sum accumulates one rounding per row, but comparing two rows to
  // each other accumulates one. At 100 seats the aggregate band is 1.00, wide
  // enough to call two genuinely different prices equal and then read the
  // order total off the first of them — a per-order verdict on a per-ticket
  // order, loudly, in the check that exists to catch the opposite mistake.
  const rowTol = tolerance(1)
  const allSeatsEqual = seatAmounts.every(
    (amount) => Math.abs(amount - seatAmounts[0]) <= rowTol,
  )
  if (allSeatsEqual && Math.abs(orderTotal - seatAmounts[0]) <= rowTol) {
    return { verdict: 'per-order', ...base }
  }

  const vat = parseTicketAmount(input.orderSumVat)
  if (vat > 0) {
    if (Math.abs(seatSum - (orderTotal - vat)) <= tol) {
      return { verdict: 'vat', direction: 'total-includes-vat', vat, ...base }
    }
    if (Math.abs(seatSum - (orderTotal + vat)) <= tol) {
      return { verdict: 'vat', direction: 'seats-include-vat', vat, ...base }
    }
  }

  return { verdict: 'unknown', ...base }
}
