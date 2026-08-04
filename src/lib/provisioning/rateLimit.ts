import { createHash } from 'crypto'
import {
  deleteExpiredRateLimitBuckets,
  hitRateLimitBucket,
  type RateLimitRule,
} from '@/lib/rate-limit'
import {
  INVALIDATION_ATTEMPT_RULES,
  INVALIDATION_RULES,
  PROVISIONING_ATTEMPT_RULES,
  PROVISIONING_CREATE_RULES,
  PROVISIONING_RATE_LIMIT_TYPE,
} from './constants'

/**
 * RATE LIMITING for the machine API kontroll calls.
 *
 * FOUR buckets in two matching pairs — one pair per endpoint, each charged at
 * the same two points in its route:
 *
 *  - `attempt` / `invalidate-attempt`, keyed by client IP, charged BEFORE the
 *    token is checked. This is what bounds brute-forcing the shared secret.
 *  - `create` / `invalidate`, ONE global bucket each, charged AFTER
 *    authentication and before the effect. This is what bounds bulk tenant
 *    minting — and bulk cache dropping — if the secret leaks; neither is keyed
 *    on anything the caller controls.
 *
 * The two endpoints share the SECRET but not the BUDGET: separate scopes mean
 * separate documents, so frequent invalidation traffic can never crowd out the
 * rare, far more dangerous provisioning call (see the rules in `constants.ts`).
 *
 * FAIL CLOSED IN BOTH DIRECTIONS, unlike the email sign-in limiter. That one
 * fails open on a read outage because locking everybody out of sign-in is worse
 * than an absent cap. Here the guarded operations are rare and their denial is
 * cheap — a retried provisioning call, or a cached entry that revalidates on
 * its own within the hour — while proceeding uncapped would leave them unmetered
 * exactly when the platform is already unhealthy.
 */

/**
 * A salted, non-reversible bucket id. The subject (a client IP) is never
 * written to the content lake — only this digest, which is the document id.
 * Mirrors `@/lib/auth/email-link/token`'s `rateLimitKey`.
 */
function bucketId(scope: string, subject: string): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('AUTH_SECRET is not set; provisioning limits cannot bucket')
  }
  const digest = createHash('sha256')
    .update(`konf.provisioning.rate.v1|${scope}|${subject}|${secret}`)
    .digest('hex')
  return `provisioningRate.${digest}`
}

/** The four counter families. The scope is part of the bucket-id digest, so
 * each one gets its own document even for the same subject. */
type BucketScope = 'attempt' | 'create' | 'invalidate-attempt' | 'invalidate'

const RULES_BY_SCOPE: Record<BucketScope, readonly RateLimitRule[]> = {
  attempt: PROVISIONING_ATTEMPT_RULES,
  create: PROVISIONING_CREATE_RULES,
  'invalidate-attempt': INVALIDATION_ATTEMPT_RULES,
  invalidate: INVALIDATION_RULES,
}

async function hit(
  scope: BucketScope,
  subject: string,
  now: number,
): Promise<boolean> {
  let id: string
  try {
    id = bucketId(scope, subject)
  } catch {
    // Without the salt there is no durable bucket, so there is no limit —
    // refuse rather than provision unmetered.
    return false
  }

  return hitRateLimitBucket({
    type: PROVISIONING_RATE_LIMIT_TYPE,
    id,
    scope,
    rules: RULES_BY_SCOPE[scope],
    now,
    label: '[provisioning]',
    onReadFailure: 'deny',
  })
}

/**
 * Charge the pre-auth attempt bucket for one request.
 *
 * A missing/unparseable client IP charges a shared `unknown` bucket rather than
 * skipping the limit: unlike sign-in (where the address bucket is the real
 * protection and a spoofable header must not lock anyone out), this endpoint
 * has no other pre-auth subject, so "no IP" must still be metered.
 */
export async function chargeProvisioningAttempt(
  clientIp: string | undefined,
  now: number = Date.now(),
): Promise<boolean> {
  return hit('attempt', clientIp?.trim() || 'unknown', now)
}

/** Charge the single global creation bucket. */
export async function chargeProvisioningCreate(
  now: number = Date.now(),
): Promise<boolean> {
  return hit('create', 'global', now)
}

/**
 * Charge the pre-auth attempt bucket for one CACHE-INVALIDATION request. Same
 * posture as {@link chargeProvisioningAttempt} — a missing IP charges a shared
 * `unknown` bucket rather than skipping the meter — on its own counter family.
 */
export async function chargeInvalidationAttempt(
  clientIp: string | undefined,
  now: number = Date.now(),
): Promise<boolean> {
  return hit('invalidate-attempt', clientIp?.trim() || 'unknown', now)
}

/** Charge the single global cache-invalidation bucket. */
export async function chargeInvalidation(
  now: number = Date.now(),
): Promise<boolean> {
  return hit('invalidate', 'global', now)
}

/** Delete provisioning buckets whose longest window has fully elapsed. */
export async function deleteExpiredProvisioningRateLimits(
  now: number = Date.now(),
): Promise<{ deleted: number }> {
  return deleteExpiredRateLimitBuckets(
    PROVISIONING_RATE_LIMIT_TYPE,
    '[provisioning]',
    now,
  )
}
