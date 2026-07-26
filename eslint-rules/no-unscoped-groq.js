/**
 * ESLint rule: no-unscoped-groq (CaaS #616)
 *
 * Flags GROQ root filters written as `*[_type == ...` string/template literals,
 * which return documents across ALL tenants. The tenant-scoped query invariant
 * (docs/TENANT_SCOPING.md) requires such reads to be constrained to one tenant
 * via `src/lib/sanity/scoped.ts` (`scopedFetch`, or the `CONFERENCE_FILTER` /
 * `ORG_FILTER` predicate constants for hand-written queries).
 *
 * Severity is WARN, not ERROR: the repo carries ~170 pre-existing unscoped
 * queries, so an error would block CI. Warn makes NEW unscoped queries visible
 * in review and keeps the outstanding count trackable while sites migrate.
 *
 * NOT flagged:
 *  - A query literal passed as an argument to `scopedFetch(...)` — the tenant
 *    predicate is prepended at runtime by the builder, so the body is scoped.
 *  - A query annotated `// groq-global: <reason>` on the same line as, or the
 *    line directly above, the query opener (SUPPRESSION for reviewed-global
 *    reads: a cross-tenant identity join, or an inherently global aggregate).
 *
 * ALLOWLIST: the scoped builder module itself, migrations, scripts, and test
 * files are exempt (they are tooling / data-plane / fixtures, not tenant reads).
 */

'use strict'

// Matches a GROQ root filter opener: `*[_type ==` with optional inner spacing.
const GROQ_ROOT_FILTER = /\*\[\s*_type\s*==/

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
        'Require tenant scoping on GROQ root filters; flag unscoped `*[_type == ...` queries (CaaS #616).',
      recommended: false,
    },
    schema: [],
    messages: {
      unscoped:
        'Unscoped GROQ query (`*[_type == ...`). Scope it to a tenant via src/lib/sanity/scoped.ts (scopedFetch, or the CONFERENCE_FILTER / ORG_FILTER predicate constants). If the query is intentionally global, annotate it with `// groq-global: <reason>`. See docs/TENANT_SCOPING.md (#616).',
    },
  },

  create(context) {
    const filename =
      (context.filename || (context.getFilename && context.getFilename())) ?? ''
    if (isAllowlisted(filename)) return {}

    const sourceCode =
      context.sourceCode || (context.getSourceCode && context.getSourceCode())

    function isSuppressed(matchLine) {
      const comments = sourceCode ? sourceCode.getAllComments() : []
      return comments.some(
        (c) =>
          /groq-global:/.test(c.value) &&
          (c.loc.end.line === matchLine || c.loc.end.line === matchLine - 1),
      )
    }

    // A query literal is considered scoped when it sits anywhere inside a
    // `scopedFetch(...)` call — the builder prepends the tenant predicate at
    // runtime, so the body legitimately omits it. Covers `scopedFetch` and any
    // member form (`x.scopedFetch(...)`).
    function isInsideScopedFetch(node) {
      const ancestors = sourceCode ? sourceCode.getAncestors(node) : []
      return ancestors.some((a) => {
        if (a.type !== 'CallExpression') return false
        const callee = a.callee
        const name =
          callee.type === 'Identifier'
            ? callee.name
            : callee.type === 'MemberExpression' &&
                callee.property.type === 'Identifier'
              ? callee.property.name
              : null
        return name === 'scopedFetch'
      })
    }

    // `raw` is the literal text; `rawStartLine` is the source line of raw[0].
    function checkRaw(node, raw, rawStartLine) {
      const match = GROQ_ROOT_FILTER.exec(raw)
      if (!match) return
      if (isInsideScopedFetch(node)) return
      const newlinesBefore = (raw.slice(0, match.index).match(/\n/g) || [])
        .length
      const matchLine = rawStartLine + newlinesBefore
      if (isSuppressed(matchLine)) return
      context.report({ node, messageId: 'unscoped' })
    }

    return {
      Literal(node) {
        if (typeof node.value === 'string' && typeof node.raw === 'string') {
          checkRaw(node, node.raw, node.loc.start.line)
        }
      },
      TemplateElement(node) {
        checkRaw(node, node.value.raw, node.loc.start.line)
      },
    }
  },
}
