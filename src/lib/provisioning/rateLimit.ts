import { createHash } from 'crypto'
import {
  deleteExpiredRateLimitBuckets,
  hitRateLimitBucket,
} from '@/lib/rate-limit'
import {
  PROVISIONING_ATTEMPT_RULES,
  PROVISIONING_CREATE_RULES,
  PROVISIONING_RATE_LIMIT_TYPE,
} from './constants'

/**
 * RATE LIMITING for the machine provisioning API.
 *
 * Two buckets, charged at different points in the route (see
 * `src/app/api/provisioning/organizations/route.ts`):
 *
 *  - `attempt`, keyed by client IP, charged BEFORE the token is checked. This
 *    is what bounds brute-forcing the shared secret.
 *  - `create`, ONE global bucket, charged AFTER authentication and before the
 *    write. This is what bounds bulk tenant minting if the secret leaks — it is
 *    deliberately not keyed on anything the caller controls.
 *
 * FAIL CLOSED IN BOTH DIRECTIONS, unlike the email sign-in limiter. That one
 * fails open on a read outage because locking everybody out of sign-in is worse
 * than an absent cap. Here the guarded operation is a rare privileged write, so
 * refusing it during a store outage costs a retry and nothing else — while
 * proceeding uncapped would leave tenant creation unmetered exactly when the
 * platform is already unhealthy.
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

async function hit(
  scope: 'attempt' | 'create',
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
    rules:
      scope === 'attempt'
        ? PROVISIONING_ATTEMPT_RULES
        : PROVISIONING_CREATE_RULES,
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
