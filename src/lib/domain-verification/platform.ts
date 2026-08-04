/**
 * PLATFORM-OWNED HOSTS — the zone the platform itself operates.
 *
 * Konf hosts tenants on subdomains it MINTS (`<slug>.konf.run`): that zone's
 * nameservers are delegated to our own edge, a wildcard certificate covers every
 * label under it, and no tenant has any access to it whatsoever. Asking such a
 * tenant to publish a `_konf-challenge` TXT record is asking them to write into
 * a zone only we can write to — the proof is unobtainable by construction, so
 * under `DOMAIN_VERIFICATION_ENFORCE_ROUTING` every platform-hosted tenant would
 * simply go dark.
 *
 * A host under the platform suffix is therefore verified BY CONSTRUCTION, and
 * `method: "platform-owned"` records that fact. Unlike `grandfathered` — a
 * deliberately time-boxed 30-day exemption for claims that predate the feature —
 * this is PERMANENT and carries no `graceUntil`: there is no future date on
 * which we stop controlling our own zone, and nothing the tenant could ever do
 * to "complete" the proof.
 *
 * ## The suffix is CONFIGURATION
 *
 * `PLATFORM_DOMAIN_SUFFIX` follows the `PLATFORM_ORG_SLUG` contract
 * (`src/lib/features/platform.ts`): the platform is white-labelable, so
 * `konf.run` is a deployment fact, never a constant in the source.
 *
 * UNSET MEANS "NO HOST IS PLATFORM-OWNED", never "every host is". This is the
 * one inversion that would be catastrophic — an empty suffix matching every
 * hostname would hand a permanent, unprovable routing AND redirect-allowlist
 * grant to every claim on the platform — so every rejection path below returns
 * `null` and {@link isPlatformOwnedHost} fails CLOSED on it.
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
 * Is this `domains[]` entry a host the PLATFORM owns and therefore proves by
 * construction?
 *
 * Deliberately strict on three counts:
 *
 * - **Fails closed on an unset suffix.** No configuration, no platform hosts.
 * - **The apex is NOT included.** `konf.run` itself is the platform's own
 *   origin, not a subdomain we minted for a tenant; if it ever has to route to a
 *   conference it goes through the normal DNS-TXT path, which the platform (the
 *   only party that can write to that zone) can satisfy trivially.
 * - **Wildcard claims are NEVER platform-owned.** `*.konf.run` covers every
 *   tenant subdomain at once, so auto-verifying it would let the first
 *   conference to claim it route every host in the zone it does not otherwise
 *   own. A wildcard over the platform zone must be proven like anything else.
 */
export function isPlatformOwnedHost(
  entry: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const suffix = platformDomainSuffix(env)
  if (suffix === null) return false
  const host = normalizeDomain(entry)
  if (!host || host.startsWith('*.')) return false
  return isSubdomainOfSuffix(host, suffix)
}
