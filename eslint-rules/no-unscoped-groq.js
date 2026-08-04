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
 *  1. `unscoped` — a literal root filter `*[_type == …` with no tenant
 *     predicate. The original check.
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
 * NOT flagged:
 *  - A query literal passed as an argument to `scopedFetch(...)` — the tenant
 *    predicate is prepended at runtime by the builder, so the body is scoped
 *    (unless the scope argument is explicitly null; see `nullScope`).
 *  - A query annotated `// groq-global: <reason>` (or `// groq-global-scoped:`,
 *    for a query whose tenant predicate is present but not in a shape this rule
 *    recognizes) on the match line, or anywhere in the contiguous comment block
 *    directly above it. SUPPRESSION is for reviewed-global reads: a cross-tenant
 *    identity join, or an inherently global aggregate.
 *
 * ALLOWLIST: the scoped builder module itself, migrations, scripts, and test
 * files are exempt (tooling / data-plane / fixtures, not tenant reads). NOTE:
 * `scripts/` runs with the WRITE token and its exemption is a known gap — the
 * cross-tenant reporting scripts are deliberately global, so tightening it needs
 * per-script `groq-global` annotations first.
 */

'use strict'

// Matches a GROQ root filter opener: `*[_type ==` with optional inner spacing.
const GROQ_ROOT_FILTER = /\*\[\s*_type\s*==/

// A root filter whose predicate begins with an interpolation: `*[${…}`. The
// placeholder `${}` is what `joinTemplate` below substitutes for expressions.
const GROQ_INTERPOLATED_FILTER = /\*\[\s*\$\{\}/

// Any root filter opener at all (used to decide whether an optional-tenant
// predicate is part of a query rather than incidental text).
const GROQ_ANY_ROOT = /\*\[/

// A tenant predicate that evaporates when its own parameter (or the document's
// tenant ref) is absent — `!defined($conferenceId) ||`, `!defined(conference) ||`
// and friends, in either order around the `||`.
const OPTIONAL_TENANT_PREDICATE =
  /!\s*defined\(\s*\$?(?:conferenceId|orgId|organizationId|organisationId|conference|organization)\s*\)/

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
        'Unscoped GROQ query (`*[_type == ...`). Scope it to a tenant via src/lib/sanity/scoped.ts (scopedFetch, or the CONFERENCE_FILTER / ORG_FILTER predicate constants). If the query is intentionally global, annotate it with `// groq-global: <reason>`. See docs/TENANT_SCOPING.md (#616).',
      interpolatedFilter:
        'GROQ root filter built by interpolation (`*[${...}]`) — its tenant scoping is invisible to review and to this rule. Pass the body to scopedFetch, or put the literal `_type == ...` + tenant predicate in the template. If it is intentionally global, annotate it with `// groq-global: <reason>`. See docs/TENANT_SCOPING.md (#616).',
      optionalTenantFilter:
        'CONDITIONAL tenant predicate (`!defined($conferenceId) || ...` / `!defined(conference)`): a missing tenant key silently widens the read to every tenant (fail-OPEN). Make the predicate unconditional and fail closed in the caller. See docs/TENANT_SCOPING.md (#616).',
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

    /**
     * A match is suppressed by a `groq-global:` (or `groq-global-scoped:`)
     * annotation on the match line, or anywhere in the CONTIGUOUS comment block
     * immediately above it.
     *
     * Both halves of that were bugs until #731. Accepting only `matchLine` and
     * `matchLine - 1` meant that in a multi-line `//` rationale — which is N
     * separate comment nodes — the annotation on the FIRST line was two or more
     * lines above the query and never matched, so 7 of the repo's 19 annotated
     * sites were silently unsuppressed. And the `groq-global-scoped:` variant
     * does not contain the substring `groq-global:` at all, so it never
     * suppressed anything anywhere.
     *
     * Neither failure was visible, because `pnpm lint` has no `--max-warnings`
     * and this rule already emits hundreds of warnings nobody reads.
     */
    function isSuppressed(matchLine) {
      const comments = sourceCode ? sourceCode.getAllComments() : []
      const annotated = new Set()
      for (const c of comments) {
        if (/groq-global(-scoped)?:/.test(c.value)) {
          for (let l = c.loc.start.line; l <= c.loc.end.line; l++) {
            annotated.add(l)
          }
        }
      }
      if (annotated.size === 0) return false
      // Lines occupied by any comment, so a rationale block can be walked
      // upwards without being broken by the blank-free lines between nodes.
      const commentLines = new Set()
      for (const c of comments) {
        for (let l = c.loc.start.line; l <= c.loc.end.line; l++) {
          commentLines.add(l)
        }
      }
      if (annotated.has(matchLine)) return true
      // Walk up through the uninterrupted run of comment lines directly above
      // the match. A non-comment line ends the block.
      for (let line = matchLine - 1; commentLines.has(line); line--) {
        if (annotated.has(line)) return true
      }
      return false
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

      const rootMatch = GROQ_ROOT_FILTER.exec(text)
      if (rootMatch && !scoped && !isSuppressed(lineAt(rootMatch.index))) {
        context.report({ node, messageId: 'unscoped' })
      }

      const interpMatch = GROQ_INTERPOLATED_FILTER.exec(text)
      if (interpMatch && !scoped && !isSuppressed(lineAt(interpMatch.index))) {
        context.report({ node, messageId: 'interpolatedFilter' })
      }

      // A conditional tenant predicate is fail-open even INSIDE scopedFetch and
      // even in a query that is otherwise scoped, so it is reported regardless of
      // the builder — only an explicit `groq-global` annotation silences it.
      if (GROQ_ANY_ROOT.test(text)) {
        const optMatch = OPTIONAL_TENANT_PREDICATE.exec(text)
        if (optMatch && !isSuppressed(lineAt(optMatch.index))) {
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
        if (isSuppressed(node.loc.start.line)) return
        context.report({ node, messageId: 'nullScope' })
      },
    }
  },
}
