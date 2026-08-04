/**
 * Persistence for `domainVerification` documents.
 *
 * ALWAYS reads through `clientReadUncached`. A CDN-cached read is exactly the
 * kind of staleness that would keep a withdrawn proof alive on the redirect
 * allowlist, so verification state is never served from a cache — not Sanity's,
 * and no `'use cache'` wrapper on top either.
 */

import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { createReference } from '@/lib/sanity/helpers'
import { normalizeDomain } from '@/lib/conference/domains'
import { domainVerificationId, generateVerificationToken } from './challenge'
import { isPlatformZoneHost } from './platform'
import { GRANDFATHER_GRACE_DAYS } from './policy'
import type {
  DomainVerificationMethod,
  DomainVerificationPatch,
  DomainVerificationRecord,
} from './types'

const PROJECTION = `{
  _id,
  hostname,
  "conferenceId": conference._ref,
  token,
  "status": coalesce(status, "pending"),
  "method": coalesce(method, "dns-txt"),
  "graceUntil": graceUntil,
  "verifiedAt": verifiedAt,
  "lastSuccessAt": lastSuccessAt,
  "lastCheckedAt": lastCheckedAt,
  "firstFailureAt": firstFailureAt,
  "consecutiveFailures": coalesce(consecutiveFailures, 0),
  "consecutiveSoftFailures": coalesce(consecutiveSoftFailures, 0),
  "lastError": lastError
}`

type RawRecord = Omit<
  DomainVerificationRecord,
  | 'conferenceId'
  | 'graceUntil'
  | 'verifiedAt'
  | 'lastSuccessAt'
  | 'lastCheckedAt'
  | 'firstFailureAt'
  | 'lastError'
> & {
  conferenceId?: string | null
  graceUntil?: string | null
  verifiedAt?: string | null
  lastSuccessAt?: string | null
  lastCheckedAt?: string | null
  firstFailureAt?: string | null
  lastError?: string | null
}

function hydrate(raw: RawRecord): DomainVerificationRecord {
  return {
    ...raw,
    conferenceId: raw.conferenceId ?? null,
    graceUntil: raw.graceUntil ?? null,
    verifiedAt: raw.verifiedAt ?? null,
    lastSuccessAt: raw.lastSuccessAt ?? null,
    lastCheckedAt: raw.lastCheckedAt ?? null,
    firstFailureAt: raw.firstFailureAt ?? null,
    lastError: raw.lastError ?? null,
  }
}

/** One hostname's record, or `null` when the hostname was never claimed. */
export async function getDomainVerification(
  hostname: string,
): Promise<DomainVerificationRecord | null> {
  const raw = await clientReadUncached.fetch<RawRecord | null>(
    // groq-global: hostnames are a GLOBAL namespace — one record per hostname, addressed by deterministic id.
    `*[_type == "domainVerification" && _id == $id][0] ${PROJECTION}`,
    { id: domainVerificationId(normalizeDomain(hostname)) },
  )
  return raw ? hydrate(raw) : null
}

/**
 * Every live verification record, for the sweep. The exclusion is written as
 * `!(status in [...])` rather than `status != "revoked"` on purpose: GROQ
 * comparisons against a MISSING field yield null (falsy), so `!=` would silently
 * skip any record whose `status` was never written.
 */
export async function listAllDomainVerifications(): Promise<
  DomainVerificationRecord[]
> {
  const rows = await clientReadUncached.fetch<RawRecord[] | null>(
    // groq-global: the sweep re-proves EVERY tenant's claims in one pass — domain ownership is a platform-wide invariant.
    `*[_type == "domainVerification" && !(status in ["revoked"])] | order(hostname asc) ${PROJECTION}`,
  )
  return (rows ?? []).map(hydrate)
}

/** The records for one conference's claims, for the admin surface. */
export async function listDomainVerificationsForConference(
  conferenceId: string,
): Promise<DomainVerificationRecord[]> {
  const rows = await clientReadUncached.fetch<RawRecord[] | null>(
    // groq-global: keyed by an explicit, server-resolved conference id (the document type carries no organization field).
    `*[_type == "domainVerification" && conference._ref == $conferenceId] | order(hostname asc) ${PROJECTION}`,
    { conferenceId },
  )
  return (rows ?? []).map(hydrate)
}

/**
 * Speaker ids to alert when a conference's domain proof breaks — its
 * `organizers[]`, which is the canonical organiser set for /admin access.
 */
