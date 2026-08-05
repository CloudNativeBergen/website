/**
 * GROQ tenant-scope ENGINE (RunKonf/platform#48, P1).
 *
 * A parser-based answer to one question, asked once per ROOT FILTER rather than
 * once per query literal:
 *
 *     does this read of `*` constrain itself to a single tenant?
 *
 * The engine is deliberately free of ESLint: it takes a query string and a
 * VOCABULARY (which fields and parameters name a tenant), and returns a verdict
 * per root filter. `eslint-rules/no-unscoped-groq.js` supplies this repo's
 * vocabulary and does the reporting; `RunKonf/kontroll` supplies its own — no
 * builder, no ambient tenant, an `_id ==` axis that DOES count there. One engine,
 * two contracts, so a fix in either repo is a fix in both (P3 adds the drift
 * guard that makes that true rather than aspirational).
 *
 * ---------------------------------------------------------------------------
 * WHY A PARSER
 * ---------------------------------------------------------------------------
 *
 * The regex predecessor anchored on the first `*[_type ==` / `*[_id ==` token in
 * a literal. That has two consequences, and the famous one is the smaller one:
 *
 *  - VISIBILITY: predicate reorder, reversed comparison, `_type match`, `_id in
 *    $ids`, a filter opening on `references(...)` or `slug.current`, and —
 *    structurally — every NESTED root filter, were invisible. `exec()` runs once
 *    and stops at the outermost `*[`.
 *  - PRECISION: the rule never inspected a root filter for a tenant predicate at
 *    all. A correctly scoped hand-written query and a genuinely unscoped one
 *    produced byte-identical diagnostics; roughly a quarter of its output was on
 *    queries scoped exactly the way docs/TENANT_SCOPING.md prescribes. That is
 *    why a real cross-tenant leak (#823) shipped after the rule had flagged both
 *    offending queries: true positives were indistinguishable from false ones.
 *
 * Parsing closes both at once. A `Filter` node whose base is `Everything` IS a
 * root filter, wherever it sits and however it is written, and its predicate is
 * a tree that can be asked about tenant constraints structurally.
 *
 * ---------------------------------------------------------------------------
 * THE LOCATION PROBLEM — the one piece of cleverness here
 * ---------------------------------------------------------------------------
 *
 * groq-js 2.0.0 AST nodes carry NO source spans (positions exist only on
 * `GroqSyntaxError`). Per-root reporting needs a source position per root, so the
 * k-th `Everything` node in walk order is paired with the k-th `*` token in the
 * text. Walk order and textual order coincide for GROQ's grammar — every node
 * that has a `base` puts it first textually, and `Object.keys` order on groq-js
 * node objects follows the same order.
 *
 * That claim is not taken on faith. Each pairing is VERIFIED: the root's own text
 * is re-extracted from the source, re-parsed on its own, and structurally
 * compared with the walked node. A single mismatch — or a count mismatch between
 * text and AST — invalidates the whole mapping (`locationsReliable: false`), and
 * the caller falls back to reporting at the literal rather than silently pointing
 * at the wrong line. The mapping is self-checking at every call site, not just in
 * the tests.
 *
 * ---------------------------------------------------------------------------
 * WHAT "SCOPED" MEANS
 * ---------------------------------------------------------------------------
 *
 * A predicate is judged recursively, which is the exact form of "every disjunct
 * must contain a tenant conjunct":
 *
 *     scoped(a || b) = scoped(a) AND scoped(b)     an alternative that is not
 *                                                  scoped widens the read
 *     scoped(a && b) = scoped(a) OR  scoped(b)     one tenant conjunct suffices
 *     scoped(leaf)   = leaf is a tenant predicate
 *
 * The recursion (rather than a two-level disjunct/conjunct split) is what lets
 * `_type == "x" && (conference._ref == $conferenceId || organization._ref ==
 * $orgId)` — a genuinely scoped query — report clean, while
 * `!defined($conferenceId) || conference._ref == $conferenceId` — fail-OPEN by
 * construction — does not.
 *
 * The tenant-predicate vocabulary (T1–T6) and the deliberate NON-recognitions
 * live in `TENANT_PREDICATE_FORMS` below, next to the code that implements them.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS CANNOT DO
 * ---------------------------------------------------------------------------
 *
 * PARAMETER PROVENANCE. The engine checks predicate SHAPE, not where
 * `$conferenceId` was bound from. A query reading `conference._ref ==
 * $conferenceId` with a client-supplied id reports CLEAN here — that was #826's
 * actual bug. Provenance belongs to the authz waist (`ctx.orgId`, `scopedFetch`,
 * `resolveConferenceId`), not to a static shape check. Stated plainly so nobody
 * treats a clean run as proof of authorization.
 */

