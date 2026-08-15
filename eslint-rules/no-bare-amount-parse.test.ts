import { RuleTester } from 'eslint'
import { parser as tsParser } from 'typescript-eslint'
// CommonJS rule, loaded by eslint.config.js via require; imported here through
// esModuleInterop exactly like no-unscoped-groq.test.ts.
import rule from './no-bare-amount-parse'

// `filename` is set per case because the rule allowlists paths (the helper
// module, tests, stories, scripts, migrations); the default fixture filename is
// a `src/**` path so the rule is active.
const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
})

// A second tester for the TypeScript-only syntax (`!`, `as`), which espree
// cannot parse.
const tsRuleTester = new RuleTester({
  languageOptions: {
    parser: tsParser as unknown as never,
    ecmaVersion: 2022,
    sourceType: 'module',
  },
})

// A third tester for JSX, where a comment is an expression container
// (`{/* … */}`) rather than a bare line — the placement the header promises has
// to work there too, and the naive token-based hard stop broke it.
const tsxRuleTester = new RuleTester({
  languageOptions: {
    parser: tsParser as unknown as never,
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
})

const asRule = rule as unknown as Parameters<typeof ruleTester.run>[1]
const SRC = 'src/lib/tickets/report.ts'
const error = [{ messageId: 'bareAmountParse' }]

ruleTester.run('no-bare-amount-parse', asRule, {
  valid: [
    // The helper is the point of the rule.
    { filename: SRC, code: 'const n = parseTicketAmount(ticket.sum)' },

    // --- NOT money -------------------------------------------------------
    // A controlled number input: a human typing, not a provider payload.
    { filename: SRC, code: 'const n = parseFloat(e.target.value) || 0' },
    { filename: SRC, code: 'const n = parseInt(e.target.value) || 0' },
    // Sponsor CRM form value — deliberately out of scope, see the rule header.
    { filename: SRC, code: 'const n = parseFloat(formData.contractValue)' },
    // Non-money numerics: PDF coordinates, hex colour components, durations.
    { filename: SRC, code: 'const x = parseFloat(cmMatch[1])' },
    { filename: SRC, code: 'const r = parseInt(hex.substring(0, 2), 16)' },
    { filename: SRC, code: 'const d = Number(durationValue)' },
    { filename: SRC, code: 'const y = parseInt(firstLabel, 10)' },
    // A parser as a CALLBACK over something that is not money.
    { filename: SRC, code: 'const rgb = hexPairs.map(Number)' },
    { filename: SRC, code: 'const mins = durations.map(parseFloat)' },
    // A money name that is not being parsed is not this rule's business.
    { filename: SRC, code: 'const label = formatCurrency(order.sum)' },
    // parseFloat with no argument must not crash the rule.
    { filename: SRC, code: 'const n = parseFloat()' },

    // --- KNOWN ESCAPES, pinned rather than described ----------------------
    // These are NOT "valid" in the sense of desirable — they are shapes the
    // rule provably does not catch, recorded here so the header's blind-spot
    // list is checked by CI instead of trusted. If one of these starts failing,
    // the rule got better: move the case to `invalid` and update the header.
    {
      filename: SRC,
      code: ['const p = parseFloat', 'const n = p(ticket.sum)'].join('\n'),
    },
    {
      filename: SRC,
      code: [
        'const { parseFloat: pf } = globalThis',
        'const n = pf(ticket.sum)',
      ].join('\n'),
    },
    // An amount crossing a function boundary under a neutral parameter name.
    {
      filename: SRC,
      code: 'function toNumber(x) { return parseFloat(x) }',
    },
    // A reassigned alias is not followed.
    {
      filename: SRC,
      code: [
        "let raw = '0'",
        'raw = ticket.sum',
        'const n = parseFloat(raw)',
      ].join('\n'),
    },
    // Coercions are not parses.
    { filename: SRC, code: 'const n = +ticket.sum' },
    { filename: SRC, code: 'const n = ticket.sum * 1' },

    // --- allowlisted files -----------------------------------------------
    {
      filename: 'src/lib/tickets/amount.ts',
      code: 'const parsed = parseFloat(trimmed)',
    },
    {
      filename: '__tests__/lib/tickets/utils.test.ts',
      code: 'expect(parseFloat(ticket.sum)).toBe(1)',
    },
    {
      filename: 'src/lib/tickets/public.test.ts',
      code: 'const n = parseFloat(ticket.sum)',
    },
    {
      filename: 'src/components/TicketPricingGrid.stories.tsx',
      code: 'const n = parseFloat(p.price)',
    },
    {
      filename: 'scripts/report-ticket-revenue.ts',
      code: 'const n = parseFloat(ticket.sum)',
    },
    {
      filename: 'migrations/050-backfill/index.ts',
      code: 'const n = parseFloat(ticket.sum)',
    },

    // --- annotations ------------------------------------------------------
    {
      filename: SRC,
      code: [
        '// amount-parse-ok: provider sends a pre-validated integer here; a',
        '// miss throws in the caller rather than becoming 0.',
        'const n = parseFloat(ticket.sum)',
      ].join('\n'),
    },
    {
      filename: SRC,
      code: 'const n = parseFloat(ticket.sum) // amount-parse-ok: raw echo for the debug panel, NaN is rendered as-is',
    },
    {
      filename: SRC,
      code: [
        '// not-an-amount: `price` here is a sort rank on the pricing grid, not money',
        'const n = parseFloat(row.price)',
      ].join('\n'),
    },
    // A blank line between annotation and call still counts (block walk).
    {
      filename: SRC,
      code: [
        '// amount-parse-ok: legacy import path, sums are integers by contract',
        '',
        'const n = parseFloat(ticket.sum)',
      ].join('\n'),
    },
    // The marker may sit on any line the call spans.
    {
      filename: SRC,
      code: [
        'const n = parseFloat(',
        '  ticket.sum, // amount-parse-ok: multi-line call, sum is pre-validated',
        ')',
      ].join('\n'),
    },
  ],

  invalid: [
    // --- every shape the #898 sweep actually found ------------------------
    { filename: SRC, code: 'const n = parseFloat(ticket.sum)', errors: error },
    {
      filename: SRC,
      code: 'const n = parseFloat(ticket.sum_left)',
      errors: error,
    },
    {
      filename: SRC,
      code: 'const n = parseFloat(paymentDetails.sumLeft)',
      errors: error,
    },
    // A bare parameter name — PaymentDetailsModal's `formatCurrencyFromString`.
    { filename: SRC, code: 'const n = parseFloat(amount)', errors: error },
    { filename: SRC, code: 'const n = parseFloat(p.price)', errors: error },
    {
      filename: SRC,
      code: 'const n = parseFloat(ticket.price[0].price)',
      errors: error,
    },
    { filename: SRC, code: 'const n = parseInt(vat)', errors: error },
    { filename: SRC, code: 'const n = parseFloat(lowest.vat)', errors: error },
    // Both parses on one line are two violations, not one.
    {
      filename: SRC,
      code: 'const d = parseFloat(vat) % 1 === 0 ? parseInt(vat) : vat',
      errors: [
        { messageId: 'bareAmountParse' },
        { messageId: 'bareAmountParse' },
      ],
    },

    // --- other parser spellings -------------------------------------------
    { filename: SRC, code: 'const n = Number(order.sum)', errors: error },
    {
      filename: SRC,
      code: 'const n = Number.parseFloat(ticket.sum)',
      errors: error,
    },
    {
      filename: SRC,
      code: 'const n = Number.parseInt(ticket.sum, 10)',
      errors: error,
    },
    // Computed access by string literal.
    {
      filename: SRC,
      code: "const n = parseFloat(ticket['sum'])",
      errors: error,
    },

    // --- evasions ---------------------------------------------------------
    {
      filename: SRC,
      code: 'const n = parseFloat(String(ticket.sum))',
      errors: error,
    },
    {
      filename: SRC,
      code: 'const n = parseFloat(`${ticket.sum}`)',
      errors: error,
    },
    {
      filename: SRC,
      code: 'const n = parseFloat(ticket.sum.trim())',
      errors: error,
    },
    {
      filename: SRC,
      code: "const n = parseFloat(ticket.sum.replace(',', '.'))",
      errors: error,
    },
    {
      filename: SRC,
      code: "const n = parseFloat(ticket.sum ?? '0')",
      errors: error,
    },
    {
      filename: SRC,
      code: "const n = parseFloat(ticket.sum || '0')",
      errors: error,
    },
    {
      filename: SRC,
      code: "const n = parseFloat(ok ? ticket.sum : '0')",
      errors: error,
    },
    {
      filename: SRC,
      code: 'const n = parseFloat(ticket?.sum)',
      errors: error,
    },
    {
      filename: SRC,
      code: "const n = parseFloat('' + ticket.sum)",
      errors: error,
    },
    // A single-assignment local alias does not launder the value.
    {
      filename: SRC,
      code: ['const raw = ticket.sum', 'const n = parseFloat(raw)'].join('\n'),
      errors: error,
    },
    // Destructuring keeps the money name.
    {
      filename: SRC,
      code: ['const { sum } = ticket', 'const n = parseFloat(sum)'].join('\n'),
      errors: error,
    },

    // A directory NAMED `scripts` under src/ is product code, not the
    // root-level tooling the allowlist exempts.
    {
      filename: 'src/lib/scripts/probe-report.ts',
      code: 'const n = parseFloat(ticket.sum)',
      errors: error,
    },
    // Renamed destructuring binds to the KEY, not to the initializer.
    {
      filename: SRC,
      code: ['const { sum: raw } = ticket', 'const n = parseFloat(raw)'].join(
        '\n',
      ),
      errors: error,
    },
    {
      filename: SRC,
      code: [
        "const { sum: raw = '0' } = ticket",
        'const n = parseFloat(raw)',
      ].join('\n'),
      errors: error,
    },
    // The parser as a CALLBACK, where there is no parseFloat(x) call at all.
    {
      filename: SRC,
      code: 'const ns = [ticket.sum].map(Number)',
      errors: error,
    },
    {
      filename: SRC,
      code: 'const ns = tickets.map((t) => t.sum).map(parseFloat)',
      errors: error,
    },
    {
      filename: SRC,
      code: 'const ns = tickets.map((t) => t.sum).map(Number.parseFloat)',
      errors: error,
    },
    // Reaching the parser through a global object.
    {
      filename: SRC,
      code: 'const n = globalThis.parseFloat(ticket.sum)',
      errors: error,
    },
    // Vocabulary the first adversarial review got past the rule.
    { filename: SRC, code: 'const n = parseFloat(order.total)', errors: error },
    {
      filename: SRC,
      code: 'const n = parseFloat(order.totalPrice)',
      errors: error,
    },
    { filename: SRC, code: 'const n = parseFloat(order.fee)', errors: error },
    { filename: SRC, code: 'const n = parseFloat(order.net)', errors: error },

    // --- the six shapes a review probe got past the first rule -------------
    // A for-of binding IS a single-assignment local; the header claimed those
    // were resolved, and this one escaped.
    {
      filename: SRC,
      code: [
        'for (const s of tickets.map((t) => t.sum)) {',
        '  total += parseFloat(s)',
        '}',
      ].join('\n'),
      errors: error,
    },
    {
      filename: SRC,
      code: ['for (const s of [t.sum]) {', '  total += Number(s)', '}'].join(
        '\n',
      ),
      errors: error,
    },
    // `Array.from` takes its mapper as the SECOND argument.
    {
      filename: SRC,
      code: 'const ns = Array.from(prices, Number)',
      errors: error,
    },
    {
      filename: SRC,
      code: 'const ns = Array.from(order.sums, parseFloat)',
      errors: error,
    },
    // Reaching the parser indirectly.
    {
      filename: SRC,
      code: 'const n = parseFloat.call(null, ticket.sum)',
      errors: error,
    },
    {
      filename: SRC,
      code: 'const n = parseFloat.apply(null, [ticket.sum])',
      errors: error,
    },
    {
      filename: SRC,
      code: 'const n = (0, parseFloat)(ticket.sum)',
      errors: error,
    },
    // The amount arriving through an await or a bare money-named call.
    {
      filename: SRC,
      code: 'async function f() { return parseFloat(await order.sum) }',
      errors: error,
    },
    { filename: SRC, code: 'const n = parseFloat(sum())', errors: error },
    { filename: SRC, code: 'const n = parseFloat(order.sum())', errors: error },

    // --- annotations that do not suppress ---------------------------------
    // A bare marker with no reason suppresses nothing.
    {
      filename: SRC,
      code: ['// amount-parse-ok:', 'const n = parseFloat(ticket.sum)'].join(
        '\n',
      ),
      errors: error,
    },
    {
      filename: SRC,
      code: ['// not-an-amount:', 'const n = parseFloat(ticket.sum)'].join(
        '\n',
      ),
      errors: error,
    },
    // An unrelated comment is not a marker.
    {
      filename: SRC,
      code: [
        '// amounts are fine here',
        'const n = parseFloat(ticket.sum)',
      ].join('\n'),
      errors: error,
    },
    // Placed BELOW the call.
    {
      filename: SRC,
      code: [
        'const n = parseFloat(ticket.sum)',
        '// amount-parse-ok: too late, this governs nothing',
      ].join('\n'),
      errors: error,
    },
    // Separated from the call by a line carrying code.
    {
      filename: SRC,
      code: [
        '// amount-parse-ok: this one vouches for the line below it only',
        'const other = 1',
        'const n = parseFloat(ticket.sum)',
      ].join('\n'),
      errors: error,
    },
    // A marker TRAILING an earlier statement governs that statement, not the
    // next one — the line carries code, which is a hard stop.
    {
      filename: SRC,
      code: [
        'const a = 1 // amount-parse-ok: this vouches for the line it sits on',
        '',
        'const n = parseFloat(ticket.sum)',
      ].join('\n'),
      errors: error,
    },
    // A bare marker cannot borrow the next comment line as its reason.
    {
      filename: SRC,
      code: [
        '// amount-parse-ok:',
        '// TODO clean this up later',
        'const n = parseFloat(ticket.sum)',
      ].join('\n'),
      errors: error,
    },
    {
      filename: SRC,
      code: [
        '// not-an-amount:',
        '// unrelated note',
        'const n = parseFloat(ticket.sum)',
      ].join('\n'),
      errors: error,
    },
    // A marker inside a STRING is not a comment.
    {
      filename: SRC,
      code: [
        "const note = 'amount-parse-ok: pretending'",
        'const n = parseFloat(ticket.sum)',
      ].join('\n'),
      errors: error,
    },
  ],
})

tsRuleTester.run('no-bare-amount-parse (TypeScript syntax)', asRule, {
  valid: [
    {
      filename: SRC,
      code: 'const n: number = parseTicketAmount(ticket.sum as string)',
    },
  ],
  invalid: [
    {
      filename: SRC,
      code: 'const n = parseFloat(ticket.sum!)',
      errors: error,
    },
    {
      filename: SRC,
      code: 'const n = parseFloat(ticket.sum as string)',
      errors: error,
    },
    {
      filename: SRC,
      code: 'const n = parseFloat(ticket.sum satisfies string)',
      errors: error,
    },
  ],
})

const TSX = 'src/components/admin/AmountCell.tsx'

tsxRuleTester.run('no-bare-amount-parse (JSX)', asRule, {
  valid: [
    // The documented "comment block directly above" placement, written the only
    // way JSX allows.
    {
      filename: TSX,
      code: [
        'export const Cell = ({ ticket }) => (',
        '  <div>',
        '    {/* amount-parse-ok: legacy debug cell, a bad value renders NaN on purpose */}',
        '    {formatCurrency(parseFloat(ticket.sum))}',
        '  </div>',
        ')',
      ].join('\n'),
    },
    // Trailing on the parse's own line works as well.
    {
      filename: TSX,
      code: [
        'export const Cell = ({ ticket }) => (',
        '  <div>',
        '    {formatCurrency(parseFloat(ticket.sum))} {/* amount-parse-ok: as above */}',
        '  </div>',
        ')',
      ].join('\n'),
    },
  ],
  invalid: [
    {
      filename: TSX,
      code: [
        'export const Cell = ({ ticket }) => (',
        '  <div>{formatCurrency(parseFloat(ticket.sum))}</div>',
        ')',
      ].join('\n'),
      errors: error,
    },
    // A JSX marker with no reason is still no marker.
    {
      filename: TSX,
      code: [
        'export const Cell = ({ ticket }) => (',
        '  <div>',
        '    {/* amount-parse-ok: */}',
        '    {formatCurrency(parseFloat(ticket.sum))}',
        '  </div>',
        ')',
      ].join('\n'),
      errors: error,
    },
    // A marker above an unrelated JSX STATEMENT does not carry down.
    {
      filename: TSX,
      code: [
        'export const Cell = ({ ticket }) => (',
        '  <div>',
        '    {/* amount-parse-ok: this vouches for the label, not the amount */}',
        '    <span>{ticket.category}</span>',
        '    {formatCurrency(parseFloat(ticket.sum))}',
        '  </div>',
        ')',
      ].join('\n'),
      errors: error,
    },
  ],
})
