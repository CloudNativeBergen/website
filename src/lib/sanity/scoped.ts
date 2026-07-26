import type { clientReadUncached } from '@/lib/sanity/client'

/**
 * TENANT-SCOPED QUERY INVARIANT (CaaS #616).
 *
 * Every read that returns tenant-owned documents MUST be constrained to a single
 * tenant — an organization (via a document's `organization` reference) and/or a
 * conference (via its `conference` reference). This module is the typed, minimal
 * surface for expressing that scope so the predicate is written ONE way and the
 * scope parameter can never drift from the predicate it names.
 *
 * The design is deliberately INCREMENTAL: existing hand-written queries keep
 * working untouched. The invariant is enforced by an ESLint rule (see
 * `eslint-rules/no-unscoped-groq.js` and docs/TENANT_SCOPING.md), not at runtime,
 * so sites migrate one at a time. Hand-written queries that cannot use the
 * builder can compose {@link ORG_FILTER} / {@link CONFERENCE_FILTER} directly.
 *
 * Nothing here is a security boundary on its own — document-level security
 * (#614) is a separate wave. This is a correctness invariant that keeps one
 * tenant's data out of another tenant's lists.
 */

/** GROQ predicate: the document's `organization` ref equals `$orgId`. */
export const ORG_FILTER = 'organization._ref == $orgId'

/** GROQ predicate: the document's `conference` ref equals `$conferenceId`. */
export const CONFERENCE_FILTER = 'conference._ref == $conferenceId'

/** The tenant a query is scoped to. Provide either or both dimensions. */
export interface Scope {
  /** Organization ref — scopes types carrying an `organization` reference. */
  orgId?: string | null
  /** Conference ref — scopes types carrying a `conference` reference. */
  conferenceId?: string | null
}

/**
 * The composed scope predicate for a {@link Scope}, or `''` when the scope is
 * empty (both dimensions absent/null). Conference is emitted first, then org, so
 * the ordering is stable and testable. Callers building GROQ by hand can splice
 * this in with ` && `.
 */
export function scopePredicate(scope: Scope): string {
  const parts: string[] = []
  if (scope.conferenceId) parts.push(CONFERENCE_FILTER)
  if (scope.orgId) parts.push(ORG_FILTER)
  return parts.join(' && ')
}

/**
 * The scope-parameter bindings for a {@link Scope} — only the dimensions that
 * are actually present, so a caller never has to bind `$conferenceId` when it
 * scoped by org alone.
 */
export function scopeParams(scope: Scope): Record<string, string> {
  const params: Record<string, string> = {}
  if (scope.conferenceId) params.conferenceId = scope.conferenceId
  if (scope.orgId) params.orgId = scope.orgId
  return params
}

/**
 * PREPEND the scope predicate into a GROQ filter body. `groqBody` is a normal
 * query whose ROOT filter is written WITHOUT the tenant predicate, e.g.
 *
 *   *[_type == "notification" && recipient._ref == $speakerId] | order(...) {...}
 *
 * The scope predicate is inserted immediately after the first `*[`, so it leads
 * the filter (also true for `count(*[ ... ])`):
 *
 *   *[conference._ref == $conferenceId && _type == "notification" && ...] ...
 *
 * When the scope is empty the body is returned unchanged (best-effort: a caller
 * with an unresolvable tenant degrades to an unscoped read rather than throwing
 * inside a request path). Throws only when `groqBody` has no `*[` root filter to
 * scope — that is a programming error, not a runtime/tenant condition.
 */
export function scopedQuery(scope: Scope, groqBody: string): string {
  const predicate = scopePredicate(scope)
  if (!predicate) return groqBody

  const idx = groqBody.indexOf('*[')
  if (idx === -1) {
    throw new Error(
      'scopedQuery: groqBody has no `*[` root filter to scope; pass a filter query or splice scopePredicate() by hand',
    )
  }
  const insertAt = idx + 2 // just past the `*[`

  // Parenthesize the EXISTING root filter before AND-ing the scope predicate:
  // `pred && a || b` would parse as `(pred && a) || b` — a scope BYPASS for the
  // `|| b` arm. Find the root filter's matching `]` by depth-counting.
  let depth = 1
  let close = -1
  for (let i = insertAt; i < groqBody.length; i++) {
    const ch = groqBody[i]
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) {
        close = i
        break
      }
    }
  }
  if (close === -1) {
    throw new Error('scopedQuery: unbalanced brackets in groqBody root filter')
  }
  const existing = groqBody.slice(insertAt, close)
  return `${groqBody.slice(0, insertAt)}${predicate} && (${existing})${groqBody.slice(close)}`
}

/** Structural client shape — anything with the read `fetch` signature. */
type ScopedFetchClient = Pick<typeof clientReadUncached, 'fetch'>

/**
 * The subset of Sanity query options this repo passes through — currently just
 * the Next.js fetch cache hint (e.g. `{ cache: 'no-store' }` for read-your-writes
 * reads). Kept minimal and structural so `scopedFetch` needn't import Sanity's
 * overloaded option types; it is assignable to the client's real options type.
 */
export interface ScopedFetchOptions {
  cache?: RequestCache
  next?: { revalidate?: number | false; tags?: string[] }
}

/**
 * Run a tenant-scoped read: prepend the scope predicate into `groqBody` (see
 * {@link scopedQuery}) AND merge the scope bindings into `params`, so the caller
 * names the tenant ONCE and cannot forget to bind a `$conferenceId`/`$orgId` it
 * referenced. Scope bindings win over caller params of the same name — the scope
 * is the invariant. `options` is forwarded verbatim (e.g. `{ cache: 'no-store' }`).
 */
export async function scopedFetch<T>(
  client: ScopedFetchClient,
  scope: Scope,
  groqBody: string,
  params: Record<string, unknown> = {},
  options?: ScopedFetchOptions,
): Promise<T> {
  const query = scopedQuery(scope, groqBody)
  const mergedParams = { ...params, ...scopeParams(scope) }
  return client.fetch<T>(query, mergedParams, options)
}