'use strict'

const { parse } = require('groq-js')

/**
 * The tenant-predicate vocabulary, as data. Each form is recognised in EITHER
 * operand order.
 *
 *   T1  <tenant-field>._ref == $tenant-param      conference._ref == $conferenceId
 *   T2  <tenant-field>._ref in  $tenant-plural    conference._ref in $conferenceIds
 *   T3  deref traversal ending in T1/T2           conference->organization._ref == $orgId
 *   T4  $tenant-ref in <array-field>[]._ref       $orgRef in organizations[]._ref
 *   T5  references($tenant-param)                 references($conferenceId)
 *   T6  parent correlation, NESTED roots only,    conference._ref == ^.conference._ref
 *       and only when the parent root is scoped
 *
 * Two optional axes exist for other repos' contracts, both OFF by default here:
 *   idEquals   `_id == $tenant-param` / `_id in $tenant-plural` counts as scoped
 *              (true in kontroll, where an org IS a document; false here, where
 *              `_id` is a dataset-wide key and ownership lives at the caller)
 *   identity   `<identity-field> == $identity-param` counts as scoped
 *              (kontroll's `redeemedBy == $userKey`)
 *
 * DELIBERATELY NOT RECOGNISED, in any repo:
 *   - `!=` in any position — excluding one tenant is the opposite of scoping.
 *   - a tenant predicate under a disjunct that lacks one (fail-open).
 *   - a predicate carried in an interpolation — the injected text can escape the
 *     bracket, so what is visible is not what runs.
 *   - `references()` on a non-tenant parameter, `slug.current == $slug`, `_type`
 *     filters, date filters: none of them bounds the read to a tenant.
 */
const TENANT_PREDICATE_FORMS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6']

/** This repo's vocabulary. kontroll passes its own; see the rule's options. */
const DEFAULT_VOCABULARY = {
  /** Fields whose `._ref` names the owning tenant. */
  tenantFields: ['conference', 'organization'],
  /** Array fields whose `[]._ref` may contain a tenant ref (T4). */
  tenantArrayFields: ['conferences', 'organizations'],
  /** Bound single-tenant parameters (T1/T3/T5). */
  tenantParams: ['conferenceId', 'orgId', 'organizationId', 'organisationId'],
  /** Bound tenant-SET parameters (T2) — the caller owes that the set is proven. */
  tenantParamsPlural: [
    'conferenceIds',
    'orgIds',
    'organizationIds',
    'organisationIds',
  ],
  /** Parameters holding a tenant REF, used on the left of T4. */
  tenantRefParams: ['orgRef', 'organizationRef', 'conferenceRef'],
  /** `_id == $tenant-param` counts as scoped (kontroll: true). */
  idEqualsCounts: false,
  /** Identity axis: `<field> == $param` (kontroll: redeemedBy/userKey). */
  identityFields: [],
  identityParams: [],
}

/**
 * Parameter names the engine mints for `${…}` interpolations. Never a tenant
 * name, by construction, so an interpolated predicate can never look scoped.
 */
const INTERP_PARAM_PREFIX = '__groqInterp'

// ---------------------------------------------------------------------------
// Textual scanning
// ---------------------------------------------------------------------------

/**
 * Words after which a `*` still opens an expression. Without these, `_id in
 * *[_type == "conference"]` reads as "identifier, then multiplication" and the
 * root filter is missed — which is exactly the miscount the pairing check exists
 * to catch, and did.
 */
const OPERATOR_WORDS = new Set(['in', 'match', 'and', 'or', 'not'])

/** After an operand, `*` is multiplication; after anything else it is `Everything`. */
function endsOperand(token) {
  if (token === '') return false
  if (OPERATOR_WORDS.has(token)) return false
  if (/^[A-Za-z_]/.test(token)) return true
  if (/^[0-9]/.test(token)) return true
  return `)]}"'`.includes(token)
}

