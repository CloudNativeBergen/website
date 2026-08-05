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
 * `PLATFORM_DOMAIN_SUFFIX` follows the `PLATFORM_ORG_ID` contract
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
 *
 * ## Minting: {@link derivePlatformHosts}
 *
 * The same suffix that decides what is IN the zone also decides what the
 * platform MINTS for an edition — the pair `<org-slug>.<suffix>` and
 * `<org-slug>-<year>.<suffix>`, derived in one place so the two can never
 * disagree. Provisioning claims and allocates them; see
 * `src/lib/onboarding/provision.ts` and
 * `src/lib/conference/platformEditionHosts.ts`.
 *
 * The derivation runs ONCE per edition, at creation. Nothing re-derives it at
 * read time, so renaming an organization later cannot move, break or silently
 * re-issue an address that is already in the wild.
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
 * A single legal DNS label: 1-63 characters, alphanumeric with interior
 * hyphens. Deliberately NOT `ORG_SLUG_RE` — this is a DNS constraint, not a
 * slug-style one, and the 63-octet label ceiling (RFC 1035 §2.3.4) is the half
 * that actually matters here: org slugs are allowed up to 96 characters, so a
 * long one would otherwise mint a hostname that resolves nowhere.
 */
const DNS_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/**
 * Labels the platform keeps for ITSELF, refused as a minted tenant address.
 *
 * Cheap to add now and impossible to add later: the claim is globally unique
 * and permanent, so the first tenant slugged `api` or `auth` would take
 * `api.<suffix>` off the platform for good — including the one host the central
 * auth origin (#688) is going to want. The list covers the conventional
 * infrastructure names (RFC 2142 mailbox names, the usual www/api/cdn shape),
 * the platform's own product surfaces and the environment names a deploy would
 * plausibly use.
 */
const RESERVED_PLATFORM_LABELS = new Set([
  // infrastructure / conventional hostnames
  'www',
  'api',
  'cdn',
  'static',
  'assets',
  'media',
  'img',
  'images',
  'files',
  'mail',
  'email',
  'smtp',
  'imap',
  'mx',
  'ns',
  'ns1',
  'ns2',
  'dns',
  'ftp',
  'vpn',
  'proxy',
  'edge',
  'origin',
  // platform surfaces
  'admin',
  'auth',
  'login',
  'signin',
  'signup',
  'account',
  'accounts',
  'app',
  'apps',
  'my',
  'dashboard',
  'console',
  'status',
  'health',
  'billing',
  'pay',
  'payments',
  'checkout',
  'docs',
  'doc',
  'blog',
  'help',
  'support',
  'kb',
  'go',
  'link',
  // brand / operations
  'konf',
  'runkonf',
  'platform',
  'internal',
  'security',
  'abuse',
  'postmaster',
  'webmaster',
  'hostmaster',
  'noreply',
  'no-reply',
  'root',
  // environments
  'dev',
  'test',
  'stage',
  'staging',
  'preview',
  'demo',
  'sandbox',
  'beta',
  'alpha',
  'local',
  'localhost',
])

/**
 * Why hosts could NOT be minted. The callers report these differently — a
 * missing zone is a deployment problem, a reserved label is the operator's
 * choice of slug — so they are distinguished at the source rather than
 * flattened into `null`.
 */
export type PlatformHostRefusal = 'no-zone' | 'unusable-label' | 'reserved'

/**
 * The pair of hosts an edition is addressed by. `bare === dated` when the
 * edition has no start date, in which case the tenant simply has one host.
 */
export interface PlatformHostSet {
  /** `acme.konf.run` — the SHORT address of the org's LATEST edition. Moves. */
  bare: string
  /** `acme-2026.konf.run` — this edition's PERMANENT address. Never moves. */
  dated: string
}

export type PlatformHostsDerivation =
  | { ok: true; hosts: PlatformHostSet }
  | { ok: false; reason: PlatformHostRefusal }

/** The 4-digit edition year of a `YYYY-MM-DD` start date, or `null`. */
function editionYear(startDate: string | null | undefined): string | null {
  if (typeof startDate !== 'string') return null
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(startDate.trim())
  return match ? match[1] : null
}

/** `<label>.<suffix>`, or `null` when it is not a host we could allocate. */
function mintHost(
  label: string,
  suffix: string,
  env: NodeJS.ProcessEnv,
): string | null {
  if (!DNS_LABEL_RE.test(label)) return null
  const host = `${label}.${suffix}`
  if (!isValidDomainEntry(host) || !isPlatformZoneHost(host, env)) return null
  // ONE label below the suffix, asserted rather than assumed: this is exactly
  // the property a wildcard certificate can cover.
  if (host.split('.').length !== suffix.split('.').length + 1) return null
  return host
}

