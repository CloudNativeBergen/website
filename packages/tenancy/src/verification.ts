/**
 * Domain verification shapes, the check write-back policy and TXT matching
 * (#683), shared by the site and tenant-directory (#2207) so both apply one
 * implementation. Pure: no DNS, no storage, no environment. The eligibility
 * rules that read the platform zone stay in src/lib/domain-verification.
 */

import { expectedTxtValue } from './challenge'

/**
 * Lifecycle of one hostname's proof.
 *
 * - `pending` — claimed, never proven. Not routable (under enforcement) and
 *   never allowlisted.
 * - `verified` — the challenge TXT resolved on the last check.
 * - `failing` — the challenge STOPPED resolving. Off the redirect allowlist
 *   immediately; routing survives a grace period (see `policy.ts`).
 * - `revoked` — the claim was released (removed from `domains[]`). Terminal
 *   until the hostname is claimed again, which mints a fresh token.
 */
export type DomainVerificationStatus =
  'pending' | 'verified' | 'failing' | 'revoked'

/**
 * How the record earned its current status.
 *
 * - `dns-txt` — the tenant published the challenge record in their own zone.
 * - `grandfathered` — admitted by the backfill without proof, trusted ONLY
 *   until `graceUntil`; becomes `dns-txt` the moment a real proof resolves.
 * - `platform-owned` — the hostname sits under the platform's OWN zone
 *   (`PLATFORM_DOMAIN_SUFFIX`, see `platform.ts`), so control is ours by
 *   construction. PERMANENT, not a grace period: it carries no `graceUntil`
 *   and there is no proof for the tenant to complete. Re-derived from the
 *   hostname on every decision, so a stale record cannot outlive the config.
 */
export type DomainVerificationMethod =
  'dns-txt' | 'grandfathered' | 'platform-owned'

/** A `domainVerification` document as the app reads it. */
export interface DomainVerificationRecord {
  _id: string
  hostname: string
  conferenceId: string | null
  token: string
  status: DomainVerificationStatus
  method: DomainVerificationMethod
  graceUntil: string | null
  verifiedAt: string | null
  lastSuccessAt: string | null
  lastCheckedAt: string | null
  firstFailureAt: string | null
  consecutiveFailures: number
  consecutiveSoftFailures: number
  lastError: string | null
}

/**
 * The verdict of a single live check.
 *
 * The hard/soft split is the core of the delisting policy. A `hard-failure`
 * means DNS answered and the proof is GONE — the dangling-DNS signal, and the
 * only thing that may cost a domain its standing. A `soft-failure` means our
 * resolver could not get an answer at all (timeout, SERVFAIL, network); that is
 * our outage, not the tenant's, and must never delist on its own.
 *
 * `platform-owned` is the one verdict reached WITHOUT a lookup: the hostname is
 * inside our own zone, so there is nothing to resolve and nothing that could
 * fail. The sweep never issues a query for those records.
 */
export type DomainCheckOutcome =
  | { kind: 'verified' }
  | { kind: 'platform-owned' }
  | { kind: 'hard-failure'; reason: string }
  | { kind: 'soft-failure'; reason: string }
  | { kind: 'unverifiable'; reason: string }

/**
 * Fields the policy writes back after a check.
 *
 * `graceUntil` is included so a deadline can be CLEARED (`null` → `unset`, see
 * `patchDomainVerification`). Without it a record that was grandfathered before
 * the platform allocated it would keep its 30-day deadline and expire, even
 * though a platform allocation has none.
 */
export type DomainVerificationPatch = Partial<
  Pick<
    DomainVerificationRecord,
    | 'status'
    | 'method'
    | 'graceUntil'
    | 'verifiedAt'
    | 'lastSuccessAt'
    | 'lastCheckedAt'
    | 'firstFailureAt'
    | 'consecutiveFailures'
    | 'consecutiveSoftFailures'
    | 'lastError'
  >
>

/** A successful proof older than this stops counting for the redirect allowlist. */
export const ALLOWLIST_MAX_STALENESS_DAYS = 30

/** Hard failures needed before routing may be withdrawn. */
export const ROUTING_GRACE_FAILURES = 3

/** …and how long the failure streak must have lasted as well. */
export const ROUTING_GRACE_DAYS = 7

/**
 * Consecutive resolver outages before a soft failure is escalated to a hard one.
 * Bounds the "our DNS has been broken for weeks" case without punishing a blip.
 */
export const SOFT_FAILURE_ESCALATION = 5