export async function getConferenceAlertTargets(
  conferenceId: string,
): Promise<string[]> {
  const ids = await clientReadUncached.fetch<string[] | null>(
    // groq-global: keyed by an explicit conference id read off a verification record, never from client input.
    `*[_type == "conference" && _id == $conferenceId][0].organizers[]._ref`,
    { conferenceId },
  )
  return ids ?? []
}

/**
 * Every record that could plausibly be on the redirect allowlist. Kept as a
 * GROQ prefilter only — {@link isAllowlistEligible} in `policy.ts` is the
 * authority, exactly as `domainEntriesOverlap` is for the routing matcher.
 *
 * `platform-owned` is listed explicitly even though those records are also
 * `verified`: the prefilter must not depend on the reconciliation having run.
 * A platform host whose record has not been reconciled yet still carries
 * `dns-txt`/`pending` and is missed here — deliberately, since the miss fails
 * CLOSED (one bounced sign-in) and is repaired by the next admin list, sweep or
 * claim.
 */
export async function listAllowlistCandidates(): Promise<
  DomainVerificationRecord[]
> {
  const rows = await clientReadUncached.fetch<RawRecord[] | null>(
    // groq-global: the OAuth redirect allowlist spans every tenant by design.
    `*[_type == "domainVerification" && (status == "verified" || method in ["grandfathered", "platform-owned"])] ${PROJECTION}`,
  )
  return (rows ?? []).map(hydrate)
}

/**
 * Create the record for a newly claimed hostname if it does not exist, and
 * RESET it when the holder changed.
 *
 * The reset is a security requirement, not housekeeping: if conference A
 * released `example.com` and conference B claims it, B must not inherit A's
 * proof — B has to publish its own TXT record with a token it has never seen
 * before. The old token is discarded in the same patch.
 *
 * ALLOCATION IS EXPLICIT. A host inside the platform's own zone is minted
 * `platform-owned`/`verified` ONLY when the caller passes
 * `allocatePlatformHost` — which only the platform's tenant-provisioning path
 * does. Every other caller (`updateDomains`, `createEdition`, the admin card's
 * self-heal) writes NOTHING for such a host unless an allocation already exists
 * for THIS conference. That is the whole entitlement control: were the hostname
 * alone to decide, any organizer who can type `some-other-tenant.<suffix>` into
 * their settings would mint themselves a permanent, unprovable grant to it.
 *
 * Leaving the record absent fails closed — unrouted under enforcement, never
 * allowlisted — and the mutations reject such a payload outright, so this is
 * defence in depth rather than the only line.
 */
