/**
 * PLATFORM-ALLOCATED HOSTS — subdomains of the zone the platform itself
 * operates, granted to a specific tenant.
 *
 * Konf hosts tenants on subdomains it MINTS (`<slug>.konf.run`): that zone's
 * nameservers are delegated to our own edge, a wildcard certificate covers every
 * label under it, and no tenant has any access to it whatsoever. Asking such a
 * tenant to publish a `_konf-challenge` TXT record is asking them to write into
 * a zone only we can write to — the proof is unobtainable by construction, so
 * under `DOMAIN_VERIFICATION_ENFORCE_ROUTING` every platform-hosted tenant would
 * simply go dark.
 *
 * ## Being in our zone is a PRECONDITION, never an entitlement
 *
 * The tempting shortcut — "it is under our suffix, therefore it is verified" —
 * is a cross-tenant hijack. "This host is in our zone" says nothing about
 * WHICH tenant is entitled to it. An organizer can type any hostname into
 * /admin/settings, so a read-time suffix inference would let them claim
 * `some-other-tenant.<suffix>`, or a label earmarked for a customer being
 * onboarded next week, and be handed routing plus (once #688 ships) an OAuth
 * redirect destination for it. Global uniqueness does not save that: it makes
 * the claim EXCLUSIVE, so the rightful tenant could then never be given the
 * hostname at all.
 *
 * So entitlement is an ALLOCATION RECORDED AT WRITE TIME, not an inference at
 * read time. The platform grants one host to one conference — only through
 * `provisionOrganization`, the platform-operator/bearer-authenticated tenant
 * creation path — and the `domainVerification` document records it
 * (`method: "platform-owned"`, `conference` = the grantee). Two things must
 * therefore hold before a host gets this standing, and
 * {@link isPlatformAllocated} requires BOTH:
 *
 *  1. the record says the platform allocated it, and
 *  2. the hostname is still inside the configured platform zone
 *     ({@link isPlatformZoneHost}) — so re-pointing or unsetting the suffix
 *     withdraws the standing instead of leaving stale grants behind.
 *
 * Tenant-facing writes (`updateDomains`, `createEdition`, the admin card's
 * self-heal) may never allocate: they REJECT an unallocated host in our zone
 * rather than silently verifying it.
 *
 * Once allocated the standing is PERMANENT — no `graceUntil`, unlike the
 * deliberately time-boxed `grandfathered` exemption — because there is no future
 * date on which we stop controlling our own zone and nothing the tenant could
 * ever do to "complete" the proof. Revocation, not expiry, is how it ends.
 *
 * ## The suffix is CONFIGURATION
 *
 * `PLATFORM_DOMAIN_SUFFIX` follows the `PLATFORM_ORG_SLUG` contract
 * (`src/lib/features/platform.ts`): the platform is white-labelable, so
 * `konf.run` is a deployment fact, never a constant in the source.
 *
 * UNSET MEANS "NO HOST IS IN THE PLATFORM ZONE", never "every host is". That
 * inversion would be catastrophic — an empty suffix matching every hostname
 * would make every claim on the platform allocatable — so every rejection path
 * below returns `null` and {@link isPlatformZoneHost} fails CLOSED on it.
 *
 * ## Matching is LABEL-WISE, never `endsWith`
 *
 * A raw `host.endsWith(suffix)` is spoofable in both directions and both
 * mistakes are real: `evil-konf.run` ends with `konf.run` (no label boundary),
 * and a naive "contains" check would accept `konf.run.attacker.com` (our zone as
 * a *prefix* of someone else's). The comparison therefore splits both sides into
 * DNS labels and requires the suffix to be the exact trailing labels of the
 * host, with at least one label to spare.
 */

import { isValidDomainEntry, normalizeDomain } from '@/lib/conference/domains'
import type { DomainVerificationRecord } from './types'

/**
 * BAD_REQUEST prefix for a claim on a host in the platform's zone that the
 * platform never allocated to the claiming conference. Exported so the
 * mutations that reject it and the tests that assert on the refusal agree.
 */
export const PLATFORM_DOMAIN_NOT_ALLOCATED =
  'That hostname belongs to the platform and has not been allocated to this conference'