/** How long a backfilled (grandfathered) claim is honoured without proof. */
export const GRANDFATHER_GRACE_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

export function daysBetween(fromIso: string, now: Date): number {
  const from = Date.parse(fromIso)
  if (Number.isNaN(from)) return Number.POSITIVE_INFINITY
  return (now.getTime() - from) / DAY_MS
}

/** True while a grandfathered record is still inside its migration window. */
export function inGrandfatherGrace(
  record: DomainVerificationRecord,
  now: Date,
): boolean {
  if (record.method !== 'grandfathered') return false
  if (record.status === 'revoked') return false
  if (!record.graceUntil) return false
  const until = Date.parse(record.graceUntil)
  return !Number.isNaN(until) && now.getTime() < until
}

/**
 * The write-back for one check result. Returns ONLY changed fields so the caller
 * can issue a narrow patch.
 *
 * A `revoked` record is inert — the claim is gone, so a check result must not
 * resurrect it.
 */
export function applyCheckOutcome(
  record: DomainVerificationRecord,
  outcome: DomainCheckOutcome,
  now: Date,
): DomainVerificationPatch {
  const nowIso = now.toISOString()
  if (record.status === 'revoked') return {}

  if (outcome.kind === 'platform-owned') {
    // No lookup happened and none ever will. The write-back exists so the
    // stored record TELLS THE TRUTH — verified, by the platform, with no
    // failure history — which is what the admin card and the allowlist's GROQ
    // prefilter read.
    return {
      status: 'verified',
      method: 'platform-owned',
      // CLEARED, not left alone: a record that was grandfathered before it was
      // allocated still carries that 30-day deadline, and a platform allocation
      // has no deadline. Leaving it would expire a permanent grant.
      graceUntil: null,
      verifiedAt: record.verifiedAt ?? nowIso,
      lastSuccessAt: nowIso,
      lastCheckedAt: nowIso,
      firstFailureAt: null,
      consecutiveFailures: 0,
      consecutiveSoftFailures: 0,
      lastError: null,
    }
  }

  if (outcome.kind === 'verified') {
    return {
      status: 'verified',
      // A real proof retires the grandfathered exemption for good.
      method: 'dns-txt',
      verifiedAt: record.verifiedAt ?? nowIso,
      lastSuccessAt: nowIso,
      lastCheckedAt: nowIso,
      firstFailureAt: null,
      consecutiveFailures: 0,
      consecutiveSoftFailures: 0,
      lastError: null,
    }
  }

  if (outcome.kind === 'unverifiable') {
    // Nothing to prove and nothing to punish: a dev-only entry simply never
    // reaches `verified`. Recorded so the admin surface can explain itself.
    return { lastCheckedAt: nowIso, lastError: outcome.reason }
  }

  if (outcome.kind === 'soft-failure') {
    const soft = record.consecutiveSoftFailures + 1
    if (soft < SOFT_FAILURE_ESCALATION) {
      // Deliberately does NOT touch status, firstFailureAt or the hard counter:
      // our resolver being unhappy is not evidence about the tenant's zone.
      return {
        lastCheckedAt: nowIso,
        consecutiveSoftFailures: soft,
        lastError: outcome.reason,
      }
    }
    return {
      status: 'failing',
      lastCheckedAt: nowIso,
      firstFailureAt: record.firstFailureAt ?? nowIso,
      consecutiveFailures: record.consecutiveFailures + 1,
      consecutiveSoftFailures: soft,
      lastError: `${outcome.reason} (escalated after ${soft} consecutive resolver failures)`,
    }
  }

  return {
    status: 'failing',
    lastCheckedAt: nowIso,
    firstFailureAt: record.firstFailureAt ?? nowIso,
    consecutiveFailures: record.consecutiveFailures + 1,
    consecutiveSoftFailures: 0,
    lastError: outcome.reason,
  }
}

/**
 * The verdict for the TXT records DNS returned at `name`. A TXT record is a
 * list of character-string chunks (RFC 1035 §3.3.14); the chunks of one record
 * are joined, and every record at the name is considered.
 */
export function classifyTxtRecords(
  name: string,
  token: string,
  records: string[][],
): DomainCheckOutcome {
  const expected = expectedTxtValue(token)
  if (records.some((chunks) => chunks.join('').trim() === expected))
    return { kind: 'verified' }
  return {
    kind: 'hard-failure',
    reason:
      records.length === 0
        ? `No TXT record at ${name}`
        : `TXT records at ${name} do not contain the expected token`,
  }
}
