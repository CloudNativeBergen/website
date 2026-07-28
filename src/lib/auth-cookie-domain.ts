import { getDomain } from 'tldts'

/**
 * Parent domains that are SHARED ACROSS TENANTS — the session cookie must
 * NEVER be widened to any of these, no matter what eTLD+1 derivation says.
 *
 * Rationale (XSS blast radius): a cookie scoped to `Domain=.parent` is sent to
 * — and can be overwritten from — EVERY subdomain of that parent. On a domain
 * whose subdomains all belong to ONE tenant (e.g. `cloudnativedays.no`) that is
 * exactly the point of this feature. But on a platform-shared parent, the
 * subdomains belong to DIFFERENT tenants: an XSS (or a malicious tenant) on
 * `evil.konf.run` could read or fixate the session cookie of `victim.konf.run`.
 * For these hosts we fall back to the default host-only cookie, which the
 * browser scopes to the exact host that set it.
 *
 * Entries are bare registrable/parent domains (no leading dot, lowercase). A
 * request host matches when it EQUALS an entry or is a subdomain of one.
 * Extend this list whenever a new shared parent domain enters the platform.
 */
export const SHARED_PARENT_DOMAIN_DENYLIST: readonly string[] = [
  // Future tenant-runtime domain: each subdomain is a DIFFERENT tenant.
  'konf.run',
  // Vercel preview/production deploys: subdomains are unrelated projects.
  // (Also a PSL private-section suffix, but denylisted explicitly — defence in
  // depth against PSL-data or derivation drift.)
  'vercel.app',
  // Local development: host-only cookies, never a Domain attribute.
  'localhost',
]

/**
 * Derive the session-cookie `Domain` attribute for a request host: the host's
 * REGISTRABLE domain (eTLD+1, per the Public Suffix List via `tldts`) with a
 * leading dot, so the cookie is shared across all subdomains of the
 * conference's domain (e.g. host `admin.cloudnativedays.no` →
 * `.cloudnativedays.no` → apex + www + per-year subdomains). Per-request
 * derivation means every tenant domain gets the correct scope with ZERO
 * per-tenant configuration.
 *
 * Returns `undefined` — meaning "set no Domain attribute; keep today's
 * host-only cookie" — for every case where widening is wrong or unsafe:
 *
 * - hosts on {@link SHARED_PARENT_DOMAIN_DENYLIST} (see its doc comment),
 * - IP literals, `localhost`, single-label / unresolvable hosts, and hosts
 *   that ARE a public suffix (no registrable domain → `getDomain` = null),
 * - anything unparseable — derivation is FAIL-SAFE: garbage in → host-only
 *   cookie out, never a malformed `Domain` attribute.
 *
 * `allowPrivateDomains: true` matches browser behavior: browsers enforce the
 * FULL Public Suffix List (private section included), so treating e.g.
 * `vercel.app` as a suffix here avoids deriving a Domain the browser would
 * reject (a rejected Set-Cookie drops the ENTIRE cookie, breaking sign-in).
 */
export function deriveSessionCookieDomain(
  host: string | null | undefined,
): string | undefined {
  try {
    if (!host) return undefined

    // `x-forwarded-host` may carry a comma-separated chain — use the first
    // (client-facing) entry. Strip any port; reject IPv6 literals outright.
    let hostname = host.split(',')[0].trim().toLowerCase()
    if (hostname.startsWith('[')) return undefined
    hostname = hostname.split(':')[0]
    if (!hostname) return undefined

    if (isDenylistedHost(hostname)) return undefined

    const registrable = getDomain(hostname, { allowPrivateDomains: true })
    if (!registrable) return undefined

    // Belt and braces: the derived domain must domain-match the request host
    // (equal or a parent), contain a dot (never a bare TLD), and must not be —
    // or sit under — a denylisted parent even if PSL data says otherwise.
    if (registrable !== hostname && !hostname.endsWith(`.${registrable}`)) {
      return undefined
    }
    if (!registrable.includes('.')) return undefined
    if (isDenylistedHost(registrable)) return undefined

    return `.${registrable}`
  } catch {
    // FAIL-SAFE: any unexpected derivation error → host-only cookie.
    return undefined
  }
}

/** True when `hostname` equals or is a subdomain of a denylisted parent. */
function isDenylistedHost(hostname: string): boolean {
  return SHARED_PARENT_DOMAIN_DENYLIST.some(
    (parent) => hostname === parent || hostname.endsWith(`.${parent}`),
  )
}
