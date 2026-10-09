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
import { scheduleRedirectUriReconcile } from '@/lib/workshop/redirect-uris'
import { isDevOnlyHost, isWildcardEntry } from './challenge'
import { isPlatformZoneHost } from './platform'
import {
  ensureDomainVerification,
  getDomainVerification,
  listDomainVerificationsForConference,
  listRedirectUriSyncRowsForConference,
  revokeDomainVerification,
} from './sanity'
import { workshopSignInStandingOfRow } from './sign-in-standing'
import {
  isWorkshopsEnabledForConference,
  type WorkshopConference,
} from '@/lib/features/workshops'
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
 *
 * A claim or a release can change which hosts may sign in to the workshop
 * portal, so whenever a record was actually WRITTEN the WorkOS redirect URIs are
 * reconciled after the response (#1297). Never when nothing changed: the admin
 * card calls this on every load to self-heal.
 */
export async function syncDomainVerifications(
  conferenceId: string,
  domains: readonly string[],
  removed: readonly string[] = [],
  options: { allocatePlatformHosts?: boolean } = {},
): Promise<void> {
  const claimed = new Set(domains.map(normalizeDomain).filter(Boolean))
  let changed = false
  try {
    for (const hostname of claimed) {
      const wrote = await ensureDomainVerification(hostname, conferenceId, {
        allocatePlatformHost: options.allocatePlatformHosts === true,
      })
      changed ||= wrote
    }
    for (const hostname of removed.map(normalizeDomain).filter(Boolean)) {
      if (claimed.has(hostname)) continue
      const revoked = await revokeDomainVerification(hostname, conferenceId)
      changed ||= revoked
    }
  } catch (error) {
    console.error(
      `[domain-verification] failed to sync records for conference ${conferenceId}:`,
      error,
    )
  }
  if (changed) scheduleRedirectUriReconcile()
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
 *
 * With `workshops` on, each host also carries where it stands for the workshop
 * portal's sign-in (#1298), from the same single read; a local dev entry and a
 * wildcard never sign in and carry nothing.
 */
export async function listDomainVerificationViews(
  conferenceId: string,
  domains: readonly string[],
  {
    workshops = false,
    now = new Date(),
  }: { workshops?: boolean; now?: Date } = {},
): Promise<DomainVerificationView[]> {
  const syncRows = workshops
    ? await listRedirectUriSyncRowsForConference(conferenceId)
    : null
  const records =
    syncRows?.map((row) => row.record) ??
    (await listDomainVerificationsForConference(conferenceId))
  const byHost = new Map(records.map((r) => [normalizeDomain(r.hostname), r]))
  const rowByHost = new Map(
    (syncRows ?? []).map((row) => [normalizeDomain(row.record.hostname), row]),
  )
  return domains
    .map(normalizeDomain)
    .filter(Boolean)
    .map((hostname) => {
      const signIn =
        syncRows && !isDevOnlyHost(hostname) && !isWildcardEntry(hostname)
          ? workshopSignInStandingOfRow(rowByHost.get(hostname) ?? null, now)
          : null
      return toDomainVerificationView(
        hostname,
        byHost.get(hostname) ?? null,
        now,
        signIn,
      )
    })
}

/**
 * {@link listDomainVerificationViews} for a conference, with workshops decided
 * by its own gate (#1298): the one call the settings page, the domain router
 * and system status make, so all three show the same hosts the same way.
 */
export async function listConferenceDomainViews(
  conference: WorkshopConference & {
    _id: string
    domains?: readonly string[] | null
  },
): Promise<DomainVerificationView[]> {
  return listDomainVerificationViews(conference._id, conference.domains ?? [], {
    workshops: await isWorkshopsEnabledForConference(conference),
  })
}