/**
 * Every `*` in `text` that denotes GROQ's `Everything`, in textual order.
 *
 * String literals and `//` comments are skipped, so a `*[` inside a quoted value
 * is not mistaken for a root filter. The scanner tracks the last significant
 * TOKEN rather than the last character, because whether `*` is `Everything` or
 * multiplication depends on what precedes it as a token.
 *
 * Chained filters (`*[a][b]`) produce ONE entry: there is one `Everything`.
 */
function scanEverythingTokens(text) {
  const out = []
  let i = 0
  let lastToken = ''
  while (i < text.length) {
    const ch = text[i]
    if (ch === '"' || ch === "'") {
      const quote = ch
      i++
      while (i < text.length) {
        if (text[i] === '\\') {
          i += 2
          continue
        }
        if (text[i] === quote) {
          i++
          break
        }
        i++
      }
      lastToken = quote
      continue
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      continue
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i
      while (j < text.length && /[A-Za-z0-9_]/.test(text[j])) j++
      lastToken = text.slice(i, j)
      i = j
      continue
    }
    if (/[0-9]/.test(ch)) {
      let j = i
      while (j < text.length && /[0-9.]/.test(text[j])) j++
      lastToken = '0'
      i = j
      continue
    }
    if (ch === '*') {
      if (!endsOperand(lastToken)) out.push(i)
      lastToken = '*'
      i++
      continue
    }
    if (!/\s/.test(ch)) lastToken = ch
    i++
  }
  return out
}

/**
 * `*` tokens the SUBSTITUTION swallowed.
 *
 * This is the one way a parser can be quieter than the regex it replaced, and it
 * is worth stating in full because every part of the machine agrees, wrongly:
 *
 *     `${prefix}*[_type == "talk"]`
 *
 * substitutes to `$__groqInterp0*[_type == "talk"]`, which is valid GROQ —
 * a parameter MULTIPLIED by an array literal. No `Everything` node is created,
 * so there is no root to judge. The star scanner independently agrees (a `*`
 * after an operand is multiplication), so the counts match and the location
 * mapping "verifies" — both sides correctly agree there is no root. Zero roots,
 * zero diagnostics, on a query that reads every tenant at runtime.
 *
 * The old regex flagged it, because `/\*\s*\[\s*_(type|id)\s*==/` did not care
 * what preceded the `*`.
 *
 * So: any `*` separated from a placeholder by whitespace alone, which the scanner
 * did NOT count as an `Everything`, is reported. The test is PLACEHOLDER-ness,
 * not the placeholder's shape — every rung the ladder can emit ends in an operand
 * (`$p`, `_id`, `0`, `"…"`, `{…}`, `[0…1]`), and a future rung would inherit the
 * guard for free.
 *
 * The real prefix is unknown text. It might close the expression and leave a
 * genuine root; it might itself contain a root filter. Neither can be checked, so
 * this fails closed.
 */
function findMaskedStars(text, spans, tokens) {
  if (spans.length === 0) return []
  const counted = new Set(tokens)
  const out = []
  for (const span of spans) {
    let i = span.end
    while (i < text.length && /\s/.test(text[i])) i++
    if (text[i] === '*' && !counted.has(i)) out.push(i)
  }
  return out.sort((a, b) => a - b)
}

/**
 * groq-js rejects a slice whose bounds are not constant numbers — `[0...$limit]`
 * and `[$from...$to]` are syntax errors, though Sanity itself accepts them. They
 * say nothing about tenant scoping, so they are rewritten to `[0...1]`, PADDED TO
 * THE SAME LENGTH so every offset the caller holds stays valid.
 */
function normalizeSliceBounds(text) {
  return text.replace(
    /\[\s*(\$[A-Za-z_]\w*|\d+)\s*\.\.\.?\s*(\$[A-Za-z_]\w*|\d+)\s*\]/g,
    (match, left, right) => {
      if (!left.startsWith('$') && !right.startsWith('$')) return match
      const inner = '0...1'
      return `[${inner}${' '.repeat(match.length - 2 - inner.length)}]`
    },
  )
}

