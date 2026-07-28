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
  // Platform/central-auth origin (#682): the marketing site, the app shell and
  // (soon) the central OAuth origin all live under `konf.app`, with per-tenant
  // subdomains alongside them. Widening here would both put every tenant's
  // session in every other `*.konf.app` subdomain's XSS blast radius AND — via
  // the module-load derivation this replaced — emit `Domain=.konf.app` on a
  // tenant's OWN apex, where the browser rejects the whole cookie.
  'konf.app',
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

// ---------------------------------------------------------------------------
// PER-REQUEST APPLICATION (multi-tenant, #682)
// ---------------------------------------------------------------------------

/**
 * `@auth/core`'s default session-token cookie names, most-specific first. Prod
 * uses the `__Secure-` prefix (https); dev uses the bare name. Salt === cookie
 * name, so these double as the decode salts. Exported so the contract test
 * (`__tests__/lib/auth/authjs-jwt-contract.test.ts`) can pin them against a real
 * encode/decode round-trip and against the known reference strings. (It can't
 * diff `@auth/core`'s own `defaultCookies()` automatically — that's a transitive
 * dep — so an upstream rename is caught only once these constants are updated to
 * match; the round-trip still guards the salt→key derivation independently.)
 *
 * Lives HERE rather than in `@/lib/auth` because the per-response rewriter below
 * needs it and must stay free of any `next-auth` import (it runs in middleware).
 */
export const SESSION_TOKEN_COOKIE_NAMES = [
  '__Secure-authjs.session-token',
  'authjs.session-token',
] as const

/**
 * The client-facing host of a request, for cookie-Domain derivation.
 *
 * `x-forwarded-host` first (what the proxy in front of us — Vercel — reports as
 * the public host, and what Auth.js itself trusts under `trustHost`), then the
 * `Host` header. A spoofed `x-forwarded-host` is NOT an escalation: the browser
 * only accepts a `Set-Cookie` whose `Domain` domain-matches the host in the
 * request URL, so a mismatched value can only make the attacker's OWN cookie be
 * dropped — it can never plant a cookie on someone else's domain.
 */
export function sessionCookieRequestHost(headers: {
  get(name: string): string | null
}): string | null {
  return headers.get('x-forwarded-host') ?? headers.get('host')
}

/** The cookie name of a `Set-Cookie` header value (text before the first `=`). */
function setCookieName(setCookie: string): string {
  const eq = setCookie.indexOf('=')
  const semi = setCookie.indexOf(';')
  const end =
    eq === -1
      ? semi === -1
        ? setCookie.length
        : semi
      : Math.min(eq, semi < 0 ? eq : semi)
  return setCookie.slice(0, end).trim()
}

/** True for the session token cookie and its chunked parts (`<name>.0`, `.1`, …). */
function isSessionTokenSetCookie(setCookie: string): boolean {
  const name = setCookieName(setCookie)
  return SESSION_TOKEN_COOKIE_NAMES.some(
    (base) => name === base || name.startsWith(`${base}.`),
  )
}

/**
 * True when this `Set-Cookie` DELETES rather than sets: `Max-Age` ≤ 0 or an
 * `Expires` already in the past. `@auth/core`'s `sessionStore.clean()` emits
 * `Expires=Thu, 01 Jan 1970 00:00:00 GMT` with an empty value.
 *
 * Attribute splitting on `;` is safe — a cookie value may not contain `;`, and
 * the only attribute containing a comma (`Expires`) contains no semicolon.
 */
function isClearingSetCookie(setCookie: string): boolean {
  const now = Date.now()
  for (const attr of setCookie.split(';').slice(1)) {
    const eq = attr.indexOf('=')
    if (eq === -1) continue
    const key = attr.slice(0, eq).trim().toLowerCase()
    const value = attr.slice(eq + 1).trim()
    if (key === 'max-age') {
      const seconds = Number(value)
      if (Number.isFinite(seconds) && seconds <= 0) return true
    }
    if (key === 'expires') {
      const at = Date.parse(value)
      if (Number.isFinite(at) && at <= now) return true
    }
  }
  return false
}

