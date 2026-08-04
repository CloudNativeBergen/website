import { groq } from 'next-sanity'
import { clientReadUncached } from '@/lib/sanity/client'
import { domainServesHost, normalizeDomain } from '@/lib/conference/domains'

/**
 * THE AUDIENCE ALLOWLIST for email sign-in links.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 * The host a link is minted for, and the host it is redeemed on, both come from
 * `x-forwarded-host` (see `origin.ts`). Without a check against hosts the
 * platform actually serves, the audience binding is a TAUTOLOGY under header
 * control: a requester who can set that header gets a link pointing at their own
 * host AND can replay the resulting token with the same header, so the audience
 * matches twice and the binding proves nothing.
 *
 * That is NOT the same situation as the session cookie, which derives its
 * `Domain` from the same header. `auth-cookie-domain.ts` argues (correctly) that
 * a spoofed host there is harmless because the browser refuses a `Set-Cookie`
 * whose `Domain` does not domain-match the request URL. A magic link is a BEARER
 * TOKEN redeemed by whatever HTTP client holds it — curl included — so no
 * browser rule constrains it and that argument does not transfer. This module is
 * what the audience control rests on instead.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT COUNTS AS SERVED
 * ─────────────────────────────────────────────────────────────────────────────
 * A conference `domains[]` entry that would ROUTE the host — exact match, or the
 * single-label wildcard covering it (`*.example.com` serves `a.example.com`).
 * That is deliberately the routing predicate (`domainServesHost`) and not the
 * OAuth redirect allowlist's exact-host rule: a magic link is only ever redeemed
 * on a host this app is already serving pages from, so anything routable is in
 * scope, and refusing the wildcard would break every auto-provisioned tenant
 * subdomain. The escalation the redirect allowlist guards against (bouncing an
 * authorization code to an attacker-chosen host under a wildcard claim) does not
 * exist here — the token never leaves the host it is minted for.
 *
 * PORTS ARE STRIPPED on both sides, because `requestHost()` strips them: dev
 * claims `localhost:3000` while the derived host is `localhost`.
 *
 * FAIL CLOSED. An unresolvable read, an empty claim set, or an unclaimed host
 * all deny. The cost of a false negative is "request another link once the
 * domain is claimed"; the cost of a false positive is a bearer token minted for
 * a host the platform does not control.
 *
 * NOT CACHED, for the same reason `getVerifiedRedirectHosts` is not: a cached
 * allowlist is a de-listing that has not taken effect. One small query on the
 * two auth round-trips (mint, redeem) is not a budget concern.
 */

// groq-global: the set of hosts the PLATFORM serves, deliberately cross-tenant
const CLAIMED_DOMAINS = groq`array::unique(*[_type == "conference" && defined(domains)].domains[])`

/** Strip a `:port` suffix; IPv6 literals never appear in `domains[]`. */
function withoutPort(value: string): string {
  return normalizeDomain(value).split(':')[0]
}

/**
 * Is `host` a host this platform serves — i.e. claimed by some conference's
 * `domains[]`?
 *
 * `host` is expected to be already canonical (lowercase, no port, no scheme) —
 * `canonicalHost` / `requestHost` in `origin.ts` produce exactly that.
 *
 * The claim set is organizer-controlled, but claiming is guarded by
 * `DOMAIN_ALREADY_CLAIMED` (no two conferences may claim overlapping entries)
 * and, once `DOMAIN_VERIFICATION_ENFORCE_ROUTING` is on, by DNS proof (#693).
 * So this narrows the audience from "any string an attacker can put in a header"
 * to "a host some tenant has claimed and the platform is willing to route" —
 * which is the property the audience check needs in order to mean anything.
 */
export async function isServedTenantHost(
  host: string | null | undefined,
): Promise<boolean> {
  const normalized = withoutPort(host ?? '')
  if (!normalized) return false

  let claimed: string[] | null
  try {
    claimed = await clientReadUncached.fetch<string[] | null>(
      CLAIMED_DOMAINS,
      {},
      { cache: 'no-store' },
    )
  } catch (error) {
    console.error('[email-link] served-host lookup failed; refusing', error)
    return false
  }

  if (!Array.isArray(claimed)) return false
  return claimed.some(
    (entry) =>
      typeof entry === 'string' &&
      domainServesHost(withoutPort(entry), normalized),
  )
}