export async function ensureDomainVerification(
  hostname: string,
  conferenceId: string,
  options: {
    method?: DomainVerificationMethod
    /** Platform-provisioning ONLY: grant this in-zone host to `conferenceId`. */
    allocatePlatformHost?: boolean
    now?: Date
  } = {},
): Promise<void> {
  const host = normalizeDomain(hostname)
  const _id = domainVerificationId(host)
  const inPlatformZone = isPlatformZoneHost(host)
  const now = options.now ?? new Date()
  const nowIso = now.toISOString()

  const existing = await clientReadUncached.fetch<RawRecord | null>(
    // groq-global: hostnames are a GLOBAL namespace — one record per hostname, addressed by deterministic id.
    `*[_type == "domainVerification" && _id == $id][0] ${PROJECTION}`,
    { id: _id },
  )

  // An allocation this conference already holds. Recognised so a tenant that
  // releases and re-adds its own platform subdomain is restored without a
  // support ticket — but note it is keyed on the STORED allocation, so it can
  // never manufacture one that was not granted.
  const holdsAllocation =
    existing?.method === 'platform-owned' &&
    existing.conferenceId === conferenceId
  const platformOwned =
    inPlatformZone && (options.allocatePlatformHost === true || holdsAllocation)
  if (inPlatformZone && !platformOwned) {
    // NO IMPLICIT ALLOCATION. Write nothing at all: a record here would either
    // grant the standing outright or promise the tenant a DNS challenge they
    // cannot answer.
    return
  }

  const method: DomainVerificationMethod = platformOwned
    ? 'platform-owned'
    : (options.method ?? 'dns-txt')
  const grandfathered = method === 'grandfathered'

  const grandfatherFields: Record<string, string> = grandfathered
    ? {
        graceUntil: new Date(
          now.getTime() + GRANDFATHER_GRACE_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString(),
        verifiedAt: nowIso,
        lastSuccessAt: nowIso,
      }
    : {}
  // Note the absence of `graceUntil`: a platform-owned record is PERMANENT, not
  // a time-boxed exemption like `grandfathered`.
  const platformFields: Record<string, string> = platformOwned
    ? { verifiedAt: nowIso, lastSuccessAt: nowIso }
    : {}
  const initialStatus = grandfathered || platformOwned ? 'verified' : 'pending'

  if (!existing) {
    await clientWrite.createIfNotExists({
      _type: 'domainVerification',
      _id,
      hostname: host,
      conference: createReference(conferenceId),
      token: generateVerificationToken(),
      status: initialStatus,
      method,
      consecutiveFailures: 0,
      consecutiveSoftFailures: 0,
      ...grandfatherFields,
      ...platformFields,
    })
    return
  }

  const sameHolder = existing.conferenceId === conferenceId
  if (sameHolder && existing.status !== 'revoked') {
    // One exception to "leave an existing record alone": the platform is
    // ALLOCATING a host this conference already claims under an ordinary
    // (or grandfathered) record, so the record has to be upgraded in place.
    // Gated on the explicit allocation — `holdsAllocation` cannot reach here,
    // since it implies the method is already `platform-owned`.
    if (options.allocatePlatformHost === true && platformOwned) {
      await clientWrite
        .patch(_id)
        .set({
          status: 'verified',
          method,
          consecutiveFailures: 0,
          consecutiveSoftFailures: 0,
          verifiedAt: existing.verifiedAt ?? nowIso,
          lastSuccessAt: nowIso,
        })
        .unset(['graceUntil', 'firstFailureAt', 'lastError'])
        .commit()
    }
    return
  }

  // Different holder, or the same holder re-claiming a released hostname:
  // start from zero. The `unset` clears the whole timing history so a stale
  // `lastSuccessAt` cannot make the new claim look already proven.
  await clientWrite
    .patch(_id)
    .set({
      hostname: host,
      conference: createReference(conferenceId),
      token: sameHolder ? existing.token : generateVerificationToken(),
      status: initialStatus,
      method,
      consecutiveFailures: 0,
      consecutiveSoftFailures: 0,
      ...grandfatherFields,
      ...platformFields,
    })
    .unset(
      grandfathered
        ? ['firstFailureAt', 'lastError']
        : platformOwned
          ? ['graceUntil', 'firstFailureAt', 'lastError']
          : [
              'graceUntil',
              'verifiedAt',
              'lastSuccessAt',
              'lastCheckedAt',
              'firstFailureAt',
              'lastError',
            ],
    )
    .commit()
}

/**
 * Mark a hostname's record revoked because the conference released the claim.
 * Revocation is immediate and unconditional — the redirect allowlist must lose
 * the host the instant it stops being claimed, with no grace at all.
 *
 * Guarded on the holder: a hostname some OTHER conference has since claimed is
 * left alone, so a late/duplicated release can never knock out the new holder.
 */
export async function revokeDomainVerification(
  hostname: string,
  conferenceId: string,
): Promise<void> {
  const _id = domainVerificationId(normalizeDomain(hostname))
  const existing = await clientReadUncached.fetch<RawRecord | null>(
    // groq-global: hostnames are a GLOBAL namespace — one record per hostname, addressed by deterministic id.
    `*[_type == "domainVerification" && _id == $id][0] ${PROJECTION}`,
    { id: _id },
  )
  if (!existing || existing.conferenceId !== conferenceId) return
  await clientWrite.patch(_id).set({ status: 'revoked' }).commit()
}

/**
 * Persist one check's write-back. `null` in the patch means "clear the field",
 * so it becomes an `unset` rather than a stored null — otherwise a cleared
 * `firstFailureAt` would still parse as a date on the read side.
 */
export async function patchDomainVerification(
  id: string,
  patch: DomainVerificationPatch,
): Promise<void> {
  const set: Record<string, unknown> = {}
  const unset: string[] = []
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) unset.push(key)
    else set[key] = value
  }
  if (Object.keys(set).length === 0 && unset.length === 0) return
  let tx = clientWrite.patch(id)
  if (Object.keys(set).length > 0) tx = tx.set(set)
  if (unset.length > 0) tx = tx.unset(unset)
  await tx.commit()
}
