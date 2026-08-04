import { createHash, timingSafeEqual } from 'crypto'
import {
  MIN_PROVISIONING_TOKEN_LENGTH,
  PROVISIONING_TOKEN_ENV,
} from './constants'

/**
 * BEARER AUTHENTICATION for the machine provisioning API.
 *
 * This is the only thing standing between the public internet and tenant
 * creation — an endpoint that can mint an organization, claim domains and
 * attach an organizer. Three properties are non-negotiable:
 *
 *  1. FAIL CLOSED ON MISCONFIGURATION. An unset, empty or implausibly short
 *     `PROVISIONING_API_TOKEN` refuses EVERY caller. "No secret configured"
 *     must never collapse into "no authentication required" — that is the
 *     single most common way an endpoint like this ships wide open, and it
 *     ships open on the day someone forgets an env var in a new environment.
 *
 *  2. CONSTANT-TIME COMPARISON. `===` on a secret is a timing oracle that
 *     leaks the shared secret one byte at a time. Both sides are hashed to a
 *     fixed 32-byte digest first and compared with `timingSafeEqual`, so the
 *     comparison has no length-dependent branch AT ALL — stricter than the
 *     length-equalising dance in `@/lib/auth/email-link/token`'s `safeEqual`,
 *     which has to preserve the caller's raw strings.
 *
 *  3. THE TOKEN IS NEVER ECHOED. Not into logs, not into errors, not into
 *     responses. Nothing in this module stringifies either side, and the
 *     reason codes below are for server-side logging only — the route maps
 *     every one of them to the same opaque 401.
 */

export type ProvisioningAuthFailure =
  /** Env var unset, empty, or whitespace only. */
  | 'not-configured'
  /** Configured but shorter than {@link MIN_PROVISIONING_TOKEN_LENGTH}. */
  | 'weak-secret'
  /** No usable `Authorization: Bearer …` header on the request. */
  | 'missing'
  /** A bearer token was presented and did not match. */
  | 'invalid'

export type ProvisioningAuthResult =
  { ok: true } | { ok: false; reason: ProvisioningAuthFailure }

/**
 * The configured secret, or `null` when it is absent in any form. Read lazily
 * (never at module load) so a missing value is an error at USE time rather than
 * a boot-time crash of every route that transitively imports this file.
 */
function configuredSecret(): string | null {
  const raw = process.env[PROVISIONING_TOKEN_ENV]
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * The token from an `Authorization: Bearer <token>` header, or `null`.
 * The scheme is matched case-insensitively (RFC 7235 says it is
 * case-insensitive); the token itself is compared exactly, after trimming the
 * surrounding whitespace an env-var round-trip tends to add.
 */
function presentedToken(headers: {
  get(name: string): string | null
}): string | null {
  const header = headers.get('authorization')
  if (!header) return null
  const match = /^bearer\s+(.+)$/i.exec(header.trim())
  const token = match?.[1]?.trim()
  return token ? token : null
}

/**
 * Constant-time secret comparison.
 *
 * Hashing both sides to a fixed-width digest before `timingSafeEqual` removes
 * the length check entirely: a wrong-length guess and a wrong-value guess are
 * indistinguishable, so neither the secret's length nor its bytes leak.
 */
function secretsMatch(presented: string, expected: string): boolean {
  const a = createHash('sha256').update(presented, 'utf8').digest()
  const b = createHash('sha256').update(expected, 'utf8').digest()
  return timingSafeEqual(a, b)
}

/**
 * Authenticate a provisioning request. Callers MUST branch on `ok` only —
 * surfacing the `reason` to the client would tell an attacker whether the
 * endpoint is configured and whether their token shape was accepted.
 */
export function authenticateProvisioningRequest(headers: {
  get(name: string): string | null
}): ProvisioningAuthResult {
  const expected = configuredSecret()
  if (expected === null) return { ok: false, reason: 'not-configured' }
  if (expected.length < MIN_PROVISIONING_TOKEN_LENGTH) {
    return { ok: false, reason: 'weak-secret' }
  }

  const presented = presentedToken(headers)
  if (presented === null) return { ok: false, reason: 'missing' }
  if (!secretsMatch(presented, expected)) {
    return { ok: false, reason: 'invalid' }
  }
  return { ok: true }
}
