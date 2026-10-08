/**
 * PLATFORM-CONTROLLED HOSTS (#1306) — the hosts that may carry the workshop
 * portal's WorkOS sign-in.
 *
 * The verified-redirect allowlist (`./allowlist`) answers "has the claimant
 * proven control of this hostname's DNS zone". A WorkOS redirect URI needs a
 * stronger answer, because every tenant shares one WorkOS client: the host has
 * to be one the PLATFORM serves and whose DNS the platform controls. So, on top
 * of allowlist eligibility, a host qualifies only when it is
 *
 *  - a subdomain the platform ALLOCATED (`isPlatformAllocated`), or
 *  - a verified host of a conference owned by the platform organization
 *    (`PLATFORM_ORG_ID`).
 *
 * ONE FUNCTION. The WorkOS redirect-URI sync (`@/lib/workshop/redirect-uris`)
 * registers nothing this refuses; any other place that decides where a sign-in
 * may run must call it too rather than restate it.
 *
 * Fail closed: an unset `PLATFORM_ORG_ID`, a missing owner, and everything the
 * allowlist refuses (wildcard, dev-only, revoked, unproven, stale) are `false`.
 */

import { resolvePlatformOrgId } from '@/lib/authz/platform'
import { isPlatformAllocated } from './platform'
import { isAllowlistEligible } from './policy'
import type { DomainVerificationRecord } from './types'

/**
 * @param ownerOrgId the organization that owns the conference claiming the
 *   host, resolved server-side from the record's conference.
 */
export function isPlatformControlledHost(
  record: DomainVerificationRecord,
  ownerOrgId: string | null | undefined,
  now: Date,
): boolean {
  if (!isAllowlistEligible(record, now)) return false
  if (isPlatformAllocated(record)) return true
  const platformOrgId = resolvePlatformOrgId()
  return platformOrgId !== null && ownerOrgId === platformOrgId
}
