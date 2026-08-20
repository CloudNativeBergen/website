import { describe, it, expect } from 'vitest'
import { Linter } from 'eslint'
import rule from './no-bare-amount-parse'

/**
 * THE CROSS-POSITION MATRIX (#898).
 *
 * `no-bare-amount-parse.test.ts` pins each shape the rule header claims, once.
 * That was not enough: three review rounds each found the SAME defect shape —
 * a claim that held in one binding position and silently did not hold in
 * another. "A single-assignment local alias is resolved" was true for a `const`
 * and false for `for (const s of sums)`. "A renamed destructure binds to the
 * key" was true for a `const` and false for `for (const { sum: raw } of …)` —
 * the same split, one round later, because the fix had been applied to one
 * branch rather than to the concept.
 *
 * So the coverage claim is checked as a MATRIX rather than as a list: every
 * transformation, in every position an amount can reach a parser from. A new
 * position added to the rule means a new column here, and any transformation
 * that does not survive it shows up as a failing row instead of as a sentence
 * in a header that nothing verifies.
 *
 * The second block is the inverse and matters just as much: the shapes the
 * header says it does NOT catch. If one of those starts being caught, the rule
 * improved and the header is now understating it — also a mismatch, also worth
 * a failing test.
 */

const linter = new Linter()

const config = {
  files: ['**/*.{ts,tsx}'],
  plugins: { money: { rules: { 'no-bare-amount-parse': rule } } },
  rules: { 'money/no-bare-amount-parse': 'error' },
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
} as unknown as Linter.Config

const FILENAME = 'src/lib/tickets/matrix-probe.ts'

function flagsWith(cfg: Linter.Config, code: string): boolean {
  const messages = linter.verify(code, cfg, FILENAME)
  const unmatched = messages.filter((m) => m.ruleId === null)
  if (unmatched.length > 0) {
    // A config that does not match the filename reports EVERY snippet as one
    // anonymous warning — which reads as "caught" to a naive counter and makes
    // the whole matrix meaningless. Fail loudly instead.
    throw new Error(`probe misconfigured: ${unmatched[0].message}`)
  }
  return messages.some((m) => m.ruleId === 'money/no-bare-amount-parse')
}

const flags = (code: string) => flagsWith(config, code)

describe('the probe itself can fail', () => {
  it('reports a known violation', () => {
    expect(flags('parseFloat(ticket.sum)')).toBe(true)
  })

  it('stays quiet on a known non-violation', () => {
    expect(flags('parseInt(hex.slice(0, 2), 16)')).toBe(false)
  })

  it('throws rather than reading a config mismatch as a catch', () => {
    // This is not hypothetical: the first run of this matrix had a config that
    // matched no file, so ESLint returned one anonymous warning per snippet and
    // every row — including the ones that should have escaped — read as CAUGHT.
    const mismatched = { ...config, files: ['**/*.never'] } as Linter.Config
    expect(
      linter
        .verify('parseFloat(ticket.sum)', mismatched, FILENAME)
        .some((m) => m.ruleId === null),
    ).toBe(true)
    expect(() => flagsWith(mismatched, 'parseFloat(ticket.sum)')).toThrow(
      /probe misconfigured/,
    )
  })
})

/**
 * Every row is a shape the rule header claims to catch. Grouped by the POSITION
 * the value reaches the parser from, because that is the axis the defects have
 * repeatedly hidden along.
 */
