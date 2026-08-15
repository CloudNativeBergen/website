/**
 * ESLint rule: no-bare-amount-parse (#898).
 *
 * Guards ONE invariant: a money string from a ticketing provider becomes a
 * number in exactly one place — `parseTicketAmount` in `src/lib/tickets/
 * amount.ts` — so the NaN policy is decided once. Read that module's header for
 * the policy itself; this file is the enforcement.
 *
 * ---------------------------------------------------------------------------
 * WHY MECHANICAL, AND WHY IT REPLACES A COMMENT
 * ---------------------------------------------------------------------------
 *
 * #896 introduced the helper and enumerated the remaining call sites BY HAND,
 * in a docstring, "verified by grep". That enumeration was wrong twice over:
 * the docstring said twelve calls across six files, its own PR body said ten,
 * and its adversarial review then found `PaymentDetailsModal.tsx` parsing
 * `sum` and `sumLeft` in a SEVENTH file that no count had ever included — while
 * an identical `sumLeft` parse in `api.ts` was counted. A hand-count that has
 * been wrong twice will be wrong a third time, so the enumeration is now this
 * rule's output rather than anybody's grep. When this rule and a human list
 * disagree, the rule is the one to believe — and if the rule is blind to a
 * shape, the fix is a test case here, not a footnote elsewhere.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS FLAGGED
 * ---------------------------------------------------------------------------
 *
 * A call to `parseFloat` / `parseInt` / `Number` — bare, or through `Number.`,
 * `globalThis.`, `window.` — whose FIRST argument is an AMOUNT EXPRESSION: a
 * name (an identifier, a property, a computed `['sum']`) drawn from the money
 * vocabulary below. A parser passed as a `.map` / `.flatMap` / `.forEach`
 * CALLBACK is judged the same way, on its receiver.
 *
 *   parseFloat(ticket.sum)              flagged
 *   parseFloat(t.price[0].price)        flagged
 *   parseFloat(paymentDetails.sumLeft)  flagged
 *   parseInt(vat)                       flagged
 *
 * The argument is looked through, not just pattern-matched, so the obvious
 * evasions are covered — and each has a test case in
 * `no-bare-amount-parse.test.ts`:
 *
 *   parseFloat(String(ticket.sum))      unwrapped through String()/Number()
 *   parseFloat(`${ticket.sum}`)         unwrapped through a template literal
 *   parseFloat(ticket.sum.trim())       unwrapped through a member call
 *   parseFloat(ticket.sum ?? '0')       both branches of ??, || and ?:
 *   parseFloat(ticket.sum!)             unwrapped through !, `as`, `?.`
 *   const s = ticket.sum                a single-assignment local alias is
 *   parseFloat(s)                       resolved through the scope chain
 *   const { sum: raw } = ticket         a RENAMED destructure binds to the key,
 *   parseFloat(raw)                     so the key is what is judged
 *   [ticket.sum].map(Number)            the parser as a CALLBACK, over an
 *   tickets.map(t => t.sum).map(Number) amount-valued collection
 *   globalThis.parseFloat(ticket.sum)   reached through a global object
 *
 * The last four were all MISSED by the first version of this rule and found by
 * an adversarial review of it, which is the argument for having written the
 * review-the-guard step down as part of the work rather than trusting the
 * guard's own docstring. Each has a test case now.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS DELIBERATELY NOT FLAGGED — the scope boundary, stated
 * ---------------------------------------------------------------------------
 *
 *  - FORM INPUT, as it is written in this repo today. `parseFloat(e.target.value)`
 *    in a controlled number input is not a provider amount: the string is typed
 *    by a human one keystroke at a time, and `|| 0` there means "the box is
 *    empty", not "the feed is broken". Sponsor CRM `contractValue` is the same
 *    shape (a form string bound to a Sanity number). Both are real amounts;
 *    neither is a ticketing-provider payload, and folding them in would change
 *    what the helper's policy is about.
 *
 *    BE PRECISE ABOUT WHY THEY PASS: the vocabulary matches NAMES, and `value`
 *    / `contractValue` are absent from it. It is not a form-versus-provider
 *    judgement, and the rule cannot make one. A form value held under a money
 *    name — `const [amount, setAmount] = useState(''); parseFloat(amount)` — IS
 *    flagged, and that is the intended default: either route it through the
 *    helper (0 for unparseable is what `|| 0` already did) or annotate
 *    `// not-an-amount: <why>`. Bringing form input properly into scope means
 *    adding the names here and converting those sites in the same change.
 *
 *  - NON-MONEY numerics. PDF marker coordinates, hex colour components,
 *    durations and capacities parse strings too. The vocabulary is a money
 *    vocabulary; nothing about `parseFloat` alone is reported.
 *
 *  - PROVENANCE. `parseTicketAmount(x)` is accepted however `x` was obtained.
 *    This rule makes the parse consistent; it does not check that the value
 *    reaching it came from where you think.
 *
 * KNOWN BLIND SPOTS (measured against an adversarial probe of 24 shapes; say
 * them, do not paper over them):
 *  - An alias REASSIGNED after its declaration, or declared in more than one
 *    place, is not resolved — only a single-definition local is followed.
 *  - An amount that crosses a FUNCTION boundary as an ordinary parameter name
 *    (`function toNumber(x) { return parseFloat(x) }`) is invisible unless the
 *    parameter is money-named. Naming it `amount` / `sum` / `price` — which is
 *    what the code does — brings it back into view.
 *  - The PARSER itself aliased into a variable (`const p = parseFloat; p(x)`,
 *    `const { parseFloat: pf } = globalThis`) or invoked through an IIFE.
 *  - `+str` and `str * 1` are coercions this rule does not treat as parses
 *    (`Number(x)` as a call, and as a `.map` callback, are covered). None of
 *    these exist in `src/` today.
 *  - The rule is configured for `src/**\/*.{ts,tsx}`, so a `.js` / `.mjs` under
 *    `src/` would be outside it. None exists today.
 *
 * ---------------------------------------------------------------------------
 * ANNOTATION VOCABULARY — two markers, deliberately distinct
 * ---------------------------------------------------------------------------
 *
 *   // amount-parse-ok: <reason>   this IS a provider money string, parsed
 *                                 outside the helper on purpose. State what
 *                                 happens when it does not parse — that is the
 *                                 whole thing the helper centralises.
 *
 *   // not-an-amount: <why>        the vocabulary matched a name that is not
 *                                 money here (a `price` that is a rank, an
 *                                 `amount` of minutes). A false positive,
 *                                 recorded rather than silently tolerated.
 *
 * BOTH require a NON-EMPTY reason; a bare marker suppresses nothing. They are
 * independently greppable, and that is the point — `rg 'amount-parse-ok:'` is
 * the set a human must re-audit when the policy changes, and drowning it in
 * ordinary false positives would make it worthless:
 *
 *   rg 'amount-parse-ok:'   → deliberate parses outside the helper (audit these)
 *   rg 'not-an-amount:'     → vocabulary false positives
 *
 * WHAT AN ANNOTATION IS NOT. Both markers silence the report identically —
 * nothing verifies that a `not-an-amount:` claim is true, and a single marker
 * silences EVERY parse on the line it governs. They are a signed claim by an
 * author, reviewed in the diff, exactly like `groq-global:`; the separation
 * between the two sets is a convention for the auditor, not an enforcement.
 *
 * PLACEMENT follows `no-unscoped-groq`: a marker trailing on the call's own
 * line, or anywhere in the comment block directly above it. Blank lines are
 * skipped; a line carrying CODE is a hard stop, so a marker separated from the
 * call by a statement does not suppress, and one placed below it never applies.
 *
 * ---------------------------------------------------------------------------
 * SEVERITY: error, not a ratchet.
 * ---------------------------------------------------------------------------
 *
 * `no-unscoped-groq` is a warning behind a per-file ratchet because ~170
 * pre-existing unscoped reads cannot be fixed at once. Here the sweep in #898
 * took the count to ZERO, so there is nothing to grandfather, and a ratchet
 * pinned at 0 would be a strictly weaker guard than an error (it only fails on
 * an INCREASE per file, and it needs a second CI step to be read at all). If a
 * genuine exception appears, it gets an annotation and a reason — visible in
 * the diff — rather than a raised ceiling.
 */

