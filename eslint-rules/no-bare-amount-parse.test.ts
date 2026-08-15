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
    // A money name that is not being parsed is not this rule's business.
    { filename: SRC, code: 'const label = formatCurrency(order.sum)' },
    // parseFloat with no argument must not crash the rule.
    { filename: SRC, code: 'const n = parseFloat()' },

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
