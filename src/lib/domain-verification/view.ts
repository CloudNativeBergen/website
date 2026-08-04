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
  /** The deadline for a grandfathered claim to publish a real proof. */
  graceUntil: string | null
  /** DNS name the TXT record goes at. `null` for a dev-only entry. */
  recordName: string | null
  /** The exact TXT value to publish. `null` for a dev-only entry. */
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
  const recordName = challengeRecordName(hostname)
  const devOnly = isDevOnlyHost(hostname)
  return {
    hostname,
    status: record?.status ?? 'pending',
    grandfathered: record?.method === 'grandfathered',
    graceUntil: record?.graceUntil ?? null,
    recordName,
    recordValue: record && recordName ? expectedTxtValue(record.token) : null,
    wildcard: isWildcardEntry(hostname),
    devOnly,
    redirectAllowlisted: record ? isAllowlistEligible(record, now) : false,
    routable: record ? isRoutingEligible(record, now) : false,
    lastCheckedAt: record?.lastCheckedAt ?? null,
    lastSuccessAt: record?.lastSuccessAt ?? null,
    lastError: record?.lastError ?? null,
  }
}