const covered: Array<[string, string]> = [
  // --- the amount named directly ---------------------------------------
  ['direct property', 'parseFloat(ticket.sum)'],
  ['direct identifier', 'parseFloat(amount)'],
  ['computed by string literal', "parseFloat(ticket['sum'])"],
  ['nested index', 'parseFloat(ticket.price[0].price)'],
  ['optional chain', 'parseFloat(ticket?.sum)'],

  // --- through a local binding ------------------------------------------
  ['const alias', 'const a = ticket.sum; parseFloat(a)'],
  ['two-step alias', 'const a = ticket.sum; const b = a; parseFloat(b)'],
  ['for-of over a collection', 'for (const s of sums) parseFloat(s)'],
  [
    'for-of over a projection',
    'for (const s of tickets.map((t) => t.sum)) parseFloat(s)',
  ],

  // --- through a destructure, in EVERY position it can appear -----------
  ['destructure shorthand (const)', 'const { sum } = ticket; parseFloat(sum)'],
  [
    'destructure renamed (const)',
    'const { sum: raw } = ticket; parseFloat(raw)',
  ],
  [
    'destructure renamed with default',
    "const { sum: raw = '0' } = ticket; parseFloat(raw)",
  ],
  [
    'destructure nested',
    'const { order: { sum: raw } } = payload; parseFloat(raw)',
  ],
  [
    'destructure shorthand (for-of)',
    'for (const { sum } of tickets) parseFloat(sum)',
  ],
  [
    'destructure renamed (for-of)',
    'for (const { sum: raw } of tickets) parseFloat(raw)',
  ],
  [
    'destructure renamed (for-in)',
    'for (const { sum: raw } in tickets) parseFloat(raw)',
  ],
  [
    'destructure renamed (function parameter)',
    'function f({ sum: raw }) { return parseFloat(raw) }',
  ],
  [
    'destructure renamed (arrow parameter)',
    'const f = ({ sum: raw }) => parseFloat(raw)',
  ],
  ['array pattern (for-of)', 'for (const [sum] of rows) parseFloat(sum)'],

  // --- through a transformation, direct and via a binding ---------------
  ['String() wrapper', 'parseFloat(String(ticket.sum))'],
  ['String() wrapper via alias', 'const a = String(ticket.sum); parseFloat(a)'],
  [
    'String() wrapper in for-of',
    'for (const s of [String(ticket.sum)]) parseFloat(s)',
  ],
  ['template literal', 'parseFloat(`${ticket.sum}`)'],
  ['template literal via alias', 'const a = `${ticket.sum}`; parseFloat(a)'],
  ['member call', 'parseFloat(ticket.sum.trim())'],
  ['member call via alias', 'const a = ticket.sum.trim(); parseFloat(a)'],
  ['nullish default', "parseFloat(ticket.sum ?? '0')"],
  ['nullish default via alias', "const a = ticket.sum ?? '0'; parseFloat(a)"],
  ['ternary', "parseFloat(ok ? ticket.sum : '0')"],
  ['string concatenation', "parseFloat('' + ticket.sum)"],
  ['await', 'async function f() { return parseFloat(await order.sum) }'],
  [
    'await via alias',
    'async function f() { const a = await order.sum; return parseFloat(a) }',
  ],
  ['bare money-named call', 'parseFloat(sum())'],
  ['member money-named call', 'parseFloat(order.sum())'],

  // --- the parser reached indirectly -------------------------------------
  ['Number.parseFloat', 'Number.parseFloat(ticket.sum)'],
  ['globalThis parser', 'globalThis.parseFloat(ticket.sum)'],
  ['window parser', 'window.parseFloat(ticket.sum)'],
  ['optional call', 'parseFloat?.(ticket.sum)'],
  ['optional member parser', 'Number?.parseFloat(ticket.sum)'],
  ['call()', 'parseFloat.call(null, ticket.sum)'],
  ['apply()', 'parseFloat.apply(null, [ticket.sum])'],
  ['Number.parseFloat.call()', 'Number.parseFloat.call(null, ticket.sum)'],
  ['comma-expression callee', '(0, parseFloat)(ticket.sum)'],
  ['comma-expression global callee', '(0, globalThis.parseFloat)(ticket.sum)'],

  // --- the parser as a callback ------------------------------------------
  ['array literal .map', '[ticket.sum].map(Number)'],
  ['projection then .map(Number)', 'tickets.map((t) => t.sum).map(Number)'],
  [
    'projection then .map(parseFloat)',
    'tickets.map((t) => t.sum).map(parseFloat)',
  ],
  ['.forEach', 'sums.forEach(parseFloat)'],
  ['Array.from mapper', 'Array.from(prices, Number)'],
  ['Array.from global mapper', 'Array.from(prices, globalThis.parseFloat)'],
]

/**
 * The rule header's blind-spot list, as executable fixtures. Each of these
 * SHOULD escape; a row flipping to caught means the header now understates the
 * rule, which is the same species of mismatch as overstating it.
 */
const documentedEscapes: Array<[string, string]> = [
  ['parser aliased to a variable', 'const p = parseFloat; p(ticket.sum)'],
  [
    'parser destructured off a global',
    'const { parseFloat: pf } = globalThis; pf(ticket.sum)',
  ],
  ['parser bound', 'const p = parseFloat.bind(null); p(ticket.sum)'],
  ['parser passed to an IIFE', '((f) => f(ticket.sum))(parseFloat)'],
  [
    'function boundary, neutral parameter name',
    'function toNumber(x) { return parseFloat(x) }',
  ],
  ['reassigned alias', "let a = '0'; a = ticket.sum; parseFloat(a)"],
  [
    'alias declared more than once',
    'var a = ticket.sum; var a = other.label; parseFloat(a)',
  ],
  ['unary plus coercion', 'const n = +ticket.sum'],
  ['multiply-by-one coercion', 'const n = ticket.sum * 1'],
]

describe('every claimed shape is caught, in every position', () => {
  it.each(covered)('catches: %s', (_name, code) => {
    expect(flags(code)).toBe(true)
  })
})

describe('every documented blind spot still escapes', () => {
  it.each(documentedEscapes)('escapes: %s', (_name, code) => {
    expect(flags(code)).toBe(false)
  })
})