'use strict'

const path = require('node:path')

/** Repo root, so allowlist segments are matched from the ROOT of the path. */
const REPO_ROOT = `${path.resolve(__dirname, '..').replace(/\\/g, '/')}/`

/** Money names. Deliberately excludes bare `value`; see the header. */
const DEFAULT_AMOUNT_NAMES = [
  'sum',
  'sums',
  'sum_left',
  'sumLeft',
  'sum_vat',
  'sumVat',
  'sum_paid',
  'sumPaid',
  'amount',
  'amounts',
  'amountLeft',
  'amount_left',
  'amountInclVat',
  'totalAmount',
  'total_amount',
  'orderSum',
  'price',
  'prices',
  'unitPrice',
  'ticketPrice',
  'vat',
  'vatPercent',
  'vatAmount',
  'revenue',
  'totalRevenue',
  'subtotal',
  'grandTotal',
  // An order-level total is the same money by another name; the first review
  // of this rule got `order.total` and `order.totalPrice` past it.
  'total',
  'totalPrice',
  'totalSum',
  'net',
  'netAmount',
  'gross',
  'grossAmount',
  'fee',
  'cost',
  'balance',
  'refund',
  'refundAmount',
  'discountValue',
  'discountAmount',
  'priceInclVat',
  'priceExVat',
]

