import type { RateLimitRule } from '@/lib/rate-limit'

/**
 * MACHINE API — shared constants (#753, RunKonf/platform#36).
 *
 * The control panel (`RunKonf/kontroll`, my.konf.app) is not a signed-in
 * platform operator, so it cannot use the concierge tRPC surface. It
 * authenticates with a shared bearer secret instead and reaches the SAME
 * tenant-creation transaction (`@/lib/onboarding/provision`).
 *
 * It is now TWO endpoints, not one: kontroll also WRITES `organization`
 * documents with its own Sanity token, and must be able to bust this app's
 * caches afterwards (RunKonf/platform#36). Both live behind the same bearer
 * secret and the same durable limiter, so their constants live together here.
 */

/** Env var holding the shared bearer secret. Unset ⇒ the endpoints are CLOSED. */
export const PROVISIONING_TOKEN_ENV = 'PROVISIONING_API_TOKEN'

/**
 * Shortest secret we will honour. A short shared secret is brute-forceable
 * within the rate limits, so a too-short value is treated exactly like an unset
 * one: the endpoint refuses everybody. Sized for 32 random hex/base64 chars.
 */
export const MIN_PROVISIONING_TOKEN_LENGTH = 32

/** Sanity document types owned by this feature. */
export const PROVISIONING_REQUEST_TYPE = 'provisioningRequest'
export const PROVISIONING_RATE_LIMIT_TYPE = 'provisioningRateLimit'

/**
 * How long a completed request's idempotency receipt is honoured. Well past any
 * realistic retry (kontroll retries within seconds, a human re-runs within
 * hours); after this the record is purged by the daily cleanup cron and the
 * same key would provision again.
 */
export const PROVISIONING_RECEIPT_RETENTION_DAYS = 30

/** Bounds on the caller-supplied `Idempotency-Key`. */
export const MIN_IDEMPOTENCY_KEY_LENGTH = 16
export const MAX_IDEMPOTENCY_KEY_LENGTH = 200

/**
 * ATTEMPT limit, bucketed by client IP and charged on EVERY request — including
 * unauthenticated ones, BEFORE the token is checked. This is the bound on
 * brute-forcing the shared secret; it is deliberately the first thing the route
 * does.
 */
export const PROVISIONING_ATTEMPT_RULES: readonly RateLimitRule[] = [
  { windowSeconds: 60, max: 10 },
  { windowSeconds: 60 * 60, max: 60 },
  { windowSeconds: 24 * 60 * 60, max: 300 },
]

/**
 * CREATION limit, charged only AFTER authentication, on a single GLOBAL bucket.
 *
 * Global — not per-IP — precisely because the IP is a spoofable header: if the
 * shared secret leaks, this is the cap that stops an attacker minting tenants
 * in bulk, and it must not be evadable by rotating `x-forwarded-for`. Sized far
 * above any real onboarding rate; a legitimate operator never sees it.
 */
export const PROVISIONING_CREATE_RULES: readonly RateLimitRule[] = [
  { windowSeconds: 60, max: 5 },
  { windowSeconds: 60 * 60, max: 30 },
  { windowSeconds: 24 * 60 * 60, max: 100 },
]

/**
 * ATTEMPT limit for the CACHE-INVALIDATION endpoint, bucketed by client IP and
 * charged BEFORE the token is checked — the same pre-auth meter provisioning
 * uses, on its OWN buckets.
 *
 * Separate from {@link PROVISIONING_ATTEMPT_RULES} on purpose. Invalidation is
 * the frequent call (every organizer edit in kontroll) and provisioning is the
 * rare one; sharing a bucket would let a busy afternoon of settings edits eat
 * the budget that keeps tenant creation reachable, and would force the rarer,
 * far more dangerous endpoint to run at the looser cap. Two families, sized for
 * what each actually does.
 */
export const INVALIDATION_ATTEMPT_RULES: readonly RateLimitRule[] = [
  { windowSeconds: 60, max: 60 },
  { windowSeconds: 60 * 60, max: 600 },
  { windowSeconds: 24 * 60 * 60, max: 3000 },
]

/**
 * INVALIDATION limit, charged only AFTER authentication, on a single GLOBAL
 * bucket — global for the same reason creation is: `x-forwarded-for` is
 * caller-controlled, so a per-IP cap on a post-auth operation is evadable by
 * rotating a header.
 *
 * THIS IS THE ANTI-STAMPEDE BOUND, together with `MAX_INVALIDATION_TARGETS`
 * (`@/lib/cache/invalidation`): at most 60 calls a minute × 20 targets a call =
 * 1200 tag revalidations a minute, platform-wide, no matter what the caller
 * sends. Without both halves a holder of the secret could drop every tenant's
 * cached reads in a loop and turn the site into an uncached passthrough to
 * Sanity.
 *
 * When it DOES trip, the cost is bounded and self-healing: the caller gets a
 * 429, and the entry it wanted to bust still revalidates on its own within the
 * hour (`cacheLife('hours')`). Staleness, never an outage.
 */
export const INVALIDATION_RULES: readonly RateLimitRule[] = [
  { windowSeconds: 60, max: 60 },
  { windowSeconds: 60 * 60, max: 600 },
  { windowSeconds: 24 * 60 * 60, max: 5000 },
]
