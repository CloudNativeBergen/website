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
import { isPlatformOwnedHost } from './platform'
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
 * A host inside the platform's OWN zone is minted `platform-owned`/`verified`
 * outright, overriding the caller's `method`: there is no challenge for the
 * tenant to answer, so leaving it `pending` would only produce an admin card
 * asking for an impossible DNS record. The hostname decides this, not the
 * caller — every entry point (onboarding, `updateDomains`, the provisioning
 * API, the backfill) therefore gets it right without knowing about it.
 */
export async function ensureDomainVerification(
  hostname: string,
  conferenceId: string,
  options: { method?: DomainVerificationMethod; now?: Date } = {},
): Promise<void> {
  const host = normalizeDomain(hostname)
  const _id = domainVerificationId(host)
  const platformOwned = isPlatformOwnedHost(host)
  const method: DomainVerificationMethod = platformOwned
    ? 'platform-owned'
    : (options.method ?? 'dns-txt')
  const now = options.now ?? new Date()
  const grandfathered = method === 'grandfathered'
  const nowIso = now.toISOString()

  const existing = await clientReadUncached.fetch<RawRecord | null>(
    // groq-global: hostnames are a GLOBAL namespace — one record per hostname, addressed by deterministic id.
    `*[_type == "domainVerification" && _id == $id][0] ${PROJECTION}`,
    { id: _id },
  )

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
    // One exception to "leave an existing record alone": a host that has BECOME
    // platform-owned (claimed before this feature, or before the suffix was
    // configured) still carries a `pending` DNS-TXT record, so the admin card
    // would demand a record in our own zone. Reconcile it in place; the sweep
    // would do the same thing tomorrow.
    if (platformOwned && existing.method !== 'platform-owned') {
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
