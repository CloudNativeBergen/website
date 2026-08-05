/**
 * ESLint rule: no-unscoped-groq (CaaS #616; parser rewrite RunKonf/platform#48).
 *
 * Guards the tenant-scoped query invariant (docs/TENANT_SCOPING.md) over a SHARED
 * multi-tenant Sanity dataset: every read of `*` must constrain itself to one
 * tenant, via `src/lib/sanity/scoped.ts` (`scopedFetch`, or the
 * `CONFERENCE_FILTER` / `ORG_FILTER` predicate constants) or by carrying an
 * equivalent predicate of its own.
 *
 * The judgement is made by `eslint-rules/groq-scope-engine.js`, which PARSES the
 * query with `groq-js` and answers, PER ROOT FILTER, whether that root is bound
 * to a tenant. This file supplies the vocabulary, the suppression rules and the
 * reporting; read the engine's header for what "scoped" means and for the
 * location-mapping design.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE REWRITE CHANGED (and why the warning count moves in BOTH directions)
 * ---------------------------------------------------------------------------
 *
 * The predecessor matched `/\*\s*\[\s*_(?:type|id)\s*==/` once per literal. It
 * therefore:
 *
 *  - could not SEE predicate reorder, reversed comparison, `_type match`, `_type
 *    in`, `_id in $ids`, a filter opening on `references(...)` or
 *    `slug.current` — or any NESTED root filter, since `exec()` stopped at the
 *    outermost `*[`; and
 *  - never CHECKED a root filter for a tenant predicate at all, so a query
 *    scoped exactly as the docs prescribe produced the same diagnostic as one
 *    that read every tenant. Roughly a quarter of its output was false, which is
 *    why the #823 cross-tenant leak shipped after the rule had flagged both
 *    offending queries.
 *
 * So: correctly scoped queries STOP being reported, and previously invisible
 * roots — nested ones especially — START being reported. A net count is not the
 * measure; see the PR that landed this for the derivation of both directions.
 *
 * ---------------------------------------------------------------------------
 * SHAPES REPORTED
 * ---------------------------------------------------------------------------
 *
 *  1. `unscoped` — a root filter with no tenant predicate. Includes a BARE `*`
 *     (`count(*)`, `*{...}`): it reads every tenant by construction (D4).
 *  2. `interpolatedFilter` — a root filter whose predicate contains a `${…}`.
 *     The text that actually runs is not the text under review, and injected
 *     text can escape the bracket, so a visible tenant predicate proves nothing.
 *  3. `optionalTenantFilter` — a tenant predicate made conditional on its own
 *     parameter (`!defined($conferenceId) || conference._ref == $conferenceId`)
 *     or on the document HAVING a tenant ref. No tenant ⇒ every tenant: fail-OPEN
 *     by construction. Reported even inside `scopedFetch`, and NOT clearable by
 *     `groq-global-scoped:` — the scoping is visible here, and visibly wrong.
 *  4. `nullScope` — `scopedFetch(client, { orgId: null }, …)`: a scoped-looking
 *     callee whose null tenant key drops the predicate at runtime.
 *  5. `unparseable` — the literal looks like GROQ but does not parse, even after
 *     the interpolation-substitution ladder. The engine cannot enumerate its
 *     roots, so it FAILS CLOSED and reports rather than passing it silently.
 *
 * Severity is WARN. The repo carries a tail of pre-existing unscoped reads whose
 * ownership check lives at the caller; a CI ratchet (P2) freezes the count and
 * the rule graduates to `error` at zero (P4).
 *
 * ---------------------------------------------------------------------------
 * ANNOTATION VOCABULARY — two markers, deliberately distinct
 * ---------------------------------------------------------------------------
 *
 *   // groq-global: <reason>         the read IS cross-tenant, and that is
 *                                   correct: domain routing, the tenant
 *                                   registry, the global identity join, a
 *                                   platform aggregate, a cron sweep.
 *
 *   // groq-global-scoped: <how>     the read is tenant-SCOPED, but through
 *                                   something this rule cannot see — a
 *                                   predicate carried in a variable, a scope
 *                                   applied by a helper, a caller-side authz
 *                                   gate, or a point read by a server-derived
 *                                   id. State the mechanism.
 *
 * Annotating a scoped-but-invisible query `groq-global:` is a lie, and it drowns
 * the small set of genuinely cross-tenant reads — the set a human must
 * periodically re-audit — in a much larger set of ordinary scoped ones. The two
 * are INDEPENDENTLY GREPPABLE, because in `groq-global-scoped` no colon follows
 * `groq-global`:
 *
 *   rg 'groq-global:'         → the reviewed-cross-tenant set (audit this one)
 *   rg 'groq-global-scoped:'  → the scoped-but-invisible set
 *
 * BOTH require a NON-EMPTY reason. A bare `// groq-global:` suppresses nothing.
 *
 * PLACEMENT: a marker anywhere in the comment block directly above the query — or
 * trailing on the query's own line — counts. Blank lines are skipped; a line
 * carrying CODE is a hard stop, so a marker separated from the query by a
 * statement does not suppress, and neither does one placed below it.
 *
 * PER-ROOT SUPPRESSION (new, and the point of the rewrite). An annotation is a
 * signed claim about ONE read. The comment block above a literal governs the
 * literal's FIRST root only. A nested root must be annotated on its own line —
 * and since a nested root usually lives inside a template literal, where no JS
 * comment can reach it, in practice a nested root is cleared by giving it a
 * tenant predicate, correlating it to a scoped parent (`^.conference._ref`), or
 * hoisting it into its own scoped read. That is deliberate: an outer annotation
 * used to vouch for nested roots it had never seen.
 *
 * NOT flagged:
 *  - The root that `scopedFetch` actually scopes. `scopedQuery` splices its
 *    predicate at `indexOf('*[')` — the FIRST root filter — and parenthesises
 *    what was there. Exactly that root is credited; every OTHER root in the same
 *    literal, nested or not, is judged on its own, because the builder never
 *    touched it.
 *  - A root carrying a tenant predicate: `conference._ref == $conferenceId`,
 *    `organization._ref == $orgId`, `._ref in $conferenceIds`, a `->` traversal
 *    to either, `$orgRef in organizations[]._ref`, `references($conferenceId)`,
 *    or a `^.`-correlation to a SCOPED parent root. The full vocabulary, and the
 *    deliberate non-recognitions (`_id ==` point reads, `!=`, non-tenant
 *    `references()`, any tenant predicate under a tenant-free disjunct), are
 *    enumerated in the engine.
 *
 * The vocabulary is RULE OPTIONS, not constants: `RunKonf/kontroll` reads the
 * same dataset with a different contract (no builder, no ambient tenant, `_id ==
 * $orgId` counts, an identity axis on `redeemedBy == $userKey`) and configures
 * the same engine.
 *
 * NOT CHECKED — parameter PROVENANCE. `conference._ref == $conferenceId` reports
 * clean however `$conferenceId` was bound, including from client input. That was
 * #826's actual bug. Provenance is the authz waist's job; a clean run here is not
 * proof of authorization.
 *
 * ALLOWLIST: the scoped builder module itself, migrations, scripts and test files
 * are exempt (tooling / data-plane / fixtures, not tenant reads). NOTE: `scripts/`
 * runs with the WRITE token and its exemption is a known gap — the cross-tenant
 * reporting scripts are deliberately global, so tightening it needs per-script
 * `groq-global` annotations first.
 */