/**
 * The source text of the construct that starts at the `*` at `start`: the `*`
 * plus every chained postfix bracket (`*[a][0]`), stopping before a projection or
 * a pipe. Enough to re-parse the root on its own, which is how the AST↔text
 * pairing is verified.
 */
function rootSourceText(text, start) {
  let i = start + 1
  for (;;) {
    while (i < text.length && /\s/.test(text[i])) i++
    if (text[i] !== '[') break
    let depth = 0
    let closed = -1
    for (let j = i; j < text.length; j++) {
      const ch = text[j]
      if (ch === '"' || ch === "'") {
        const quote = ch
        j++
        while (j < text.length) {
          if (text[j] === '\\') {
            j += 2
            continue
          }
          if (text[j] === quote) break
          j++
        }
        continue
      }
      if (ch === '[' || ch === '(' || ch === '{') depth++
      else if (ch === ']' || ch === ')' || ch === '}') {
        depth--
        if (depth === 0) {
          closed = j
          break
        }
      }
    }
    if (closed === -1) return text.slice(start)
    i = closed + 1
  }
  return text.slice(start, i)
}

// ---------------------------------------------------------------------------
// AST walking
// ---------------------------------------------------------------------------

const isNode = (v) =>
  v !== null && typeof v === 'object' && typeof v.type === 'string'

/**
 * Node types whose VALUE is their `base`'s value narrowed or reshaped — so a
 * chain like `*[a][0]{…}` still denotes the same `Everything`, and a nested root
 * inside their `expr` correlates (`^.`) to it.
 */
const VALUE_CHAIN_TYPES = new Set([
  'Filter',
  'Map',
  'FlatMap',
  'Projection',
  'AccessElement',
  'Slice',
  'Group',
  'ArrayCoerce',
  'PipeFuncCall',
])

/** Node types whose `expr` is evaluated in the scope of their `base`. */
const SCOPE_INTRODUCING_TYPES = new Set([
  'Filter',
  'Map',
  'FlatMap',
  'Projection',
])

/**
 * `!defined($conferenceId)` / `!defined(conference)` — a tenant predicate that
 * evaporates when its own key is absent. Fail-OPEN by construction: no tenant
 * means every tenant.
 */
function makeFailOpenTest(vocab) {
  const names = new Set([
    ...vocab.tenantParams,
    ...vocab.tenantParamsPlural,
    ...vocab.tenantFields,
  ])
  const isTenantish = (node) => {
    if (!isNode(node)) return false
    if (node.type === 'Parameter') return names.has(node.name)
    if (node.type === 'AccessAttribute') {
      let cur = node
      while (isNode(cur.base) && cur.base.type === 'AccessAttribute') {
        cur = cur.base
      }
      return (
        names.has(cur.name) && (!isNode(cur.base) || cur.base.type === 'This')
      )
    }
    return false
  }
  return (node) =>
    isNode(node) &&
    node.type === 'Not' &&
    isNode(node.base) &&
    node.base.type === 'FuncCall' &&
    node.base.name === 'defined' &&
    Array.isArray(node.base.args) &&
    node.base.args.length === 1 &&
    isTenantish(node.base.args[0])
}

/**
 * Every `Everything` in the query, in walk order, with the predicate(s) that
 * constrain it, the root it is nested inside, and whether a fail-open tenant
 * predicate was found within its scope.
 *
 * `exprs` holds the predicate of every filter chained onto this `Everything`
 * (`*[a][b]` constrains by `a && b`), so a scope predicate in a chained filter is
 * not lost. A filter whose base is NOT a root (`items[…]` in a projection)
 * contributes nothing — crediting it to the enclosing root would let a nested
 * predicate vouch for the root wrapped around it, which is the bug the old
 * `rootFilterText()` depth scan existed to avoid.
 */
