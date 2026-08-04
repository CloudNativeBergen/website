/**
 * ESLint rule: no-unscoped-groq (CaaS #616)
 *
 * Flags GROQ root filters that can return documents across ALL tenants. The
 * tenant-scoped query invariant (docs/TENANT_SCOPING.md) requires such reads to
 * be constrained to one tenant via `src/lib/sanity/scoped.ts` (`scopedFetch`, or
 * the `CONFERENCE_FILTER` / `ORG_FILTER` predicate constants for hand-written
 * queries).
 *
 * FOUR shapes are recognized:
 *
 *  1. `unscoped` — a literal root filter (`*[_type == …` or `*[_id == …`) with
 *     no tenant predicate. The original check.
 *  2. `interpolatedFilter` — a root filter whose predicate STARTS with an
 *     interpolation (`` *[${filter}] ``). The filter text is not visible to this
 *     rule, so scoping cannot be established; it must be routed through
 *     `scopedFetch` or annotated. This form is how several cross-tenant leaks
 *     shipped unnoticed.
 *  3. `optionalTenantFilter` — a tenant predicate made CONDITIONAL on its own
 *     parameter being defined (`!defined($conferenceId) || conference._ref ==
 *     $conferenceId`) or on the document HAVING a tenant ref (`!defined(
 *     conference)`). Both mean "no tenant ⇒ every tenant" — fail-OPEN by
 *     construction. Scope unconditionally instead, and fail closed in the caller.
 *  4. `nullScope` — `scopedFetch(client, { orgId: null }, …)`: the callee name
 *     looks scoped, but a null tenant key drops the predicate at runtime.
 *
 * Severity is WARN, not ERROR: the repo carries a large tail of pre-existing
 * unscoped queries, so an error would block CI. Warn makes NEW ones visible in
 * review and keeps the outstanding count trackable while sites migrate.
 *
 * ---------------------------------------------------------------------------
 * TWO BLIND SPOTS CLOSED (#676, back-ported from RunKonf/kontroll)
 * ---------------------------------------------------------------------------
 *
 * kontroll reads the SAME Sanity dataset and was given a copy of this rule; the
 * port surfaced two holes in the patterns here, both fixed below.
 *
 *  1. WHITESPACE. Every root-filter pattern used to be anchored on the literal
 *     two characters `*[`. GROQ tolerates space between them, so
 *
 *         `* [_type == "staff"]`
 *
 *     — one keystroke from the normal form, and how the #675 cross-tenant staff
 *     leak was actually written — matched NOTHING and was reported as clean.
 *     Every pattern now uses `\*\s*\[`. This was latent at the time of the fix
 *     (zero occurrences on main), which is exactly when it is cheapest to close.
 *
 *  2. `_id ==` ROOT FILTERS WERE INVISIBLE. The `unscoped` pattern required
 *     `_type ==`, so an entire class of read —
 *
 *         `*[_id == $id][0]{ ... }`
 *
 *     — was never examined. A by-id read is NOT self-scoping: `_id` is a
 *     dataset-wide key, so a client-supplied id resolves documents belonging to
 *     any tenant. That is precisely the shape ownership checks are made of, and
 *     precisely the shape a missing ownership check has. The pattern now matches
 *     `_type ==` and `_id ==` alike; the by-id reads that survive are the ones
 *     that carry an annotation saying which mechanism constrains them. Note the
 *     narrowness: `_id ==` is closed, the `_id` CLASS is not — `_id in $ids` is
 *     still invisible. See KNOWN GAPS.
 *
 * ---------------------------------------------------------------------------
 * KNOWN GAPS — shapes that read every tenant and are still reported CLEAN
 * ---------------------------------------------------------------------------
 *
 * These patterns are a syntactic first-token match, not a GROQ parser. Verified
 * by probe, not assumed. Do NOT read a clean run as proof a file is scoped.
 *
 *  - `_type` / `_id` NOT the first token:  `*[defined(foo) && _type == "x"]`
 *  - REVERSED comparison:                  `*["x" == _type]`
 *  - operators other than `==`:            `*[_type match "x*"]`,
 *                                          `*[_type in ["a","b"]]`,
 *                                          `*[_id in $ids]`
 *  - a root filter opening on another field: `*[references($x)]`,
 *                                            `*[slug.current == $slug]`
 *  - NESTED roots in a projection:
 *        `*[_type == "a"]{ "x": *[_type == "b"] }`
 *    `checkQuery` reports the FIRST match in the literal and stops, so a nested
 *    root is examined only when no EARLIER root filter matched. Worse, the
 *    "inside scopedFetch" and "is suppressed" decisions are made once for the
 *    whole literal: `scopedFetch` prepends into the first `*[` only, so a nested
 *    root inside a scoped body runs UNSCOPED with the rule silent, and an outer
 *    `groq-global-scoped:` covers nested roots it never vouched for. Measured:
 *    26 literals in src/ carry 37 such nested roots. Closing this needs
 *    per-root-filter suppression and reporting plus an audit of all 37 — out of
 *    scope for #676, pinned by a characterization test in the test file.
 *  - a root filter SPLIT across string concatenation: `"*" + "[_type == \"x\"]"`
 *
 * A live census of the sites these gaps hide (9 in src/, none dangerous today)
 * is kept in docs/TENANT_SCOPING.md → "Known gaps"; re-derive it when these
 * patterns change.
 *
 * NOT back-ported: kontroll's notion of "scoped". It has no ambient tenant and
 * no query builder — a read there is scoped when the filter binds a proven
 * `$orgId`/`$userKey` parameter. This repo scopes by the conference/organization
 * a document REFERENCES, applied by `scopedFetch`. The predicate semantics below
 * are unchanged; only the shapes the rule can SEE were widened.
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
 * Why two markers: annotating a scoped-but-invisible query `groq-global:` is a
 * lie, and it drowns the small set of genuinely cross-tenant reads — the set a
 * human must periodically re-audit — in a much larger set of ordinary scoped
 * ones. The two are INDEPENDENTLY GREPPABLE: `groq-global-scoped:` never matches
 * the `groq-global:` pattern, because in `groq-global-scoped` the colon is not
 * adjacent to `groq-global`.
 *
 *   rg 'groq-global:'         → the reviewed-cross-tenant set (audit this one)
 *   rg 'groq-global-scoped:'  → the scoped-but-invisible set
 *
 * BOTH require a NON-EMPTY reason. A bare `// groq-global:` suppresses nothing.
 *
 * PLACEMENT: a marker anywhere in the comment block directly above the query —
 * or trailing on the query's own line — counts. It does NOT have to be the last
 * comment line; that used to be the requirement, and multi-line annotations
 * carrying the marker on their first line silently did nothing. Blank lines
 * between the block and the query are skipped; a line containing CODE is a hard
 * stop, so a marker separated from the query by a statement does not suppress,
 * and neither does one placed below the query.
 *
 * WHAT EACH MARKER CLEARS: `groq-global-scoped:` clears `unscoped` and
 * `interpolatedFilter` — the two "the rule cannot see the scope" shapes. It does
 * NOT clear `optionalTenantFilter` or `nullScope`: there the rule CAN see the
 * scoping, and can see it fail OPEN, so "it is scoped" would be a false claim.
 * Only an explicit reviewed-global `groq-global:` silences those.
 *
 * NOT flagged:
 *  - A query literal passed as an argument to `scopedFetch(...)` — the tenant
 *    predicate is prepended at runtime by the builder, so the body is scoped
 *    (unless the scope argument is explicitly null; see `nullScope`).
 *  - A root filter carrying `references($conferenceId)` / `references($orgId)`
 *    / `references($organizationId)` — a BOUND tenant parameter in a
 *    `references()` predicate constrains the read to that tenant exactly as
 *    `conference._ref == $conferenceId` does. Only those tenant parameter names
 *    count: `references($speakerId)` or `references(someVar)` still flags. This
 *    applies to the `unscoped` shape only — in an interpolated filter the
 *    injected text can escape the bracket, so a visible `references()` proves
 *    nothing about the query that actually runs.
 *
 * ALLOWLIST: the scoped builder module itself, migrations, scripts, and test
 * files are exempt (tooling / data-plane / fixtures, not tenant reads). NOTE:
 * `scripts/` runs with the WRITE token and its exemption is a known gap — the
 * cross-tenant reporting scripts are deliberately global, so tightening it needs
 * per-script `groq-global` annotations first.
 */

