/**
 * The ROUTING gate: may a resolved conference actually be served on the host
 * that was requested?
 *
 * ⚠️ SEQUENCING. The two live production domains (`cloudnativedays.no`,
 * `cloudnativebergen.dev`) predate this feature and carry no proof. Enforcing
 * verification on routing before they have records would take production
 * offline, so the gate is OFF by default and only switches on when
 * `DOMAIN_VERIFICATION_ENFORCE_ROUTING=true` is set — after
 * `scripts/backfill-domain-verification.ts` has grandfathered the existing
 * claims. With the flag unset, routing behaves EXACTLY as it does today.
 *
 * The redirect allowlist (`allowlist.ts`) is not flag-gated: it is a brand-new
 * surface with no existing consumers, so it fails closed from day one.
 */

import { normalizeDomain, wildcardFormForHost } from '@/lib/conference/domains'
import { isPlatformOwnedHost } from './platform'
import { isRoutingEligible } from './policy'
import { getDomainVerification } from './sanity'

/** Whether routing is gated on verification in this environment. */
function isRoutingEnforced(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DOMAIN_VERIFICATION_ENFORCE_ROUTING === 'true'
}

/**
 * May `host` be served by the conference whose `domains[]` matched it?
 *
 * Resolves the `domains[]` ENTRY that produced the match (the exact host, or the
 * single-label wildcard covering it — same derivation `getConferenceForDomain`
 * uses) and asks the policy about that entry's record. An entry with no record
 * at all is refused under enforcement: fail closed.
 *
 * Returns `true` unconditionally while the flag is off.
 */
export async function isHostRoutable(
  host: string,
  claimedDomains: readonly string[],
  now: Date = new Date(),
): Promise<boolean> {
  if (!isRoutingEnforced()) return true

  const normalized = normalizeDomain(host)
  const entries = claimedDomains.map(normalizeDomain)
  const wildcard = wildcardFormForHost(normalized)
  // Exact claim wins over the wildcard, matching how the routing GROQ resolves.
  const matched = entries.includes(normalized)
    ? normalized
    : wildcard && entries.includes(wildcard)
      ? wildcard
      : null
  if (!matched) return false

  // A subdomain of the platform's OWN zone routes without a record at all. The
  // fail-closed rule below guards an unproven claim on somebody ELSE's domain;
  // here the entry is inside a zone we operate, the claim is still required to
  // be in this conference's `domains[]` (globally unique, overlap-checked), and
  // there is no proof anyone could publish. Refusing on a missing sidecar
  // document would take a platform-hosted tenant offline over bookkeeping.
  // `matched` — not the request host — so a `*.<suffix>` wildcard entry, which
  // is never platform-owned, still has to prove itself.
  if (isPlatformOwnedHost(matched)) return true

  const record = await getDomainVerification(matched)
  if (!record) return false
  return isRoutingEligible(record, now)
}