'use strict'

const {
  analyzeQuery,
  probeParse,
  DEFAULT_VOCABULARY,
} = require('./groq-scope-engine')

// Reviewed CROSS-TENANT read. Requires a non-empty reason after the colon.
// Deliberately does not match `groq-global-scoped:` — no colon follows
// `groq-global` there — so the two sets stay independently greppable.
const GLOBAL_ANNOTATION = /groq-global:\s*\S/

// Tenant-SCOPED, but invisibly so. Requires a non-empty explanation.
const SCOPED_ANNOTATION = /groq-global-scoped:\s*\S/

/**
 * Does this string plausibly contain a GROQ read of `*`? The rule visits every
 * string literal in a file, so a gate is needed before handing text to a parser:
 * without it, ordinary prose would be reported `unparseable`. The three forms are
 * a root filter (`*[`, whitespace tolerated), a bare `*` piped or projected
 * (`* | order(...)`, `*{...}`), and `count(*)`.
 */
const GROQ_QUERY_HINT = /\*\s*\[|\*\s*[|{]|\(\s*\*\s*\)/

/** Property names that carry the tenant key into `scopedFetch`. */
const TENANT_SCOPE_KEYS = new Set([
  'orgId',
  'conferenceId',
  'organizationId',
  'organisationId',
])

/**
 * The interpolation-substitution LADDER. A template literal is not valid GROQ
 * until every `${…}` is replaced by something that parses, and no single
 * substitute works everywhere:
 *
 *   `$__groqInterpN`  parses in predicate position, and can never be mistaken for
 *                     a tenant parameter (the names are an explicit allowlist).
 *   `0`               slice bounds reject parameters — `[$a...$b]` is a syntax
 *                     error — so numeric literals rescue `[${from}...${to}]`.
 *   `"__groqInterp"`  a quoted string, for interpolations in value position that
 *                     neither of the above satisfies.
 *
 * Tried in order; the first that parses wins. If NONE parses the literal is
 * reported `unparseable` — never silently clean.
 */
const INTERPOLATION_SUBSTITUTES = [
  // predicate / value position
  (i) => `$__groqInterp${i}`,
  // object-attribute position: `{ ${FIELDS} }`
  () => `_id`,
  // …the same, where more attributes follow: `{ ${FIELDS} "x": y }`
  () => `_id,`,
  // slice bounds — `[$a...$b]` is rejected by the parser, `[0...0]` is not
  () => `0`,
  () => `"__groqInterp"`,
  // a predicate TAIL spliced into a filter: `*[_type == "x"${clause}]`
  (i) => ` && $__groqInterp${i}`,
  // a projection spliced after a filter: `*[…][0]${PROJECTION}`
  () => `{_groqWrap}`,
  // a slice spliced after a filter: `*[…]${limitClause}{…}`
  () => `[0...1]`,
]

/**
 * FRAGMENT WRAPPERS. Plenty of query text in this repo lives in reusable
 * fragments — a projection field list, a `&& …` predicate tail, a `,"reviews":
 * *[…]` attribute — that is valid GROQ but not a valid standalone query. Those
 * fragments carry root filters (usually NESTED ones, the population the old rule
 * could never see), so refusing to look inside them would trade one blind spot
 * for another.
 *
 * Each wrapper makes the fragment a whole query. `*[true]` contributes a
 * SYNTHETIC root at offset 0, which is discarded along with everything before
 * the wrapper's prefix; the fragment's own roots keep their positions once the
 * prefix length is subtracted. If no wrapper parses, the literal is `unparseable`
 * and reported — wrapping widens what can be READ, never what passes.
 */
const FRAGMENT_WRAPPERS = [
  { prefix: '', suffix: '' },
  // `,"reviews": *[…]{…}` — a field list continuing an earlier one.
  { prefix: '*[true]{_groqWrap', suffix: '}' },
  // `_id, title, "x": *[…]` — a field list on its own.
  { prefix: '*[true]{', suffix: '}' },
  // `&& conference._ref in *[…]._id` — a predicate tail.
  { prefix: '*[true', suffix: ']' },
  // a bare value expression.
  { prefix: '*[true]{"_groqWrap": ', suffix: '}' },
]

function isAllowlisted(filename) {
  if (!filename) return true
  // Normalize separators; match on path SEGMENTS so both absolute
  // (`/Users/.../migrations/x.ts`) and RuleTester-relative (`migrations/x.ts`)
  // filenames are handled uniformly.
  const f = filename.replace(/\\/g, '/')
  return (
    /(^|\/)(migrations|scripts|__tests__)\//.test(f) ||
    /\.test\.[cm]?[jt]sx?$/.test(f) ||
    /\.spec\.[cm]?[jt]sx?$/.test(f) ||
    // The builder module is the one place that composes tenant predicates.
    /(^|\/)src\/lib\/sanity\/scoped\.ts$/.test(f)
  )
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require tenant scoping on every GROQ root filter; flag unscoped, interpolated, optionally-scoped, null-scoped and unparseable queries (CaaS #616).',
      recommended: false,
    },
    schema: [
      {
        type: 'object',
        properties: {
          tenantFields: { type: 'array', items: { type: 'string' } },
          tenantArrayFields: { type: 'array', items: { type: 'string' } },
          tenantParams: { type: 'array', items: { type: 'string' } },
          tenantParamsPlural: { type: 'array', items: { type: 'string' } },
          tenantRefParams: { type: 'array', items: { type: 'string' } },
          identityFields: { type: 'array', items: { type: 'string' } },
          identityParams: { type: 'array', items: { type: 'string' } },
          idEqualsCounts: { type: 'boolean' },
          builderName: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unscoped:
        'Unscoped GROQ root filter (`*[_type == ...` / `*[_id == ...`). A document id is a dataset-wide key, so a by-id read is NOT self-scoping. Scope it to a tenant via src/lib/sanity/scoped.ts (scopedFetch, or the CONFERENCE_FILTER / ORG_FILTER predicate constants). If it IS tenant-scoped but this rule cannot see how, annotate `// groq-global-scoped: <how>`. If it is intentionally cross-tenant, annotate `// groq-global: <reason>`. See docs/TENANT_SCOPING.md (#616).',
      interpolatedFilter:
        'GROQ root filter built by interpolation (`*[${...}]`) — its tenant scoping is invisible to review and to this rule, and injected text can escape the bracket, so a tenant predicate visible beside it proves nothing. Pass the body to scopedFetch, or put the literal `_type == ...` + tenant predicate in the template. If the interpolated predicate provably always carries the tenant, annotate `// groq-global-scoped: <how>`; if the read is intentionally cross-tenant, `// groq-global: <reason>`. See docs/TENANT_SCOPING.md (#616).',
      optionalTenantFilter:
        'CONDITIONAL tenant predicate (`!defined($conferenceId) || ...` / `!defined(conference)`): a missing tenant key silently widens the read to every tenant (fail-OPEN). Make the predicate unconditional and fail closed in the caller. `// groq-global-scoped:` does NOT silence this — the scoping is visible here, and it fails open. See docs/TENANT_SCOPING.md (#616).',
      nullScope:
        'scopedFetch called with an explicitly null tenant scope: the builder drops the predicate, so this reads across every tenant. Resolve the tenant and fail closed when it is null. See docs/TENANT_SCOPING.md (#616).',
      unparseable:
        'GROQ query could not be parsed ({{reason}}), so its root filters cannot be enumerated and its tenant scoping cannot be established. This rule fails CLOSED rather than passing a query it cannot read. Simplify the literal (move interpolations out of the query text), or annotate `// groq-global-scoped: <how>` / `// groq-global: <reason>`. See docs/TENANT_SCOPING.md (#616).',
    },
  },

  create(context) {
    const filename =
      (context.filename || (context.getFilename && context.getFilename())) ?? ''
    if (isAllowlisted(filename)) return {}

    const rawOptions = (context.options && context.options[0]) || {}
    const builderName = rawOptions.builderName || 'scopedFetch'
    const vocabulary = {}
    for (const key of Object.keys(DEFAULT_VOCABULARY)) {
      if (rawOptions[key] !== undefined) vocabulary[key] = rawOptions[key]
    }

    const sourceCode =
      context.sourceCode || (context.getSourceCode && context.getSourceCode())

    // Comments indexed by the line they END on, so a block comment is reachable
    // from its closing line and a `//` run is walked one line at a time.
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
     * Every comment attached to `line`: one trailing on the line itself, plus the
     * whole comment block above it. The upward walk consumes comment lines and
     * skips blank ones, and STOPS at the first line carrying code — so an
     * annotation separated from the query by a statement never reaches it, and
     * one placed below the query is never considered at all.
     */
    function attachedComments(line) {
      const out = []
      for (const c of commentsByEndLine.get(line) ?? []) out.push(c)
      let expected = line - 1
      while (expected >= 1) {
        const block = commentsByEndLine.get(expected)
        if (block) {
          let top = expected
          for (const c of block) {
            out.push(c)
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
      return out
    }

    /**
     * The comment text governing a query, flattened to one string. The block is
     * joined — rather than each comment tested separately — so a reason may wrap
     * onto the next `//` line while a bare marker is still rejected.
     */
    function governingCommentText(lines) {
      const seen = new Set()
      const collected = []
      for (const line of lines) {
        for (const c of attachedComments(line)) {
          if (seen.has(c)) continue
          seen.add(c)
          collected.push(c)
        }
      }
      collected.sort((a, b) => a.range[0] - b.range[0])
      return collected.map((c) => c.value).join('\n')
    }

    /** Reviewed cross-tenant read: silences every shape. */
    function isGlobalAnnotated(lines) {
      return GLOBAL_ANNOTATION.test(governingCommentText(lines))
    }

    /**
     * Scoped-but-invisible: silences the shapes where the rule cannot see the
     * scope. A reviewed-global annotation implies it as well.
     */
    function isSuppressed(lines) {
      const text = governingCommentText(lines)
      return GLOBAL_ANNOTATION.test(text) || SCOPED_ANNOTATION.test(text)
    }

    /**
     * A scope argument is EXPLICITLY null when the call passes an object literal
     * whose tenant keys are all the `null` literal (`{ orgId: null }`). That reads
     * globally at runtime despite the scoped-looking callee.
     */
    function hasExplicitlyNullScope(callExpr) {
      for (const arg of callExpr.arguments) {
        if (arg.type !== 'ObjectExpression') continue
        const tenantProps = arg.properties.filter(
          (p) =>
            p.type === 'Property' &&
            p.key &&
            ((p.key.type === 'Identifier' &&
              TENANT_SCOPE_KEYS.has(p.key.name)) ||
              (p.key.type === 'Literal' && TENANT_SCOPE_KEYS.has(p.key.value))),
        )
        if (tenantProps.length === 0) continue
        const allNull = tenantProps.every(
          (p) => p.value.type === 'Literal' && p.value.value === null,
        )
        if (allNull) return true
      }
      return false
    }

    function calleeName(node) {
      const callee = node.callee
      return callee.type === 'Identifier'
        ? callee.name
        : callee.type === 'MemberExpression' &&
            callee.property.type === 'Identifier'
          ? callee.property.name
          : null
    }

    /** The nearest enclosing builder call, or null. */
    function enclosingBuilderCall(node) {
      const ancestors = sourceCode ? sourceCode.getAncestors(node) : []
      for (let i = ancestors.length - 1; i >= 0; i--) {
        const a = ancestors[i]
        if (a.type === 'CallExpression' && calleeName(a) === builderName)
          return a
      }
      return null
    }

    /** True when a builder with a non-null scope will splice a predicate in. */
    function insideBuilder(node) {
      const call = enclosingBuilderCall(node)
      return call !== null && !hasExplicitlyNullScope(call)
    }

    /**
     * Flatten a template literal, substituting every `${…}` with `substitute(i)`.
     * Returns the flattened text, the source position of any index in it, and the
     * span each substitution occupies — the engine needs the spans to tell which
     * ROOT an interpolation sits inside.
     */
    function flattenTemplate(node, substitute) {
      let text = ''
      const quasiSpans = []
      const interpolationSpans = []
      node.quasis.forEach((quasi, i) => {
        const start = text.length
        text += quasi.value.raw
        quasiSpans.push({ start, end: text.length, quasi })
        if (i < node.quasis.length - 1) {
          const placeholder = substitute(i)
          interpolationSpans.push({
            start: text.length,
            end: text.length + placeholder.length,
          })
          text += placeholder
        }
      })
      const posAt = (index) => {
        const span =
          quasiSpans.find((s) => index >= s.start && index < s.end) ??
          quasiSpans[0]
        const before = text.slice(span.start, Math.max(index, span.start))
        const newlines = (before.match(/\n/g) || []).length
        if (newlines === 0) {
          // `quasi.loc.start` sits on the opening backtick or on the `}` that
          // closes the previous interpolation; the raw text starts one past it.
          return {
            line: span.quasi.loc.start.line,
            column: span.quasi.loc.start.column + 1 + (index - span.start),
          }
        }
        const lastNewline = before.lastIndexOf('\n')
        return {
          line: span.quasi.loc.start.line + newlines,
          column: before.length - lastNewline - 1,
        }
      }
      return { text, interpolationSpans, posAt }
    }

    /**
     * Choose a substitution rung PER interpolation, by hill-climbing on the
     * parser's error offset: a rung that moves the error further right is a
     * better fit for that hole. Two passes over the holes is enough for the
     * shapes that occur (a slice and a projection in the same query); if nothing
     * parses, the caller falls back and the literal is reported `unparseable`.
     */
    function mixedSubstitute(node) {
      const holes = node.quasis.length - 1
      const choice = new Array(holes).fill(0)
      const score = (candidate) =>
        probeParse(
          flattenTemplate(node, (i) =>
            INTERPOLATION_SUBSTITUTES[candidate[i]](i),
          ).text,
        ).position
      let best = score(choice)
      for (
        let pass = 0;
        pass < 2 && best !== Number.POSITIVE_INFINITY;
        pass++
      ) {
        for (let hole = 0; hole < holes; hole++) {
          for (let rung = 1; rung < INTERPOLATION_SUBSTITUTES.length; rung++) {
            const trial = [...choice]
            trial[hole] = rung
            const trialScore = score(trial)
            if (trialScore > best) {
              best = trialScore
              choice[hole] = rung
              if (best === Number.POSITIVE_INFINITY) break
            }
          }
          if (best === Number.POSITIVE_INFINITY) break
        }
      }
      return (i) => INTERPOLATION_SUBSTITUTES[choice[i]](i)
    }

    /**
     * The lines an annotation may sit on to govern root `k` of a literal.
     *
     * Root 0 is governed by the comment block above the literal (where authors
     * write annotations) as well as by its own line. Every other root is governed
     * ONLY by a comment on its own line, and only when that line is below the
     * literal's first — otherwise the literal-level block would silently vouch for
     * a nested root nobody reviewed, which is the hole this rewrite closes.
     */
    function annotationLines(rootIndex, rootLine, nodeLine) {
      if (rootIndex === 0) return [rootLine, nodeLine]
      return rootLine > nodeLine ? [rootLine] : []
    }

    /**
     * Parse `text`, trying each fragment wrapper in turn. Returns the analysis
     * plus the offset that must be subtracted from every root position, or a
     * failed analysis when nothing parsed.
     */
    function analyzeWithWrappers(text, interpolationSpans, builderInsertIndex) {
      let first = null
      for (const wrapper of FRAGMENT_WRAPPERS) {
        const offset = wrapper.prefix.length
        const wrapped = `${wrapper.prefix}${text}${wrapper.suffix}`
        const result = analyzeQuery(wrapped, {
          vocabulary,
          interpolationSpans: interpolationSpans.map((s) => ({
            start: s.start + offset,
            end: s.end + offset,
          })),
          builderInsertIndex:
            builderInsertIndex === null ? null : builderInsertIndex + offset,
        })
        if (first === null) first = { result, offset }
        if (!result.parsed) continue
        // A wrapped fragment whose positions cannot be trusted is worse than
        // unparseable: the synthetic root could not be told apart from a real
        // one, so it would be reported as the author's own.
        if (offset > 0 && !result.locationsReliable) continue
        return {
          result: {
            ...result,
            roots: result.roots
              .filter((root) => root.start === null || root.start >= offset)
              .map((root, i) => ({
                ...root,
                index: i,
                start: root.start === null ? null : root.start - offset,
              })),
          },
          offset,
        }
      }
      return first
    }

    /** Analyse one query literal and report every root that is not scoped. */
    function checkQuery(node, text, interpolationSpans, posAt) {
      if (!GROQ_QUERY_HINT.test(text)) return

      const nodeLine = node.loc.start.line
      const builderIndex = insideBuilder(node) ? text.indexOf('*[') : -1
      const { result } = analyzeWithWrappers(
        text,
        interpolationSpans,
        builderIndex === -1 ? null : builderIndex,
      )

      if (!result.parsed) {
        // FAIL CLOSED. The roots cannot be enumerated, so nothing about this
        // literal is known — not even that it has a root filter to scope.
        if (!isSuppressed([nodeLine])) {
          context.report({
            node,
            messageId: 'unparseable',
            data: { reason: result.error },
          })
        }
        return
      }

      for (const root of result.roots) {
        const loc = root.start === null ? node.loc.start : posAt(root.start)
        const lines = annotationLines(root.index, loc.line, nodeLine)

        if (!root.scoped && !isSuppressed(lines)) {
          context.report({
            node,
            loc,
            messageId: root.interpolated ? 'interpolatedFilter' : 'unscoped',
          })
        }

        // A conditional tenant predicate fails open even INSIDE the builder and
        // even in a root that is otherwise scoped, so it is reported regardless —
        // and `groq-global-scoped:` must not silence it, since here the rule CAN
        // see the scoping and can see that it fails open.
        if (root.failOpen && !isGlobalAnnotated(lines)) {
          context.report({ node, loc, messageId: 'optionalTenantFilter' })
        }
      }

      if (
        result.unattachedFailOpen &&
        result.roots.length > 0 &&
        !isGlobalAnnotated([nodeLine])
      ) {
        context.report({ node, messageId: 'optionalTenantFilter' })
      }
    }

    return {
      Literal(node) {
        if (typeof node.value !== 'string' || typeof node.raw !== 'string') {
          return
        }
        // A plain literal has no interpolations, so no ladder is needed. Escapes
        // make offset→column mapping unreliable, so every root in it is reported
        // at the literal itself.
        checkQuery(node, node.value, [], () => node.loc.start)
      },
      TemplateLiteral(node) {
        // Climb the ladder until something parses. The FIRST rung is kept as the
        // fallback so an unparseable literal is reported against the substitution
        // an author would recognise.
        let flattened = flattenTemplate(node, INTERPOLATION_SUBSTITUTES[0])
        if (node.quasis.length > 1 && GROQ_QUERY_HINT.test(flattened.text)) {
          let resolved = false
          for (const substitute of INTERPOLATION_SUBSTITUTES) {
            const candidate =
              substitute === INTERPOLATION_SUBSTITUTES[0]
                ? flattened
                : flattenTemplate(node, substitute)
            if (analyzeWithWrappers(candidate.text, [], null).result.parsed) {
              flattened = candidate
              resolved = true
              break
            }
          }
          // No single rung fits every hole: a query can splice a slice in one
          // place and a projection in another. Pick a rung PER interpolation by
          // hill-climbing on how far the parser gets.
          if (!resolved) {
            const mixed = flattenTemplate(node, mixedSubstitute(node))
            if (analyzeWithWrappers(mixed.text, [], null).result.parsed) {
              flattened = mixed
            }
          }
        }
        checkQuery(
          node,
          flattened.text,
          flattened.interpolationSpans,
          flattened.posAt,
        )
      },
      CallExpression(node) {
        if (calleeName(node) !== builderName) return
        if (!hasExplicitlyNullScope(node)) return
        if (isGlobalAnnotated([node.loc.start.line])) return
        context.report({ node, messageId: 'nullScope' })
      },
    }
  },
}