'use strict'

// Matches a GROQ root filter opener: `*[_type ==` or `*[_id ==`, with optional
// whitespace ANYWHERE inside — including between the `*` and the `[`, which is
// the whitespace hole from #676. `_id` is matched as well as `_type` because a
// by-id root filter reads the whole dataset by a key that is not tenant-bound.
const GROQ_ROOT_FILTER = /\*\s*\[\s*_(?:type|id)\s*==/

// A root filter whose predicate begins with an interpolation: `*[${…}`. The
// placeholder `${}` is what `joinTemplate` below substitutes for expressions.
const GROQ_INTERPOLATED_FILTER = /\*\s*\[\s*\$\{\}/

// Any root filter opener at all (used to decide whether an optional-tenant
// predicate is part of a query rather than incidental text). Loose on purpose;
// it only ever gates a check that additionally requires a `!defined(...)`.
const GROQ_ANY_ROOT = /\*\s*\[/

// A tenant predicate that evaporates when its own parameter (or the document's
// tenant ref) is absent — `!defined($conferenceId) ||`, `!defined(conference) ||`
// and friends, in either order around the `||`.
const OPTIONAL_TENANT_PREDICATE =
  /!\s*defined\(\s*\$?(?:conferenceId|orgId|organizationId|organisationId|conference|organization)\s*\)/

// `references($conferenceId)` with a BOUND tenant parameter: a genuine tenant
// predicate, equivalent in effect to `conference._ref == $conferenceId`.
const TENANT_REFERENCES =
  /references\(\s*\$(?:conferenceId|orgId|organizationId|organisationId)\s*\)/

// Reviewed CROSS-TENANT read. Requires a non-empty reason after the colon.
// Deliberately does not match `groq-global-scoped:` — no colon follows
// `groq-global` there — so the two sets stay independently greppable.
const GLOBAL_ANNOTATION = /groq-global:\s*\S/

// Tenant-SCOPED, but invisibly so. Requires a non-empty explanation.
const SCOPED_ANNOTATION = /groq-global-scoped:\s*\S/

/** Property names that carry the tenant key into `scopedFetch`. */
const TENANT_SCOPE_KEYS = new Set([
  'orgId',
  'conferenceId',
  'organizationId',
  'organisationId',
])

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

/**
 * The text of the root filter that starts at `start` (the `*` of `*[`): what
 * sits between `[` and its matching `]`. Bounding the search this way keeps a
 * tenant predicate belonging to a NESTED sub-query from being credited to the
 * unscoped root filter wrapped around it.
 */
function rootFilterText(text, start) {
  const open = text.indexOf('[', start)
  if (open === -1) return ''
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const ch = text[i]
    if (ch === '[' || ch === '(') {
      depth++
    } else if (ch === ']' || ch === ')') {
      depth--
      if (depth === 0) return text.slice(open + 1, i)
    }
  }
  return text.slice(open + 1)
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require tenant scoping on GROQ root filters; flag unscoped, interpolated, optionally-scoped and null-scoped queries (CaaS #616).',
      recommended: false,
    },
    schema: [],
    messages: {
      unscoped:
        'Unscoped GROQ root filter (`*[_type == ...` / `*[_id == ...`). A document id is a dataset-wide key, so a by-id read is NOT self-scoping. Scope it to a tenant via src/lib/sanity/scoped.ts (scopedFetch, or the CONFERENCE_FILTER / ORG_FILTER predicate constants). If it IS tenant-scoped but this rule cannot see how, annotate `// groq-global-scoped: <how>`. If it is intentionally cross-tenant, annotate `// groq-global: <reason>`. See docs/TENANT_SCOPING.md (#616).',
      interpolatedFilter:
        'GROQ root filter built by interpolation (`*[${...}]`) — its tenant scoping is invisible to review and to this rule. Pass the body to scopedFetch, or put the literal `_type == ...` + tenant predicate in the template. If the interpolated predicate provably always carries the tenant, annotate `// groq-global-scoped: <how>`; if the read is intentionally cross-tenant, `// groq-global: <reason>`. See docs/TENANT_SCOPING.md (#616).',
      optionalTenantFilter:
        'CONDITIONAL tenant predicate (`!defined($conferenceId) || ...` / `!defined(conference)`): a missing tenant key silently widens the read to every tenant (fail-OPEN). Make the predicate unconditional and fail closed in the caller. `// groq-global-scoped:` does NOT silence this — the scoping is visible here, and it fails open. See docs/TENANT_SCOPING.md (#616).',
      nullScope:
        'scopedFetch called with an explicitly null tenant scope: the builder drops the predicate, so this reads across every tenant. Resolve the tenant and fail closed when it is null. See docs/TENANT_SCOPING.md (#616).',
    },
  },

  create(context) {
    const filename =
      (context.filename || (context.getFilename && context.getFilename())) ?? ''
    if (isAllowlisted(filename)) return {}

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
     * Every comment attached to `line`: one trailing on the line itself, plus
     * the whole comment block above it. The upward walk consumes comment lines
     * and skips blank ones, and STOPS at the first line carrying code — so an
     * annotation separated from the query by a statement never reaches it, and
     * one placed below the query is never considered at all.
     *
     * Walking the block (rather than looking only one line up) is what makes a
     * marker on the FIRST line of a multi-line annotation work; the old
     * one-line-up check silently ignored it.
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
     * The comment text governing a query, flattened to one string. `lines` are
     * the lines an annotation may legitimately sit above: the line the offending
     * shape matched on, and the line the query expression starts on. Those
     * differ for a multi-line template, where the annotation naturally goes
     * above the opening backtick rather than above `*[_type ==` further down.
     *
     * The block is joined — rather than each comment tested separately — so a
     * reason may wrap onto the next `//` line while a bare marker is still
     * rejected.
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
    function isGlobalAnnotated(...lines) {
      return GLOBAL_ANNOTATION.test(governingCommentText(lines))
    }

    /**
     * Scoped-but-invisible: silences the two shapes where the rule simply cannot
     * see the scope. A reviewed-global annotation implies it as well.
     */
    function isSuppressed(...lines) {
      const text = governingCommentText(lines)
      return GLOBAL_ANNOTATION.test(text) || SCOPED_ANNOTATION.test(text)
    }

    /**
     * A scope argument is EXPLICITLY null when the call passes an object literal
     * whose tenant keys are all the `null` literal (`{ orgId: null }`). That
     * reads globally at runtime despite the scoped-looking callee.
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

    /** The nearest enclosing `scopedFetch(...)` call, or null. */
    function enclosingScopedFetch(node) {
      const ancestors = sourceCode ? sourceCode.getAncestors(node) : []
      for (let i = ancestors.length - 1; i >= 0; i--) {
        const a = ancestors[i]
        if (a.type !== 'CallExpression') continue
        const callee = a.callee
        const name =
          callee.type === 'Identifier'
            ? callee.name
            : callee.type === 'MemberExpression' &&
                callee.property.type === 'Identifier'
              ? callee.property.name
              : null
        if (name === 'scopedFetch') return a
      }
      return null
    }

    /**
     * A query literal is considered scoped when it sits inside a `scopedFetch(...)`
     * call whose scope is not explicitly null — the builder prepends the tenant
     * predicate at runtime, so the body legitimately omits it.
     */
    function isInsideScopedFetch(node) {
      const call = enclosingScopedFetch(node)
      return call !== null && !hasExplicitlyNullScope(call)
    }

    /**
     * Flatten a template literal to a single string, substituting `${}` for every
     * interpolation, and return a resolver that maps an index in that string back
     * to a source line.
     */
    function joinTemplate(node) {
      const PLACEHOLDER = '${}'
      let text = ''
      const spans = [] // { start, end, quasi }
      node.quasis.forEach((quasi, i) => {
        const start = text.length
        text += quasi.value.raw
        spans.push({ start, end: text.length, quasi })
        if (i < node.quasis.length - 1) text += PLACEHOLDER
      })
      const lineAt = (index) => {
        const span =
          spans.find((s) => index >= s.start && index < s.end) ?? spans[0]
        const before = text.slice(span.start, Math.max(index, span.start))
        const newlines = (before.match(/\n/g) || []).length
        return span.quasi.loc.start.line + newlines
      }
      return { text, lineAt }
    }

    /** Run every shape check over one flattened query string. */
    function checkQuery(node, text, lineAt) {
      const scoped = isInsideScopedFetch(node)
      const nodeLine = node.loc.start.line

      const rootMatch = GROQ_ROOT_FILTER.exec(text)
      if (
        rootMatch &&
        !scoped &&
        // A bound tenant `references($conferenceId)` inside THIS root filter is
        // a tenant predicate: the read cannot cross tenants.
        !TENANT_REFERENCES.test(rootFilterText(text, rootMatch.index)) &&
        !isSuppressed(lineAt(rootMatch.index), nodeLine)
      ) {
        context.report({ node, messageId: 'unscoped' })
      }

      const interpMatch = GROQ_INTERPOLATED_FILTER.exec(text)
      if (
        interpMatch &&
        !scoped &&
        !isSuppressed(lineAt(interpMatch.index), nodeLine)
      ) {
        context.report({ node, messageId: 'interpolatedFilter' })
      }

      // A conditional tenant predicate is fail-open even INSIDE scopedFetch and
      // even in a query that is otherwise scoped, so it is reported regardless of
      // the builder — and `groq-global-scoped:` must not silence it either, since
      // here the rule can see the scoping and can see that it fails open. Only an
      // explicit reviewed-global annotation silences it.
      if (GROQ_ANY_ROOT.test(text)) {
        const optMatch = OPTIONAL_TENANT_PREDICATE.exec(text)
        if (optMatch && !isGlobalAnnotated(lineAt(optMatch.index), nodeLine)) {
          context.report({ node, messageId: 'optionalTenantFilter' })
        }
      }
    }

    return {
      Literal(node) {
        if (typeof node.value !== 'string' || typeof node.raw !== 'string') {
          return
        }
        const line = node.loc.start.line
        checkQuery(node, node.raw, (index) => {
          const before = node.raw.slice(0, index)
          return line + (before.match(/\n/g) || []).length
        })
      },
      TemplateLiteral(node) {
        const { text, lineAt } = joinTemplate(node)
        checkQuery(node, text, lineAt)
      },
      CallExpression(node) {
        const callee = node.callee
        const name =
          callee.type === 'Identifier'
            ? callee.name
            : callee.type === 'MemberExpression' &&
                callee.property.type === 'Identifier'
              ? callee.property.name
              : null
        if (name !== 'scopedFetch') return
        if (!hasExplicitlyNullScope(node)) return
        if (isGlobalAnnotated(node.loc.start.line)) return
        context.report({ node, messageId: 'nullScope' })
      },
    }
  },
}
