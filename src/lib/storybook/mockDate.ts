/**
 * Deterministic-date helper for Storybook stories (AGENTS.md: "Mock
 * `globalThis.Date` in Storybook `beforeEach` to fix relative dates").
 *
 * Returns a `beforeEach` function for a story `meta` that pins `new Date()` and
 * `Date.now()` to `fixedNow` (explicit-argument constructions pass through),
 * and restores the real `Date` in its cleanup. Extracted from the proven inline
 * pattern in `PaymentDetailsModal.stories.tsx`.
 */
export function mockDateBeforeEach(fixedNow: Date): () => () => void {
  return () => {
    const OriginalDate = globalThis.Date
    const fixedTime = fixedNow.getTime()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MockDate: any = function (...args: any[]) {
      if (args.length === 0) return new OriginalDate(fixedTime)
      return new (
        Function.prototype.bind.apply(OriginalDate, [
          null,
          ...args,
        ]) as typeof OriginalDate
      )()
    }
    Object.setPrototypeOf(MockDate, OriginalDate)
    MockDate.prototype = Object.create(OriginalDate.prototype)
    MockDate.now = () => fixedTime
    MockDate.parse = OriginalDate.parse.bind(OriginalDate)
    MockDate.UTC = OriginalDate.UTC.bind(OriginalDate)
    globalThis.Date = MockDate

    return () => {
      globalThis.Date = OriginalDate
    }
  }
}