function collectRoots(ast, isFailOpen) {
  const roots = []
  let unattachedFailOpen = false

  /**
   * @returns the index of the root this node's VALUE denotes, or null.
   * `scopeIdx` is the root a `^.` inside this node would correlate to.
   */
  function visit(node, scopeIdx) {
    if (!isNode(node)) return null

    if (node.type === 'Everything') {
      const idx = roots.length
      roots.push({ index: idx, exprs: [], parent: scopeIdx, failOpen: false })
      return idx
    }

    if (isFailOpen && isFailOpen(node)) {
      if (scopeIdx !== null && roots[scopeIdx]) roots[scopeIdx].failOpen = true
      else unattachedFailOpen = true
      // Keep walking: a nested root can still hide inside the argument.
    }

    let baseRoot = null
    let childScope = scopeIdx
    const introducesScope = SCOPE_INTRODUCING_TYPES.has(node.type)

    for (const key of Object.keys(node)) {
      if (key === 'type') continue
      const value = node[key]
      const scopeForChild = key === 'base' ? scopeIdx : childScope
      if (Array.isArray(value)) {
        for (const el of value) if (isNode(el)) visit(el, scopeForChild)
      } else if (isNode(value)) {
        const result = visit(value, scopeForChild)
        if (key === 'base') {
          baseRoot = result
          if (introducesScope && result !== null) childScope = result
        }
      }
    }

    // A filter chained onto a ROOT constrains that root.
    if (node.type === 'Filter' && baseRoot !== null) {
      roots[baseRoot].exprs.push(node.expr)
    }

    return VALUE_CHAIN_TYPES.has(node.type) ? baseRoot : null
  }

  visit(ast, null)
  return { roots, unattachedFailOpen }
}

// ---------------------------------------------------------------------------
// The tenant-predicate vocabulary, structurally
// ---------------------------------------------------------------------------

function makeVocabulary(overrides) {
  const merged = { ...DEFAULT_VOCABULARY, ...(overrides || {}) }
  return {
    tenantFields: new Set(merged.tenantFields),
    tenantArrayFields: new Set(merged.tenantArrayFields),
    tenantParams: new Set(merged.tenantParams),
    tenantParamsPlural: new Set(merged.tenantParamsPlural),
    tenantRefParams: new Set(merged.tenantRefParams),
    idEqualsCounts: Boolean(merged.idEqualsCounts),
    identityFields: new Set(merged.identityFields),
    identityParams: new Set(merged.identityParams),
  }
}

/** `conference._ref`, `conference->organization._ref`, `^.conference._ref`. */
function tenantRefPath(node, vocab) {
  if (
    !isNode(node) ||
    node.type !== 'AccessAttribute' ||
    node.name !== '_ref'
  ) {
    return false
  }
  const owner = node.base
  return (
    isNode(owner) &&
    owner.type === 'AccessAttribute' &&
    vocab.tenantFields.has(owner.name)
  )
}

function containsParent(node) {
  if (!isNode(node)) return false
  if (node.type === 'Parent') return true
  return Object.keys(node).some((key) => {
    const value = node[key]
    if (Array.isArray(value)) return value.some((el) => containsParent(el))
    return containsParent(value)
  })
}

/** A bare top-level attribute access, e.g. `_id` or `redeemedBy`. */
function bareAttribute(node, name) {
  return (
    isNode(node) &&
    node.type === 'AccessAttribute' &&
    node.name === name &&
    (!isNode(node.base) || node.base.type === 'This')
  )
}

function isParam(node, set) {
  return isNode(node) && node.type === 'Parameter' && set.has(node.name)
}

/** `organizations[]._ref` — the right-hand side of T4. */
function tenantArrayRefPath(node, vocab) {
  if (!isNode(node) || node.type !== 'Map') return false
  if (!isNode(node.expr) || node.expr.type !== 'AccessAttribute') return false
  if (node.expr.name !== '_ref') return false
  let base = node.base
  if (isNode(base) && base.type === 'ArrayCoerce') base = base.base
  return (
    isNode(base) &&
    base.type === 'AccessAttribute' &&
    vocab.tenantArrayFields.has(base.name)
  )
}

/**
 * Is this leaf a tenant predicate? `ctx` carries whether the root is nested and
 * whether its parent root is itself scoped, which is what makes T6 sound: a
 * correlation to an UNSCOPED parent correlates to nothing.
 */