/**
 * The configured platform zone (e.g. `konf.run`), or `null` when the contract is
 * unset or unusable — in which case NO host is platform-owned.
 *
 * Tolerates the shapes an operator plausibly types (`.konf.run`, `*.konf.run`,
 * `KONF.RUN `) and rejects everything that is not a plain, multi-label zone: a
 * URL, a path, a `:port`, or a single bare label. A bare label matters most —
 * `PLATFORM_DOMAIN_SUFFIX=run` would make every `.run` domain on the internet
 * platform-owned.
 */
export function platformDomainSuffix(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = env.PLATFORM_DOMAIN_SUFFIX
  if (typeof raw !== 'string') return null
  // A leading `*.` or `.` is how the same zone is written in a certificate or a
  // cookie Domain attribute; accept both and store the bare zone.
  const suffix = normalizeDomain(raw).replace(/^\*?\.+/, '')
  if (!suffix) return null
  if (!isValidDomainEntry(suffix)) return null
  // `isValidDomainEntry` also admits `*.x` and `x:3000`; neither is a zone.
  if (suffix.startsWith('*.') || suffix.includes(':')) return null
  // At least two labels. A single label is a TLD or a dev name, never a zone we
  // can claim to own.
  if (!suffix.includes('.')) return null
  return suffix
}

/**
 * True when `host` is the exact trailing labels of `suffix` plus at least one
 * more label of its own. Pure label comparison — no substring logic anywhere.
 */
function isSubdomainOfSuffix(host: string, suffix: string): boolean {
  const hostLabels = host.split('.')
  const suffixLabels = suffix.split('.')
  // STRICTLY deeper: the suffix apex itself is not "a subdomain we minted".
  if (hostLabels.length <= suffixLabels.length) return false
  const offset = hostLabels.length - suffixLabels.length
  return suffixLabels.every((label, i) => label === hostLabels[offset + i])
}

/**
 * Is this `domains[]` entry a host inside the platform's OWN zone — i.e. one the
 * platform is ABLE to allocate?
 *
 * ⚠️ This is a PRECONDITION, not an entitlement. It answers "could the platform
 * grant this?", never "is this tenant entitled to it?" — use
 * {@link isPlatformAllocated} for the latter. Treating this predicate as a
 * verification verdict is the cross-tenant hijack described at the top of this
 * file.
 *
 * Deliberately strict on three counts:
 *
 * - **Fails closed on an unset suffix.** No configuration, no platform zone.
 * - **The apex is NOT included.** `konf.run` itself is the platform's own
 *   origin, not a subdomain we mint for a tenant; if it ever has to route to a
 *   conference it goes through the normal DNS-TXT path, which the platform (the
 *   only party that can write to that zone) can satisfy trivially.
 * - **Wildcard claims are NEVER in scope.** `*.konf.run` covers every tenant
 *   subdomain at once, so allocating it would hand its holder every host in the
 *   zone. A wildcard over the platform zone must be proven like anything else.
 */
export function isPlatformZoneHost(
  entry: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const suffix = platformDomainSuffix(env)
  if (suffix === null) return false
  const host = normalizeDomain(entry)
  if (!host || host.startsWith('*.')) return false
  return isSubdomainOfSuffix(host, suffix)
}

/**
 * Has the platform ALLOCATED this record's hostname to this record's
 * conference? This is the entitlement check the policy, the sweep and the admin
 * view all key off.
 *
 * Requires BOTH halves, and neither is sufficient alone:
 *
 * - `method === 'platform-owned'` — written only by the platform's own tenant
 *   provisioning path (`ensureDomainVerification`'s `allocatePlatformHost`).
 *   Without it, any organizer who can type a hostname could mint the standing.
 * - {@link isPlatformZoneHost} — re-checked live, so a record that says
 *   `platform-owned` for a hostname no longer under the configured suffix (a
 *   white-label rebrand, a mistaken allocation, a suffix that has been unset)
 *   loses the standing on the next call rather than keeping it forever.
 *
 * Status is deliberately NOT considered here — `revoked` is handled by the
 * policy, which refuses it before this is ever consulted.
 */
export function isPlatformAllocated(
  record: DomainVerificationRecord,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    record.method === 'platform-owned' &&
    isPlatformZoneHost(record.hostname, env)
  )
}
