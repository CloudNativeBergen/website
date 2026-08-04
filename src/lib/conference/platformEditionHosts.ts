/**
 * THE SHORT ADDRESS THAT MOVES.
 *
 * A tenant is addressed by two platform hosts, both a single label under
 * `PLATFORM_DOMAIN_SUFFIX` (see `@/lib/domain-verification/platform`):
 *
 *   `acme-2026.konf.run`  PERMANENT — this edition's own address, so archive
 *                         links keep resolving long after it is retired;
 *   `acme.konf.run`       the SHORT address of the org's LATEST edition, which
 *                         therefore has to MOVE when a newer edition appears.
 *
 * `conference.domains[]` entries are a GLOBALLY UNIQUE routing claim, so the
 * bare host cannot sit on two editions at once — and it must never sit on
 * none. Moving it is a TRANSFER: released from the previous holder and claimed
 * by the new one, or neither. This module decides the transfer; the caller
 * stages both halves in ONE Sanity transaction, which is all-or-nothing, so
 * there is no interleaving in which the address is duplicated or lost.
 *
 * ## Why the planning is a read, not an inference
 *
 * Which edition currently holds the short address is a fact in the content
 * lake, not something derivable from a slug. It is read here, by hostname, and
 * the two rules applied to it are:
 *
 *  - {@link shouldTakeLatestHost} — the new edition takes the address only if
 *    it starts LATER. Back-filling a 2024 edition after 2026 exists must not
 *    drag the org's short address backwards.
 *  - SAME ORG ONLY. A minted label belongs to one organization by construction
 *    (the org slug is globally unique), so a holder from another org is an
 *    anomaly, reported as a CONFLICT and never transferred. Stealing a claim is
 *    the one outcome worse than not having one.
 *
 * The dated host is never transferred: it is permanent, so any holder at all
 * is a conflict.
 */

import {
  derivePlatformHosts,
  shouldTakeLatestHost,
} from '@/lib/domain-verification'
import { clientReadUncached } from '@/lib/sanity/client'
import { domainEntriesOverlap, normalizeDomain } from './domains'

/** One conference's hold on a platform host. */
interface HostHolder {
  _id: string
  organizationId: string | null
  startDate: string | null
  domains: string[]
}

export interface EditionHostPlan {
  /** Platform hosts the NEW edition claims, in `domains[]` order. */
  claim: string[]
  /**
   * The conference the bare host must be RELEASED from, in the same
   * transaction that claims it. `null` when nothing is being transferred.
   */
  releaseFrom: string | null
  /** The bare host when it is moving — what the release selector targets. */
  transferring: string | null
  /** A minted host some other tenant holds. Refuse; never transfer. */
  conflict: string | null
}

const EMPTY_PLAN: EditionHostPlan = {
  claim: [],
  releaseFrom: null,
  transferring: null,
  conflict: null,
}

/**
 * Which conferences currently hold either minted host. Keyed by hostname — a
 * global namespace — so this is deliberately not tenant-scoped.
 */
async function findHostHolders(hosts: string[]): Promise<HostHolder[]> {
  const rows = await clientReadUncached.fetch<HostHolder[] | null>(
    // groq-global: `domains[]` is a GLOBAL routing claim; the holder of a
    // hostname may be any tenant's conference, which is exactly what makes a
    // foreign holder worth detecting.
    `*[_type == "conference" && count(domains[@ in $hosts]) > 0]{
      _id,
      "organizationId": organization._ref,
      "startDate": startDate,
      domains
    }`,
    { hosts },
  )
  return rows ?? []
}

/**
 * Decide the new edition's platform hosts and any transfer they imply.
 *
 * Returns {@link EMPTY_PLAN} — mint nothing — whenever no host can be derived
 * (no platform zone, a reserved or unusable slug) or the source edition has no
 * organization. That is deliberately NOT fatal here, unlike in provisioning: a
 * new edition always carries at least one domain of its own (its schema
 * requires it), so it is reachable regardless, and a platform-side
 * misconfiguration must not block an organizer from creating next year's
 * conference.
 */
export async function planEditionPlatformHosts(input: {
  orgSlug: string | null | undefined
  organizationId: string | null | undefined
  startDate: string | null | undefined
  /** Every `domains[]` entry claimed anywhere, for the overlap check. */
  claimedDomains: readonly string[]
}): Promise<EditionHostPlan> {
  const { orgSlug, organizationId, startDate } = input
  if (!orgSlug || !organizationId) return EMPTY_PLAN

  const derived = derivePlatformHosts(orgSlug, startDate)
  if (!derived.ok) return EMPTY_PLAN
  const { bare, dated } = derived.hosts

  const holders = await findHostHolders([...new Set([bare, dated])])
  const holderOf = (host: string) =>
    holders.find((h) => h.domains.some((d) => normalizeDomain(d) === host)) ??
    null

  // The DATED host is permanent and belongs to this edition alone. Any holder
  // — even a sibling edition — means it is not ours to take.
  const datedHolder = dated === bare ? null : holderOf(dated)
  if (datedHolder !== null) return { ...EMPTY_PLAN, conflict: dated }

  const bareHolder = holderOf(bare)
  // A holder from another organization is an anomaly (the label is derived
  // from a globally unique org slug), and transferring across tenants would be
  // a hijack. Refuse instead.
  if (bareHolder !== null && bareHolder.organizationId !== organizationId) {
    return { ...EMPTY_PLAN, conflict: bare }
  }

  // A wildcard claim could serve either host without holding it exactly; the
  // routing matcher is the authority on that, so it is consulted too.
  const overlapping = [bare, dated].find((host) =>
    input.claimedDomains.some(
      (entry) =>
        domainEntriesOverlap(normalizeDomain(entry), host) &&
        // The sibling's exact hold on the bare host is the transfer case, not
        // a conflict.
        !(
          host === bare &&
          bareHolder !== null &&
          normalizeDomain(entry) === bare
        ),
    ),
  )
  if (overlapping !== undefined) return { ...EMPTY_PLAN, conflict: overlapping }

  // The dated host is always claimed; the bare one only when this edition is
  // genuinely the latest.
  const takesBare =
    bareHolder === null ||
    shouldTakeLatestHost(bareHolder.startDate, startDate ?? null)
  const claim = takesBare ? [...new Set([bare, dated])] : [dated]

  return {
    claim,
    releaseFrom: takesBare && bareHolder !== null ? bareHolder._id : null,
    transferring: takesBare && bareHolder !== null ? bare : null,
    conflict: null,
  }
}