/** Call names that turn a string into a number. */
const DEFAULT_PARSERS = ['parseFloat', 'parseInt', 'Number']

/** Objects a parser can be reached through: `Number.parseFloat`, `globalThis.parseFloat`. */
const GLOBAL_HOLDERS = new Set(['Number', 'globalThis', 'window', 'global'])

/** Array methods that apply a callback to every element. */
const ITERATION_METHODS = new Set(['map', 'flatMap', 'forEach'])

/**
 * Deliberate parse outside the helper. Requires a non-empty reason ON THE SAME
 * LINE: `[^\S\r\n]*` is horizontal whitespace only, so a bare `// amount-parse-ok:`
 * cannot borrow the first word of the NEXT comment line as its reason (a plain
 * `\s*` does exactly that once the block is joined, which made a bare marker
 * followed by any unrelated comment suppress the report). A reason may still
 * WRAP onto following lines — it just has to start here.
 */
const PARSE_OK_ANNOTATION = /amount-parse-ok:[^\S\r\n]*\S/

/** Vocabulary false positive. Same rule: the reason starts on the marker line. */
const NOT_AN_AMOUNT_ANNOTATION = /not-an-amount:[^\S\r\n]*\S/

/**
 * Files exempt from the rule. The helper module is the ONE place the parse is
 * allowed to be bare; tests, fixtures, scripts and migrations are tooling and
 * data-plane code, not product surfaces that render money.
 */
