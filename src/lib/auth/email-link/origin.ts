import { sessionCookieRequestHost } from '@/lib/auth-cookie-domain'

/**
 * ORIGIN DERIVATION for email sign-in links.
 *
 * Magic links are origin-sensitive in a way OAuth redirects are not: the link
 * is a bearer credential in an email, and nothing about it forces it back to
 * the host that minted it. So the origin is derived ONCE, from the REQUEST that
 * asked for the link, and then carried inside the token (stateless tier) or on
 * the token document (stored tier) and re-checked at redemption.
 *
 * WHY THE REQUEST HOST AND NOT `conferenceBaseUrl()`:
 *  - A tenant can be reachable on several hosts at once (its own domain plus
 *    the auto-provisioned platform subdomain). Minting on the conference's
 *    canonical `domains[0]` would email a link to a host the user is not on and
 *    may not even be able to reach yet — during a domain migration it would
 *    silently point at the old one.
 *  - The session cookie is scoped from the request host too
 *    (`applySessionCookieDomain`), so binding the link to the same host keeps
 *    the two consistent by construction.
 *
 * WHY NOT AN ENV VAR: `NEXTAUTH_URL` / `AUTH_URL` pin every request to one
 * origin (`reqWithEnvURL`), which is exactly the multi-tenant failure #687
 * describes. NOTHING in this feature reads either variable — see
 * `warnOnFixedAuthOrigin` in `src/lib/auth.ts` for the standing guard. #687 is
 * therefore NOT a blocker for email login; it remains a blocker for the day an
 * operator actually sets the variable for contract-signing, at which point
 * next-auth's own `createActionURL` (used by server-side `signIn`) would also
 * be pinned. The token's audience check would still hold — a mis-pinned
 * deployment fails CLOSED here rather than authenticating across tenants.
 */

/**
 * Canonicalize a Host-ish value to a bare, comparable hostname: first entry of
 * an `x-forwarded-host` chain, lowercased, port stripped.
 *
 * PORTS ARE STRIPPED deliberately: dev runs on `localhost:3000` while the same
 * logical origin may be reached without a port, and a port cannot be used to
 * cross a tenant boundary (hosts are the tenant key everywhere else in this
 * codebase — routing, cookie scope, conference lookup). IPv6 literals are
 * rejected outright; no tenant is ever addressed by one.
 */
export function canonicalHost(
  host: string | null | undefined,
): string | undefined {
  if (!host) return undefined
  const first = host.split(',')[0].trim().toLowerCase()
  if (!first || first.startsWith('[')) return undefined
  const withoutScheme = first.replace(/^https?:\/\//, '')
  const hostname = withoutScheme.split('/')[0].split(':')[0]
  return hostname || undefined
}

/**
 * The tenant host of an incoming request, canonicalized. Reuses the same
 * header precedence (`x-forwarded-host` → `host`) that decides the session
 * cookie's scope, so link origin and cookie scope can never disagree.
 *
 * ⚠️ THIS VALUE IS ATTACKER-INFLUENCEABLE and is NOT self-validating.
 * `sessionCookieRequestHost` documents that a spoofed `x-forwarded-host` is not
 * an escalation *for a cookie* — the browser drops a `Set-Cookie` whose `Domain`
 * does not domain-match the request URL. DO NOT INHERIT THAT ARGUMENT HERE. A
 * magic link is a bearer token; it is redeemed by whatever HTTP client holds it
 * and no browser rule constrains where it may be presented. Used raw as a token
 * audience, this would bind the token to whatever the requester said — at both
 * mint and redemption — which is no binding at all.
 *
 * What the audience control actually rests on is therefore
 * {@link import('./audience').isServedTenantHost}: every mint (`request.ts`) and
 * every redemption (`verify.ts`) requires the derived host to be claimed by a
 * conference's `domains[]`. The edge's header hygiene (Vercel overwrites
 * `x-forwarded-host`) is defence in depth, not the control.
 */
export function requestHost(headers: {
  get(name: string): string | null
}): string | undefined {
  return canonicalHost(sessionCookieRequestHost(headers))
}

/**
 * The absolute origin (`scheme://host[:port]`) to build the emailed link from.
 *
 * The scheme follows `x-forwarded-proto` when the proxy supplies it and
 * otherwise defaults to `https`; the PORT is preserved here (unlike in
 * `canonicalHost`) because the link must actually be openable in development.
 */
export function requestOrigin(headers: {
  get(name: string): string | null
}): string | undefined {
  const rawHost = sessionCookieRequestHost(headers)
  if (!rawHost) return undefined
  const hostWithPort = rawHost.split(',')[0].trim().toLowerCase()
  if (!hostWithPort || hostWithPort.startsWith('[')) return undefined
  const proto = (headers.get('x-forwarded-proto') ?? '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/:$/, '')
  const scheme = proto === 'http' || proto === 'https' ? proto : 'https'
  try {
    return new URL(`${scheme}://${hostWithPort}`).origin
  } catch {
    return undefined
  }
}

/**
 * Sanitize a caller-supplied post-sign-in destination.
 *
 * ONLY a same-site absolute PATH is accepted. Anything else — an absolute URL
 * (even to our own host), a protocol-relative `//evil.com`, a backslash variant
 * that some parsers fold to `//`, or anything unparseable — collapses to `/`.
 * Refusing absolute URLs outright (rather than comparing origins) means this
 * cannot be reasoned about incorrectly when the value later crosses into
 * next-auth's `redirect` callback, which applies its own origin compare on top.
 */
export function safeCallbackPath(value: string | null | undefined): string {
  if (!value) return '/'
  const raw = value.trim()
  if (!raw.startsWith('/')) return '/'
  // `//host` and `/\host` are both protocol-relative in practice.
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/'
  if (raw.includes('\n') || raw.includes('\r')) return '/'
  return raw
}