/**
 * THE HOSTNAMES THE PLATFORM MINTS FOR AN EDITION — two of them, both a SINGLE
 * label under the platform suffix:
 *
 *   `acme-2026.konf.run`  the edition's PERMANENT address. Belongs to that
 *                         edition forever and never moves, so an archived
 *                         edition's links keep resolving after it is retired.
 *   `acme.konf.run`       the SHORT address of the org's LATEST edition. This
 *                         one MOVES: creating a newer edition transfers it.
 *
 * ## Why the edition, not the organization
 *
 * Conferences are already addressed per edition in the wild
 * (`2024.cloudnativebergen.dev`, `2026.cloudnativedays.no`), and an edition's
 * URL has to outlive the edition. A dated host cannot collide across an org's
 * own editions, and cannot collide across orgs at all — the org slug is
 * globally unique and both labels inherit that uniqueness.
 *
 * ## ONE LABEL, never nested
 *
 * `acme-2026.konf.run`, NOT `2026.acme.konf.run`. A wildcard certificate covers
 * exactly one label; the nested form additionally needs a per-org wildcard
 * registered AND a deployment aliased to it, and without that last step a
 * visitor gets the CDN's own "deployment not found" page instead of ours. Both
 * labels here are single, which is why this needs no per-tenant provider work
 * at all. Enforced in {@link mintHost} rather than trusted: the label regex
 * admits no dots and the final host is re-counted against the suffix.
 *
 * ## When the year is unknown
 *
 * `startDate` is optional at provisioning (the activation checklist collects
 * dates later), and the answer is that `dated` collapses onto `bare` — NOT a
 * guess at the current year. A year in a hostname is a factual claim about the
 * event, the host is permanent and unmigratable, and a customer signing up in
 * December for next year's conference would be stuck with last year's address
 * forever. The tenant is still reachable, which is the whole point.
 *
 * ## Refusals
 *
 * `ok: false` — never a guess, never a fallback label:
 *
 *  - `no-zone` — the suffix is unset or unusable ({@link platformDomainSuffix}):
 *    this deployment operates no zone of its own;
 *  - `unusable-label` — a label DNS cannot carry (a slug over 63 characters, or
 *    one the year pushes over), so the host would resolve nowhere; also the
 *    self-consistency backstop, since a host our own {@link isPlatformZoneHost}
 *    would refuse to allocate must never reach a caller;
 *  - `reserved` — the ORG SLUG is in {@link RESERVED_PLATFORM_LABELS}. Checked
 *    on the bare label because that is the one the org would actually take:
 *    `www-2026` is harmless, `www` is not, and the pair is all-or-nothing.
 *
 * A refusal means "the platform cannot give this edition an address", and the
 * caller has to act on it loudly. It must NEVER be read as "no address needed"
 * — that is precisely the unreachable-tenant bug.
 */
export function derivePlatformHosts(
  orgSlug: string,
  startDate: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): PlatformHostsDerivation {
  const suffix = platformDomainSuffix(env)
  if (suffix === null) return { ok: false, reason: 'no-zone' }

  const slug = normalizeDomain(orgSlug)
  if (RESERVED_PLATFORM_LABELS.has(slug)) {
    return { ok: false, reason: 'reserved' }
  }

  const year = editionYear(startDate)
  const bare = mintHost(slug, suffix, env)
  const dated = year === null ? bare : mintHost(`${slug}-${year}`, suffix, env)
  if (bare === null || dated === null) {
    return { ok: false, reason: 'unusable-label' }
  }
  return { ok: true, hosts: { bare, dated } }
}

/**
 * Should a NEW edition take the bare `<org-slug>` host away from the edition
 * that currently holds it? PURE, so the one rule that decides where a moving
 * address points is a testable function rather than an inline comparison.
 *
 * "Latest" is by START DATE, not by creation order and not by year alone:
 *
 *  - A candidate starting LATER than the incumbent takes it. That is the whole
 *    purpose of the short address.
 *  - A candidate starting EARLIER does NOT. Back-filling a 2024 edition after
 *    2026 exists must not drag the org's short address backwards in time, and
 *    this is the case that would silently do it.
 *  - Ties keep the incumbent. Two editions in the same calendar year are
 *    ordered by their actual start dates, so the spring event still loses to
 *    the autumn one; only an exact same-day tie holds, and then the sitting
 *    edition wins because there is no evidence to move a live address.
 *  - A candidate with NO dates never takes it from a dated incumbent — we
 *    cannot show it is newer.
 *
 * Dates are ISO `YYYY-MM-DD`, where lexicographic order IS chronological order.
 */
export function shouldTakeLatestHost(
  incumbentStartDate: string | null | undefined,
  candidateStartDate: string | null | undefined,
): boolean {
  const incumbent = incumbentStartDate?.trim() || null
  const candidate = candidateStartDate?.trim() || null
  if (candidate === null) return false
  if (incumbent === null) return true
  return candidate > incumbent
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
