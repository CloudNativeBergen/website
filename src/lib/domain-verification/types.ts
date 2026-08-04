/** Shared shapes for domain ownership verification (#683). */

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

/** Fields the policy writes back after a check. */
export type DomainVerificationPatch = Partial<
  Pick<
    DomainVerificationRecord,
    | 'status'
    | 'method'
    | 'verifiedAt'
    | 'lastSuccessAt'
    | 'lastCheckedAt'
    | 'firstFailureAt'
    | 'consecutiveFailures'
    | 'consecutiveSoftFailures'
    | 'lastError'
  >
>
