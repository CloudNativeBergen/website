/**
 * Keeps `domainVerification` documents in step with `conference.domains[]`.
 *
 * Called by every mutation that CLAIMS or RELEASES a domain — `updateDomains`,
 * `createEdition` and tenant onboarding — so a claim always has a record and a
 * released claim always loses its standing. Without the release half, a domain
 * removed from `domains[]` would keep its `verified` record and stay on the
 * redirect allowlist forever: a stale destination nobody is even routing any
 * more, which is precisely the dangling-DNS shape #683 is about.
 */

import { normalizeDomain } from '@/lib/conference/domains'
import { isPlatformZoneHost } from './platform'
import {
  ensureDomainVerification,
  getDomainVerification,
  listDomainVerificationsForConference,
  revokeDomainVerification,
} from './sanity'
import { toDomainVerificationView, type DomainVerificationView } from './view'

/**
 * Ensure a record for every entry in `domains`, and revoke the ones in
 * `removed` that are no longer claimed.
 *
 * `allocatePlatformHosts` is the platform's GRANT of a subdomain of its own zone
 * to this conference and belongs to the tenant-provisioning path alone
 * (`provisionOrganization`). Left off — the default, and what every
 * tenant-facing mutation passes — an unallocated host under the platform suffix
 * simply gets no record, which fails closed.
 *
 * BEST-EFFORT, like the notification hub: a verification bookkeeping failure
 * must never roll back the domain mutation that triggered it. A missing record
 * fails CLOSED downstream (unrouted under enforcement, never allowlisted) and is
 * repaired by the next admin re-check or backfill run, so swallowing the error
 * cannot silently grant anything.
 */
export async function syncDomainVerifications(
  conferenceId: string,
  domains: readonly string[],
  removed: readonly string[] = [],
  options: { allocatePlatformHosts?: boolean } = {},
): Promise<void> {
  const claimed = new Set(domains.map(normalizeDomain).filter(Boolean))
  try {
    for (const hostname of claimed) {
      await ensureDomainVerification(hostname, conferenceId, {
        allocatePlatformHost: options.allocatePlatformHosts === true,
      })
    }
    for (const hostname of removed.map(normalizeDomain).filter(Boolean)) {
      if (claimed.has(hostname)) continue
      await revokeDomainVerification(hostname, conferenceId)
    }
  } catch (error) {
    console.error(
      `[domain-verification] failed to sync records for conference ${conferenceId}:`,
      error,
    )
  }
}

/**
 * The subset of `domains` that sits inside the platform's own zone WITHOUT an
 * allocation to `conferenceId` — i.e. the entries a tenant-facing mutation must
 * refuse.
 *
 * This is the entitlement guard, and it belongs at the WRITE path: `domains[]`
 * is a globally unique routing claim, so letting an organizer save
 * `some-other-tenant.<suffix>` does not merely fail to verify — it permanently
 * blocks the rightful tenant from ever being given that hostname. Rejecting the
 * payload keeps the claim itself from being made.
 *
 * Hosts outside the platform zone are never returned: custom domains are none of
 * this function's business and keep proving themselves by DNS-TXT.
 */
export async function findUnallocatedPlatformDomains(
  conferenceId: string,
  domains: readonly string[],
): Promise<string[]> {
  const inZone = domains
    .map(normalizeDomain)
    .filter(Boolean)
    .filter((hostname) => isPlatformZoneHost(hostname))
  if (inZone.length === 0) return []

  const verdicts = await Promise.all(
    inZone.map(async (hostname) => {
      const record = await getDomainVerification(hostname)
      // The allocation is the record the PLATFORM wrote, naming this conference.
      // A `dns-txt` record — however verified — is not an allocation, and one
      // naming another conference is emphatically not.
      const allocated =
        record !== null &&
        record.method === 'platform-owned' &&
        record.conferenceId === conferenceId
      return allocated ? null : hostname
    }),
  )
  return verdicts.filter((hostname): hostname is string => hostname !== null)
}

/**
 * The admin view of one conference's claims, driven by `domains[]` rather than
 * by the verification documents: a claim with NO record must still be listed
 * (as unverified). Hiding it would make the most dangerous state — claimed but
 * unproven — the one state the operator cannot see.
 *
 * A record whose holder is a different conference is treated as absent, so a
 * hostname another tenant now owns can never leak its token into this tenant's
 * settings page.
 */
export async function listDomainVerificationViews(
  conferenceId: string,
  domains: readonly string[],
  now: Date = new Date(),
): Promise<DomainVerificationView[]> {
  const records = await listDomainVerificationsForConference(conferenceId)
  const byHost = new Map(records.map((r) => [normalizeDomain(r.hostname), r]))
  return domains
    .map(normalizeDomain)
    .filter(Boolean)
    .map((hostname) =>
      toDomainVerificationView(hostname, byHost.get(hostname) ?? null, now),
    )
}
