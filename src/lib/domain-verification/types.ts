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
 * How the record earned its current status. `grandfathered` records were
 * admitted by the backfill without proof and are trusted ONLY until
 * `graceUntil`; they become `dns-txt` the moment a real proof resolves.
 */
export type DomainVerificationMethod = 'dns-txt' | 'grandfathered'

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
 */
export type DomainCheckOutcome =
  | { kind: 'verified' }
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
