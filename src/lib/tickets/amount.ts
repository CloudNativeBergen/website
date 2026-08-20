/**
 * The ONE place a money string from a ticketing provider becomes a number
 * (#898; the helper was introduced in #896 and lived in `tickets/utils.ts`).
 *
 * Everything that reads `sum`, `sum_left`, `sumLeft`, `sumVat` or a ticket-type
 * `price` off a Checkin / Tito payload goes through `parseTicketAmount`; a
 * `vat` RATE goes through `parseVatPercent`, which is the same policy with one
 * difference, documented at that function. `eslint-rules/no-bare-amount-parse.js` enforces that
 * mechanically: a bare `parseFloat` / `parseInt` / `Number` on a money-named
 * expression anywhere under `src/` is an ESLint ERROR, and this module is the
 * single allowlisted file.
 *
 * ---------------------------------------------------------------------------
 * THE NaN POLICY — one rule, stated: an amount that does not parse is ABSENT,
 * and absent is 0. A NaN never leaves this function.
 * ---------------------------------------------------------------------------
 *
 * Before #898 the repo had three policies at once: `parseFloat(x) || 0`
 * (api.ts), a `Number.isFinite` guard (budget/income.ts), and a bare
 * `parseFloat` feeding `+=` (tickets/processor.ts). Both remaining failure
 * modes are wrong; they differ in blast radius and in how they fail:
 *
 *  - NaN is CONTAGIOUS. One malformed row in `processor.ts` turned an entire
 *    conference's `totalRevenue` into NaN — every good row's contribution lost
 *    with it. A 0 loses the one bad row and nothing else.
 *
 *  - NaN is NOT reliably loud, which is the argument usually made for it. It
 *    renders as "NaN" only where it reaches a formatter. In a COMPARISON it is
 *    silently false: `parseFloat('??') > 0` and `=== 0` are both false, so
 *    until this sweep a malformed ticket fell out of BOTH the paid and the free
 *    bucket on /admin/tickets and in the status summary — it vanished from the
 *    headcount without a trace. NaN was already failing silently in exactly the
 *    place the "at least NaN is visible" argument relies on.
 *
 *  - 0 keeps the classification and the display AGREEING. An unparseable price
 *    is classified free by `isPriced` (a NaN comparison is false) and now also
 *    displays as 0 rather than "NaN" next to that classification.
 *
 *  - 0 keeps totals, averages and sorts total-orderable. NaN poisons `reduce`,
 *    `Math.min` and every `sort` comparator it touches.
 *
 * The real objection to 0 — that a silent 0 turns a real amount into a missing
 * one on a revenue surface, where a plausible wrong number is least likely to
 * be questioned — is answered by making it NOT SILENT: every input that is
 * present but does not parse cleanly is reported through `console.warn` (see
 * `reportAmountIssue`), on a budget that DECAYS rather than latching off.
 * Absence itself (`null`, `undefined`, `''`) is expected of a SUM — a free
 * ticket costs nothing — and coalesces silently; absence of a VAT RATE is not
 * expected, and `parseVatPercent` reports it.
 *
 * Non-finite results are treated as unparseable too: `parseFloat('Infinity')`
 * is `Infinity`, which poisons a total exactly as NaN does.
 *
 * ---------------------------------------------------------------------------
 * DECIMAL FORMAT — checked, not assumed (carried over from #896).
 * ---------------------------------------------------------------------------
 *
 * `parseFloat` reads a DOT decimal and stops at a comma, so `"1.234,56"` would
 * silently become `1.234`. Everything we know says the providers do not send
 * that: Checkin's GraphQL types `sum` / `sum_left` as strings and every
 * recorded value is dot-decimal (`'15000.00'`, `'99.99'`, `'150.50'`); Tito's
 * adapter MINTS the value itself as `String(t.price)` (`provider/tito.ts`).
 * That assumption is deliberately NOT worked around — a comma decimal is not
 * silently "fixed" here, because guessing a separator is how a 1 234,56 becomes
 * a 123 456. What this module adds is a SIGNAL: a value that parses only
 * partially (`'1,5'`, `'12 NOK'`) keeps its `parseFloat` value — unchanged
 * behaviour — but is reported, so the assumption is monitorable instead of
 * merely asserted.
 */

