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
 *  - a host of a conference owned by the platform organization
 *    (`PLATFORM_ORG_ID`) whose DNS proof has actually resolved
 *    (`method: 'dns-txt'`). The allowlist also admits a `grandfathered` record
 *    during its grace period, and a `platform-owned` one keeps a recent success
 *    time after the platform suffix it was allocated under has changed; neither
 *    was ever proven, and neither is enough here.
 *
 * ONE FUNCTION. The WorkOS redirect-URI sync (`@/lib/workshop/redirect-uris`)
 * registers nothing this refuses.
 *
 * APPLIED TO THE SIGN-IN DECISION ONLY THROUGH THE SYNC. Since #1298
 * `resolveWorkshopSignInHost` (`@/lib/workshop/sign-in`) also requires the
 * host's redirect URI to be in WorkOS, and the sync records a URI (as
 * `registered` or `external`) only for a host this admits, so a tenant's own
 * verified domain is refused in practice. The decision does not re-check this
 * function itself: a host that STOPS qualifying (its conference changes owner,
 * `PLATFORM_ORG_ID` changes) keeps signing in until the next sync clears its
 * URI — at the latest the daily sweep. Calling it there is #1306.
 *
 * Fail closed: everything the allowlist refuses (wildcard, dev-only, revoked,
 * unproven, stale) is `false`, and so, for a host the platform did not allocate,
 * are an unset `PLATFORM_ORG_ID` and a missing owner. An allocated host
 * qualifies whoever owns the conference, or if nobody does: the owner is not
 * read for it here.
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
  if (record.method !== 'dns-txt') return false
  const platformOrgId = resolvePlatformOrgId()
  return platformOrgId !== null && ownerOrgId === platformOrgId
}