/** The same `Set-Cookie` with any `Domain=` attribute removed (host-only). */
function withoutDomainAttribute(setCookie: string): string {
  const parts = setCookie.split(';')
  return parts
    .filter((part, index) => {
      if (index === 0) return true
      const eq = part.indexOf('=')
      if (eq === -1) return true
      return part.slice(0, eq).trim().toLowerCase() !== 'domain'
    })
    .join(';')
}

/**
 * Rewrite the `Domain` attribute of every session-token `Set-Cookie` in
 * `setCookies` to the value derived from the ACTUAL request host. Non-session
 * cookies (CSRF, PKCE, state, callback-url, link-intent) are passed through
 * untouched — they are deliberately host-only.
 *
 * WHY THIS EXISTS (the defect it fixes): the `Domain` used to be derived ONCE at
 * module load from `NEXT_PUBLIC_BASE_URL` and baked into the static NextAuth
 * config, so EVERY request host got the platform's domain. A tenant on their own
 * apex then received a `Set-Cookie` whose `Domain` the browser REJECTS — OAuth
 * succeeded, the cookie was silently dropped and the user bounced back to
 * sign-in with NO error. Deriving per response is the only way to serve more
 * than one registrable domain from one deployment.
 *
 * WHY NOT the Auth.js lazy-config form: passing a CONFIG FUNCTION to `NextAuth`
 * changes the shape of the returned `auth`, so the middleware wrapper
 * `auth((req) => …)` in `src/proxy.ts` becomes a NON-function and every
 * authenticated route 500s — the production incident (#671). Rewriting the
 * response header keeps `NextAuth(config)` a plain static object.
 *
 * SIGN-OUT: a CLEARING cookie is emitted TWICE — once host-only and once
 * `Domain`-scoped — because a `Set-Cookie` carrying a `Domain` can never delete
 * a host-only cookie of the same name (and vice versa). Both scopes may exist in
 * the browser (host-only cookies predate this feature, and a host can move on or
 * off the denylist), so sign-out must clear both or a stale cookie keeps the
 * user signed in.
 */
export function rewriteSessionCookieDomains(
  setCookies: readonly string[],
  host: string | null | undefined,
): string[] {
  const domain = deriveSessionCookieDomain(host)
  const out: string[] = []
  const add = (value: string) => {
    if (!out.includes(value)) out.push(value)
  }

  for (const setCookie of setCookies) {
    if (!isSessionTokenSetCookie(setCookie)) {
      add(setCookie)
      continue
    }
    const hostOnly = withoutDomainAttribute(setCookie)
    if (isClearingSetCookie(setCookie)) {
      add(hostOnly)
      if (domain) add(`${hostOnly}; Domain=${domain}`)
      continue
    }
    add(domain ? `${hostOnly}; Domain=${domain}` : hostOnly)
  }

  return out
}

/**
 * Apply {@link rewriteSessionCookieDomains} to a response, in place when the
 * runtime allows it.
 *
 * Mutation is attempted first so the response KEEPS its concrete class (a
 * `NextResponse` carrying middleware request-header overrides, for example) and
 * its body stream is never re-wrapped. The result is verified; if a runtime ever
 * guards `Set-Cookie` on this header list, we fall back to reconstructing the
 * response from the ORIGINAL cookie list, so a partial mutation can never lose
 * cookies.
 */
export function applySessionCookieDomain(
  res: Response,
  host: string | null | undefined,
): Response {
  if (typeof res?.headers?.getSetCookie !== 'function') return res
  const original = res.headers.getSetCookie()
  if (original.length === 0) return res

  const rewritten = rewriteSessionCookieDomains(original, host)
  if (
    rewritten.length === original.length &&
    rewritten.every((value, index) => value === original[index])
  ) {
    return res
  }

  try {
    res.headers.delete('set-cookie')
    for (const value of rewritten) res.headers.append('set-cookie', value)
    const applied = res.headers.getSetCookie()
    if (
      applied.length === rewritten.length &&
      applied.every((value, index) => value === rewritten[index])
    ) {
      return res
    }
  } catch {
    // Fall through to reconstruction below.
  }

  const headers = new Headers(res.headers)
  headers.delete('set-cookie')
  for (const value of rewritten) headers.append('set-cookie', value)
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  })
}