/**
 * Distinct raw values already reported, so a malformed feed of 5 000 tickets
 * does not write 5 000 identical lines. Capped, because the key set is provider
 * data and therefore not ours to trust.
 *
 * The budget DECAYS rather than latching. A module-level cap with no window
 * would, in a long-lived server process, switch reporting off permanently after
 * twenty distinct bad values had EVER been seen — across every tenant — and the
 * policy would quietly become the silent 0 this module argues against. One
 * tenant's malformed feed must not spend everyone's budget for the lifetime of
 * the process, so the memory is dropped once the window elapses.
 */
const reported = new Set<string>()
const REPORT_CAP = 20
const REPORT_WINDOW_MS = 60 * 60 * 1000
let windowStartedAt = Date.now()

/** Exported for tests — resets the dedupe memory and the window. */
export function resetAmountIssueReporting(): void {
  reported.clear()
  windowStartedAt = Date.now()
}

function reportAmountIssue(reason: string, value: unknown): void {
  const now = Date.now()
  if (now - windowStartedAt >= REPORT_WINDOW_MS) {
    reported.clear()
    windowStartedAt = now
  }
  const key = `${reason}:${String(value)}`
  if (reported.has(key)) return
  if (reported.size >= REPORT_CAP) return
  reported.add(key)
  console.warn(
    `[tickets] ${reason}: ${JSON.stringify(String(value))} — see src/lib/tickets/amount.ts`,
  )
}

/** A string that is entirely a plain decimal number, optionally signed. */
const CANONICAL_DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/

/**
 * Parse a provider money string (`sum`, `sum_left`, `sumLeft`, a ticket
 * `price`, a `vat` percentage) to a finite number.
 *
 * ALWAYS returns a finite number: unparseable, non-finite and non-string
 * inputs all become 0, and every one of those that was PRESENT is reported.
 * See the module header for why 0 rather than NaN.
 */
export function parseTicketAmount(
  value: string | number | null | undefined,
): number {
  // Absent by design — a missing amount is not a parse failure.
  if (value === null || value === undefined) return 0

  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value
    reportAmountIssue('non-finite amount treated as 0', value)
    return 0
  }

  if (typeof value !== 'string') {
    // The types say this cannot happen; provider payloads have been wrong
    // before, and `parseFloat({})` is NaN, not a type error.
    reportAmountIssue('non-string amount treated as 0', value)
    return 0
  }

  const trimmed = value.trim()
  if (trimmed === '') return 0

  const parsed = parseFloat(trimmed)
  if (!Number.isFinite(parsed)) {
    reportAmountIssue('unparseable amount treated as 0', value)
    return 0
  }

  // Value is KEPT as parsed — this only surfaces input we did not expect
  // (a comma decimal, a currency suffix, stray text).
  if (!CANONICAL_DECIMAL.test(trimmed)) {
    reportAmountIssue('partially parsed amount', value)
  }

  return parsed
}

/**
 * Parse a VAT RATE (a percentage, as a string) from a provider payload.
 *
 * Same NaN policy — 0, never NaN — but with one deliberate difference:
 * ABSENCE IS NOT EXPECTED HERE, so `''` / `null` / `undefined` are reported
 * rather than coalesced silently.
 *
 * The distinction is not pedantry. A missing `sum` is an ordinary fact: a free
 * ticket costs nothing. A missing VAT rate, applied to a price we are about to
 * show a buyer as "incl. VAT", produces a number that is ~20-25% TOO LOW and
 * looks entirely plausible — the exact failure this module exists to prevent,
 * and the one the silent-absence branch of `parseTicketAmount` would have
 * created when it replaced a (loud, obviously broken) `NaN`.
 */
export function parseVatPercent(
  value: string | number | null | undefined,
): number {
  if (value === null || value === undefined || String(value).trim() === '') {
    reportAmountIssue('missing VAT rate treated as 0%', value ?? '')
    return 0
  }
  return parseTicketAmount(value)
}
