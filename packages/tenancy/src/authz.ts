// One role parser and one pure policy check (docs/AUTHORIZATION.md §3.3,
// phase 1). No I/O: the envelope (or a member row) supplies the roles.
import { MATRIX, type Action, type Column } from './authz-matrix'

// Structural, not `import type { Envelope } from './index'`: the site imports
// this file alone (@runkonf/tenancy/authz, #2101) and must not type-check the
// Workers-only index.
type Envelope =
  | {
      typ: 'tenant'
      userId: string | null
      orgRole: string | null
      scopes: readonly string[]
    }
  | { typ: 'platform' | 'user'; userId: string; platformRole?: string }

export { MATRIX, COLUMNS, type Action, type Column } from './authz-matrix'

export const ORG_ROLES = ['owner', 'admin', 'member'] as const
export type OrgRole = (typeof ORG_ROLES)[number]

/** Minted by the gateway only on its operator lane (#1921). */
export const OPERATOR_SCOPE = 'platform:operator'
/** The site's server lane: a lane marker with two machine capabilities. */
export const SITE_SCOPE = 'site:server'

const known = new Set<string>(ORG_ROLES)

/**
 * THE role parser. Better Auth stores several roles comma-separated: each
 * item is trimmed and lower-cased; anything outside the vocabulary is dropped
 * and logged (fail closed). The last-owner trigger's stricter owner rule
 * (member-sync.ts isOwner, migration 0003) is deliberately not this one.
 */
export function parseOrgRoles(raw: string | null | undefined): Set<OrgRole> {
  const roles = new Set<OrgRole>()
  const unknown: string[] = []
  for (const item of (raw ?? '').split(',')) {
    const r = item.trim().toLowerCase()
    if (known.has(r)) roles.add(r as OrgRole)
    else if (r) unknown.push(r.slice(0, 32))
  }
  if (unknown.length)
    console.warn(JSON.stringify({ event: 'authz.unknown_role', unknown }))
  return roles
}

/** What `can()` decides on: the matrix columns this caller holds. */
export type Principal = ReadonlySet<Column>

/**
 * The columns an envelope holds. Org roles and the operator scope count only
 * with a user; `site:server` counts on its own (it is the user-less lane).
 * A PlatformContext is an operator; a UserContext holds nothing.
 */
export function principalOf(e: Envelope | null | undefined): Principal {
  const p = new Set<Column>()
  if (e?.typ === 'platform') p.add('Op')
  if (e?.typ !== 'tenant') return p
  if (e.scopes.includes(SITE_SCOPE)) p.add('Site')
  if (!e.userId) return p
  if (e.scopes.includes(OPERATOR_SCOPE)) p.add('Op')
  return withRoles(p, e.orgRole)
}

/** A member row's role string as a principal (identity's own reads). */
export const principalOfRole = (role: string | null | undefined): Principal =>
  withRoles(new Set(), role)

function withRoles(p: Set<Column>, raw: string | null | undefined) {
  const roles = parseOrgRoles(raw)
  if (roles.has('owner')) p.add('Own')
  if (roles.has('admin')) p.add('Adm')
  if (roles.has('member')) p.add('Mem')
  return p
}

/** Pure and synchronous. Unknown action or no matching column: deny. */
export function can(p: Principal, action: Action): boolean {
  const row = MATRIX[action]
  if (!row) return false
  for (const c of p) if (row[c] === 'Y') return true
  return false
}
