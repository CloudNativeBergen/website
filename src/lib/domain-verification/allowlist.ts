/**
 * The OAuth REDIRECT ALLOWLIST derived from ownership-verified domains (#683,
 * consumed by #688).
 *
 * ⚠️ This deliberately does NOT reuse `domainServesHost` / `domainEntriesOverlap`
 * from `@/lib/conference/domains`. Those implement the ROUTING matcher, which
 * intentionally resolves `sub.example.com` through a `*.example.com` claim. That
 * behaviour is correct for deciding which conference serves a page and
 * catastrophic for deciding where an authorization code may be sent: RFC 6819
 * §4.1.5/§5.2.3.5 and RFC 9700 §2.1/§4.1.3 name prefix/wildcard redirect
 * matching plus any open redirector as the canonical code-exfiltration chain.
 * Here the comparison is EXACT HOST, and wildcard claims contribute nothing.
 *
 * Fail closed everywhere: an unparseable origin, an unclaimed host, a claimed
 * but unproven host, and a host whose proof has stopped resolving all return
 * `false`.
 */

import { normalizeDomain } from '@/lib/conference/domains'
import { isAllowlistEligible } from './policy'
import { listAllowlistCandidates } from './sanity'

/**
 * The exact hosts currently permitted as post-login redirect destinations.
 *
 * Read live on every call — no memoisation, no `'use cache'`. A cached
 * allowlist is a delisting that has not taken effect, which is the exact
 * failure this feature exists to close.
 */
export async function getVerifiedRedirectHosts(
  now: Date = new Date(),
): Promise<Set<string>> {
  const records = await listAllowlistCandidates()
  return new Set(
    records
      .filter((record) => isAllowlistEligible(record, now))
      .map((record) => normalizeDomain(record.hostname)),
  )
}

/**
 * Is this origin an ownership-verified redirect destination?
 *
 * Compares `URL.host` (host + non-default port), so `example.com` and
 * `evil-example.com`, `example.com.evil.net` or `sub.example.com` are all
 * distinct — no prefix or suffix logic anywhere. Only `https:` origins qualify;
 * an authorization code must never be bounced over plaintext.
 */
export async function isVerifiedRedirectOrigin(
  origin: string,
  now: Date = new Date(),
): Promise<boolean> {
  let host: string
  try {
    const url = new URL(origin)
    if (url.protocol !== 'https:') return false
    host = normalizeDomain(url.host)
  } catch {
    return false
  }
  if (!host) return false
  const allowed = await getVerifiedRedirectHosts(now)
  return allowed.has(host)
}