function isTenantPredicate(node, vocab, ctx) {
  if (!isNode(node)) return false

  if (node.type === 'FuncCall') {
    // T5
    return (
      node.name === 'references' &&
      Array.isArray(node.args) &&
      node.args.some((arg) => isParam(arg, vocab.tenantParams))
    )
  }

  if (node.type !== 'OpCall') return false

  const { op, left, right } = node

  if (op === '==') {
    const sides = [
      [left, right],
      [right, left],
    ]
    for (const [a, b] of sides) {
      // T1 / T3
      if (tenantRefPath(a, vocab) && isParam(b, vocab.tenantParams)) {
        if (!containsParent(a)) return true
      }
      // T6 — only for a nested root under a scoped parent.
      if (
        ctx.isNested &&
        ctx.parentScoped &&
        tenantRefPath(a, vocab) &&
        !containsParent(a) &&
        tenantRefPath(b, vocab) &&
        containsParent(b)
      ) {
        return true
      }
      // identity axis (off in this repo)
      if (
        vocab.identityFields.size > 0 &&
        isNode(a) &&
        a.type === 'AccessAttribute' &&
        vocab.identityFields.has(a.name) &&
        isParam(b, vocab.identityParams)
      ) {
        return true
      }
      // `_id == $orgId` (off in this repo — see D3)
      if (
        vocab.idEqualsCounts &&
        bareAttribute(a, '_id') &&
        isParam(b, vocab.tenantParams)
      ) {
        return true
      }
    }
    return false
  }

  if (op === 'in') {
    // T2
    if (
      tenantRefPath(left, vocab) &&
      isParam(right, vocab.tenantParamsPlural)
    ) {
      return true
    }
    // T4
    if (
      (isParam(left, vocab.tenantParams) ||
        isParam(left, vocab.tenantRefParams)) &&
      tenantArrayRefPath(right, vocab)
    ) {
      return true
    }
    if (
      vocab.idEqualsCounts &&
      bareAttribute(left, '_id') &&
      isParam(right, vocab.tenantParamsPlural)
    ) {
      return true
    }
    return false
  }

  return false
}

/**
 * `scoped(a || b) = scoped(a) && scoped(b)`, `scoped(a && b) = scoped(a) ||
 * scoped(b)`, `scoped(leaf) = isTenantPredicate(leaf)`. See the header.
 */