function isAllowlisted(filename) {
  if (!filename) return true
  const abs = filename.replace(/\\/g, '/')
  // Repo-RELATIVE, so `migrations/` and `scripts/` are exempt only at the root.
  // Unanchored, `src/lib/scripts/anything.ts` would have been exempt too — an
  // ordinary product directory silently outside the guard.
  const f = abs.startsWith(REPO_ROOT) ? abs.slice(REPO_ROOT.length) : abs
  return (
    /^(migrations|scripts|__tests__|eslint-rules)\//.test(f) ||
    /\.test\.[cm]?[jt]sx?$/.test(f) ||
    /\.spec\.[cm]?[jt]sx?$/.test(f) ||
    /\.stories\.[cm]?[jt]sx?$/.test(f) ||
    // The one module that decides the format.
    /^src\/lib\/tickets\/amount\.ts$/.test(f)
  )
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Route every ticketing-provider money string through parseTicketAmount, so the NaN policy is decided in one place (#898).',
      recommended: false,
    },
    schema: [
      {
        type: 'object',
        properties: {
          amountNames: { type: 'array', items: { type: 'string' } },
          parsers: { type: 'array', items: { type: 'string' } },
          helperName: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      bareAmountParse:
        'Bare `{{parser}}` on the amount `{{name}}`: this decides the NaN policy locally, which is how the repo ended up with three of them at once (`|| 0`, a `Number.isFinite` guard, and a raw NaN that turned a whole revenue total into NaN). Use `{{helper}}` from src/lib/tickets/amount.ts — an unparseable amount is 0 and is reported, never NaN. If this really must parse on its own, annotate `// amount-parse-ok: <reason, including what happens when it does not parse>`. If `{{name}}` is not money here, annotate `// not-an-amount: <why>`. See #898.',
    },
  },

  create(context) {
    const filename =
      (context.filename || (context.getFilename && context.getFilename())) ?? ''
    if (isAllowlisted(filename)) return {}

    const options = (context.options && context.options[0]) || {}
    const amountNames = new Set(options.amountNames || DEFAULT_AMOUNT_NAMES)
    const parsers = new Set(options.parsers || DEFAULT_PARSERS)
    const helperName = options.helperName || 'parseTicketAmount'

    const sourceCode =
      context.sourceCode || (context.getSourceCode && context.getSourceCode())

    // --- suppression plumbing (same shape as no-unscoped-groq) ---------------

    const commentsByEndLine = new Map()
    for (const c of sourceCode ? sourceCode.getAllComments() : []) {
      const bucket = commentsByEndLine.get(c.loc.end.line)
      if (bucket) bucket.push(c)
      else commentsByEndLine.set(c.loc.end.line, [c])
    }

    const sourceLines = sourceCode ? sourceCode.lines : []
    const isBlankLine = (n) => {
      const text = sourceLines[n - 1]
      return text !== undefined && /^\s*$/.test(text)
    }

    /**
     * Lines carrying a TOKEN, i.e. code. Comments are not tokens, so a line that
     * holds nothing but a comment is absent here. Without this, a comment
     * TRAILING a statement (`const a = 1 // amount-parse-ok: ...`) was collected
     * by the upward walk before the walk ever asked whether that line had code —
     * so a marker on any preceding statement silently vouched for the parse
     * below it, which is precisely what the header says cannot happen.
     */
    const tokensByLine = new Map()
    for (const token of (sourceCode &&
      sourceCode.ast &&
      sourceCode.ast.tokens) ||
      []) {
      for (let l = token.loc.start.line; l <= token.loc.end.line; l++) {
        const bucket = tokensByLine.get(l)
        if (bucket) bucket.push(token)
        else tokensByLine.set(l, [token])
      }
    }

    /**
     * The braces of a JSX expression container, and the whitespace-only JSXText
     * that runs between JSX children (a single token spanning the line break,
     * which is why an ordinary "any token means code" test fails here).
     */
    const isJsxCommentScaffolding = (token) =>
      (token.type === 'Punctuator' &&
        (token.value === '{' || token.value === '}')) ||
      (token.type === 'JSXText' && /^\s*$/.test(token.value))

    /**
     * JSX EXCEPTION. `{/* amount-parse-ok: … *\/}` on its own line is how a
     * comment is written inside JSX, and its `{` / `}` ARE tokens — so a naive
     * token test would call that line code and stop the walk, making the
     * documented "block directly above" placement quietly impossible in every
     * .tsx file. A line whose only tokens are those two braces is an expression
     * container holding a comment, not a statement.
     */
    const isCodeLine = (n) => {
      const tokens = tokensByLine.get(n)
      if (!tokens) return false
      return !tokens.every(isJsxCommentScaffolding)
    }

    /**
     * Every comment trailing on `line` plus the whole comment block above it.
     * The upward walk skips blank lines and STOPS at the first line carrying
     * code, so an annotation separated from the call by a statement never
     * reaches it and one placed below is never considered.
     */
    function governingCommentText(line) {
      const collected = []
      for (const c of commentsByEndLine.get(line) ?? []) collected.push(c)
      let expected = line - 1
      while (expected >= 1) {
        // HARD STOP first: a line with code ends the block, even if a comment
        // also trails on it.
        if (isCodeLine(expected)) break
        const block = commentsByEndLine.get(expected)
        if (block) {
          let top = expected
          for (const c of block) {
            collected.push(c)
            top = Math.min(top, c.loc.start.line)
          }
          expected = top - 1
          continue
        }
        if (isBlankLine(expected)) {
          expected -= 1
          continue
        }
        break
      }
      collected.sort((a, b) => a.range[0] - b.range[0])
      return collected.map((c) => c.value).join('\n')
    }

    function isSuppressed(node) {
      // A multi-line call may carry the marker on the line of the callee or on
      // the line of the argument; check every line the call spans.
      for (let line = node.loc.start.line; line <= node.loc.end.line; line++) {
        const text = governingCommentText(line)
        if (
          PARSE_OK_ANNOTATION.test(text) ||
          NOT_AN_AMOUNT_ANNOTATION.test(text)
        ) {
          return true
        }
      }
      return false
    }

    // --- is this call a parse? ----------------------------------------------

    function parserName(callee) {
      if (callee.type === 'Identifier' && parsers.has(callee.name)) {
        return callee.name
      }
      // `Number.parseFloat(x)`, and the global forms `globalThis.parseFloat(x)`
      // / `window.parseFloat(x)`.
      if (
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.object.type === 'Identifier' &&
        GLOBAL_HOLDERS.has(callee.object.name) &&
        callee.property.type === 'Identifier' &&
        parsers.has(callee.property.name)
      ) {
        return `${callee.object.name}.${callee.property.name}`
      }
      return null
    }

    // --- is this expression an amount? --------------------------------------

    /** Static property name of a member expression, computed or not. */
    function memberName(node) {
      if (!node.computed && node.property.type === 'Identifier') {
        return node.property.name
      }
      if (
        node.computed &&
        node.property.type === 'Literal' &&
        typeof node.property.value === 'string'
      ) {
        return node.property.value
      }
      return null
    }

    /**
     * Resolve a single-definition local with an initializer, so
     * `const s = ticket.sum; parseFloat(s)` is not a way around the rule.
     * Anything reassigned, or defined more than once, is left alone.
     */
    function resolveAlias(node) {
      if (!sourceCode || !sourceCode.getScope) return null
      let scope
      try {
        scope = sourceCode.getScope(node)
      } catch {
        return null
      }
      for (let s = scope; s; s = s.upper) {
        const variable = s.set && s.set.get(node.name)
        if (!variable) continue
        if (variable.defs.length !== 1) return null
        const def = variable.defs[0]
        // A write OUTSIDE the declaration means the value is no longer the one
        // written there. Counting writes instead would trip over a destructuring
        // default (`const { sum: raw = '0' } = ticket`), which records a second
        // write inside the very same declarator.
        const declRange = def.node.range
        const reassigned = variable.references.some(
          (r) =>
            r.isWrite() &&
            !(
              declRange &&
              r.identifier.range[0] >= declRange[0] &&
              r.identifier.range[1] <= declRange[1]
            ),
        )
        if (reassigned) return null
        if (def.type !== 'Variable' || !def.node.init) return null
        // RENAMED destructuring: `const { sum: raw } = ticket` binds `raw` to
        // the KEY `sum`, and the initializer (`ticket`) says nothing. Follow the
        // key instead. Missing this was a way to launder any money field
        // through a neutral name.
        const pattern = def.node.id
        if (pattern && pattern.type === 'ObjectPattern') {
          const key = destructuredKey(pattern, def.name)
          return key ? { name: key } : null
        }
        return { expression: def.node.init }
      }
      return null
    }

    /** The property KEY a destructuring pattern binds to `binding`. */
    function destructuredKey(pattern, binding) {
      for (const prop of pattern.properties) {
        if (prop.type !== 'Property') continue
        let value = prop.value
        // `const { sum: raw = '0' } = ticket`
        if (value.type === 'AssignmentPattern') value = value.left
        if (value !== binding) continue
        if (!prop.computed && prop.key.type === 'Identifier')
          return prop.key.name
        if (prop.key.type === 'Literal' && typeof prop.key.value === 'string') {
          return prop.key.value
        }
      }
      return null
    }

    /**
     * Walk an expression to the NAME it ultimately reads, looking through the
     * transformations that would otherwise defeat a pattern match. Returns the
     * matched money name, or null.
     */
    function amountName(node, depth = 0, seen = new Set()) {
      if (!node || depth > 6 || seen.has(node)) return null
      seen.add(node)
      const recur = (n) => amountName(n, depth + 1, seen)

      switch (node.type) {
        case 'Identifier': {
          if (amountNames.has(node.name)) return node.name
          const alias = resolveAlias(node)
          if (!alias) return null
          if (alias.name) return amountNames.has(alias.name) ? alias.name : null
          return recur(alias.expression)
        }

        case 'MemberExpression': {
          const name = memberName(node)
          if (name && amountNames.has(name)) return name
          // `t.price[0]` — an index into a money-named collection is money.
          if (node.computed && node.property.type !== 'Literal') return null
          if (node.computed) return recur(node.object)
          return null
        }

        case 'ChainExpression':
          return recur(node.expression)

        case 'TSNonNullExpression':
        case 'TSAsExpression':
        case 'TSSatisfiesExpression':
        case 'TSTypeAssertion':
          return recur(node.expression)

        case 'LogicalExpression':
          return recur(node.left) || recur(node.right)

        case 'ConditionalExpression':
          return recur(node.consequent) || recur(node.alternate)

        case 'BinaryExpression':
          if (node.operator !== '+') return null
          return recur(node.left) || recur(node.right)

        case 'TemplateLiteral': {
          for (const expr of node.expressions) {
            const name = recur(expr)
            if (name) return name
          }
          return null
        }

        case 'ArrayExpression': {
          // `[ticket.sum].map(Number)` — a collection of amounts is an amount.
          for (const element of node.elements) {
            if (!element) continue
            const name = recur(
              element.type === 'SpreadElement' ? element.argument : element,
            )
            if (name) return name
          }
          return null
        }

        case 'CallExpression': {
          // `String(x)` / `Number(x)` wrapping the amount.
          if (
            node.callee.type === 'Identifier' &&
            (node.callee.name === 'String' || node.callee.name === 'Number')
          ) {
            return recur(node.arguments[0])
          }
          // `x.trim()`, `x.toString()`, `x.replace(',', '.')` — the receiver is
          // still the value being parsed.
          if (node.callee.type === 'MemberExpression') {
            const calleeName = memberName(node.callee)
            // A call whose own NAME is money (`order.sum()`) counts too.
            if (calleeName && amountNames.has(calleeName)) return calleeName
            // `tickets.map((t) => t.sum)` — a projection ONTO an amount is a
            // collection of amounts, which is how `.map(parseFloat)` reached
            // the same strings without naming them.
            if (calleeName && ITERATION_METHODS.has(calleeName)) {
              const cb = node.arguments[0]
              if (
                cb &&
                (cb.type === 'ArrowFunctionExpression' ||
                  cb.type === 'FunctionExpression') &&
                cb.body.type !== 'BlockStatement'
              ) {
                const projected = recur(cb.body)
                if (projected) return projected
              }
            }
            return recur(node.callee.object)
          }
          return null
        }

        default:
          return null
      }
    }

    /**
     * `sums.map(parseFloat)` / `[t.sum].map(Number)` — the parser is the
     * CALLBACK, so there is no `parseFloat(x)` call expression to match. The
     * receiver is judged instead. Only flagged when the receiver is itself an
     * amount expression, so `hexPairs.map(Number)` stays quiet.
     */
    function callbackParser(node) {
      if (node.callee.type !== 'MemberExpression') return null
      const method = memberName(node.callee)
      if (!method || !ITERATION_METHODS.has(method)) return null
      const cb = node.arguments[0]
      if (!cb) return null
      if (cb.type === 'Identifier' && parsers.has(cb.name)) return cb.name
      if (
        cb.type === 'MemberExpression' &&
        !cb.computed &&
        cb.object.type === 'Identifier' &&
        GLOBAL_HOLDERS.has(cb.object.name) &&
        cb.property.type === 'Identifier' &&
        parsers.has(cb.property.name)
      ) {
        return `${cb.object.name}.${cb.property.name}`
      }
      return null
    }

    return {
      CallExpression(node) {
        const asCallback = callbackParser(node)
        if (asCallback) {
          const name = amountName(node.callee.object)
          if (name && !isSuppressed(node)) {
            context.report({
              node,
              messageId: 'bareAmountParse',
              data: { parser: asCallback, name, helper: helperName },
            })
          }
          return
        }
        const parser = parserName(node.callee)
        if (!parser) return
        if (node.arguments.length === 0) return
        const arg = node.arguments[0]
        if (arg.type === 'SpreadElement') return
        const name = amountName(arg)
        if (!name) return
        if (isSuppressed(node)) return
        context.report({
          node,
          messageId: 'bareAmountParse',
          data: { parser, name, helper: helperName },
        })
      },
    }
  },
}
