/**
 * The client-safe view model for one claimed domain: what the admin card
 * renders and what the onboarding hand-off shows. Pure — no Sanity, no DNS — so
 * both the tRPC router and Storybook can produce it.
 */

import {
  challengeRecordName,
  expectedTxtValue,
  isDevOnlyHost,
  isWildcardEntry,
} from './challenge'
import { isPlatformOwnedHost } from './platform'
import { isAllowlistEligible, isRoutingEligible } from './policy'
import type {
  DomainVerificationRecord,
  DomainVerificationStatus,
} from './types'

export interface DomainVerificationView {
  hostname: string
  status: DomainVerificationStatus
  /** True for a claim the backfill admitted without proof, still inside its window. */
  grandfathered: boolean
  /**
   * True for a subdomain of the platform's own zone: verified by construction,
   * permanently, with NOTHING for the tenant to publish.
   */
  platformOwned: boolean
  /** The deadline for a grandfathered claim to publish a real proof. */
  graceUntil: string | null
  /** DNS name the TXT record goes at. `null` for a dev-only or platform entry. */
  recordName: string | null
  /** The exact TXT value to publish. `null` for a dev-only or platform entry. */
  recordValue: string | null
  /** Wildcard claims are proven on their base zone. */
  wildcard: boolean
  /** Loopback / dev entries can never be proven and are never allowlisted. */
  devOnly: boolean
  /** Would #688's exact-host allowlist accept this domain right now? */
  redirectAllowlisted: boolean
  /** Would routing still serve this domain if enforcement were on? */
  routable: boolean
  lastCheckedAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
}

/**
 * Build the view for one claimed entry. `record` is `null` when the hostname has
 * been claimed in `domains[]` but has no verification document yet — which the
 * card must surface as unverified rather than hide.
 */
export function toDomainVerificationView(
  hostname: string,
  record: DomainVerificationRecord | null,
  now: Date = new Date(),
): DomainVerificationView {
  const devOnly = isDevOnlyHost(hostname)
  // Derived from the HOSTNAME, so a platform subdomain reads correctly even
  // before the sweep has reconciled its record (or when it has none at all).
  const platformOwned = isPlatformOwnedHost(hostname)
  // No challenge is shown for a platform host: it would ask the tenant to
  // publish a record in a zone only the platform can write to.
  const recordName = platformOwned ? null : challengeRecordName(hostname)
  return {
    hostname,
    status: platformOwned ? 'verified' : (record?.status ?? 'pending'),
    grandfathered: !platformOwned && record?.method === 'grandfathered',
    platformOwned,
    graceUntil: platformOwned ? null : (record?.graceUntil ?? null),
    recordName,
    recordValue: record && recordName ? expectedTxtValue(record.token) : null,
    wildcard: isWildcardEntry(hostname),
    devOnly,
    // Record-driven even for a platform host, on purpose: the real allowlist
    // ENUMERATES documents (`listAllowlistCandidates`), so a claim with no
    // record genuinely is not on it. Routing needs no such document, hence the
    // asymmetry below.
    redirectAllowlisted: record ? isAllowlistEligible(record, now) : false,
    routable:
      platformOwned || (record ? isRoutingEligible(record, now) : false),
    lastCheckedAt: record?.lastCheckedAt ?? null,
    lastSuccessAt: record?.lastSuccessAt ?? null,
    lastError: record?.lastError ?? null,
  }
}