function isScopedExpr(node, vocab, ctx) {
  if (!isNode(node)) return false
  if (node.type === 'Or') {
    return (
      isScopedExpr(node.left, vocab, ctx) &&
      isScopedExpr(node.right, vocab, ctx)
    )
  }
  if (node.type === 'And') {
    return (
      isScopedExpr(node.left, vocab, ctx) ||
      isScopedExpr(node.right, vocab, ctx)
    )
  }
  if (node.type === 'Group') return isScopedExpr(node.base, vocab, ctx)
  return isTenantPredicate(node, vocab, ctx)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyse one flattened query string.
 *
 * @param {string} text  the query, with every `${…}` already substituted
 * @param {object} opts
 *   - vocabulary: partial {@link DEFAULT_VOCABULARY} override
 *   - interpolationSpans: `[{ start, end }]` in `text`, in textual order
 *   - builderInsertIndex: the text offset a query builder splices its tenant
 *     predicate into (`scopedQuery` uses `indexOf('*[')`), or null. The root
 *     starting there — and ONLY that root — is credited with the predicate.
 * @returns {{
 *   parsed: boolean,
 *   error?: string,
 *   locationsReliable: boolean,
 *   roots: Array<{ index, start, scoped, hasPredicate, interpolated,
 *                  interpolatedLeading, failOpen, creditedToBuilder }>,
 *   unattachedFailOpen: boolean,
 *   maskedStars: number[],   text offsets of `*` tokens a substitution swallowed
 * }}
 */
function analyzeQuery(rawText, opts) {
  const options = opts || {}
  const vocab = makeVocabulary(options.vocabulary)
  const spans = options.interpolationSpans || []
  const text = normalizeSliceBounds(rawText)

  let ast
  try {
    ast = parse(text)
  } catch (error) {
    return {
      parsed: false,
      error: error && error.message ? error.message : String(error),
      locationsReliable: false,
      roots: [],
      unattachedFailOpen: false,
      maskedStars: [],
    }
  }

  const { roots, unattachedFailOpen } = collectRoots(
    ast,
    makeFailOpenTest(vocab),
  )

  const tokens = scanEverythingTokens(text)
  let locationsReliable = tokens.length === roots.length

  if (locationsReliable) {
    // VERIFY the pairing rather than assume it: re-parse each root's own text and
    // compare it with the walked node. Any mismatch invalidates the mapping.
    for (let i = 0; i < roots.length && locationsReliable; i++) {
      const fragment = rootSourceText(text, tokens[i])
      let fragmentAst
      try {
        fragmentAst = parse(fragment)
      } catch {
        locationsReliable = false
        break
      }
      const fragmentRoots = collectRoots(fragmentAst, null).roots
      if (fragmentRoots.length === 0) {
        locationsReliable = false
        break
      }
      const expected = JSON.stringify(fragmentRoots[0].exprs)
      const actual = JSON.stringify(roots[i].exprs)
      if (expected !== actual) locationsReliable = false
    }
  }

  // Without a trustworthy mapping the engine cannot tell WHICH root an
  // interpolation sits in, so every root is treated as interpolated. Fail closed:
  // a visible tenant predicate must never vouch for text the engine cannot place.
  const interpolationUnplaceable = !locationsReliable && spans.length > 0

  const maskedStars = findMaskedStars(text, spans, tokens)

  const analysedByIndex = []
  const analysed = roots.map((root, i) => {
    const start = locationsReliable ? tokens[i] : null
    const end =
      start !== null ? start + rootSourceText(text, start).length : null

    const inside = (span) =>
      start !== null && end !== null && span.start >= start && span.end <= end
    const covering = spans.filter(inside)
    const interpolated = interpolationUnplaceable || covering.length > 0
    // The predicate's FIRST token is an interpolation: `*[${filter} && …]`, the
    // shape the old rule called `interpolatedFilter`.
    let interpolatedLeading = false
    if (interpolated && start !== null) {
      const open = text.indexOf('[', start)
      if (open !== -1) {
        const firstNonSpace = text.slice(open + 1).search(/\S/)
        if (firstNonSpace !== -1) {
          interpolatedLeading = covering.some(
            (span) => span.start === open + 1 + firstNonSpace,
          )
        }
      }
    }

    const creditedToBuilder =
      options.builderInsertIndex !== null &&
      options.builderInsertIndex !== undefined &&
      (locationsReliable ? start === options.builderInsertIndex : i === 0)
    const parentScoped =
      root.parent !== null && analysedByIndex[root.parent]
        ? analysedByIndex[root.parent].scoped
        : false

    const ctx = { isNested: root.parent !== null, parentScoped }
    const hasPredicate = root.exprs.length > 0
    const ownScoped =
      hasPredicate &&
      !interpolated &&
      root.exprs.some((expr) => isScopedExpr(expr, vocab, ctx))

    const entry = {
      index: i,
      start,
      hasPredicate,
      interpolated,
      interpolatedLeading,
      failOpen: root.failOpen,
      creditedToBuilder,
      scoped: creditedToBuilder || ownScoped,
    }
    analysedByIndex[i] = entry
    return entry
  })

  return {
    parsed: true,
    locationsReliable,
    roots: analysed,
    unattachedFailOpen,
    maskedStars,
  }
}

/**
 * Parse `text` for its own sake, reporting HOW FAR the parser got. The offset is
 * what lets a caller hill-climb an interpolation substitution: a substitute that
 * moves the syntax error further right is a better guess for that position, even
 * if the query still does not parse.
 */
function probeParse(text) {
  try {
    parse(text)
    return { parsed: true, position: Number.POSITIVE_INFINITY }
  } catch (error) {
    return {
      parsed: false,
      // A `GroqSyntaxError` says where it stopped. Everything else — "slicing
      // must use constant numbers", "cannot determine property key" — is thrown
      // AFTER the text was consumed, so it ranks above any syntax error: the
      // substitution got further, which is what the hill-climb is measuring.
      position:
        typeof error.position === 'number' ? error.position : text.length,
      message: error && error.message ? error.message : String(error),
    }
  }
}

module.exports = {
  analyzeQuery,
  findMaskedStars,
  probeParse,
  normalizeSliceBounds,
  scanEverythingTokens,
  rootSourceText,
  collectRoots,
  DEFAULT_VOCABULARY,
  TENANT_PREDICATE_FORMS,
  INTERP_PARAM_PREFIX,
}
