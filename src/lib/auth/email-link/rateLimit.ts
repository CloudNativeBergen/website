import {
  deleteExpiredRateLimitBuckets,
  hitRateLimitBucket,
  type RateLimitRule,
} from '@/lib/rate-limit'
import {
  EMAIL_RATE_LIMIT_RULES,
  EMAIL_SIGN_IN_RATE_LIMIT_TYPE,
  IP_RATE_LIMIT_RULES,
} from './constants'
import { rateLimitKey } from './token'

/**
 * RATE LIMITING for email sign-in link requests.
 *
 * The counter mechanics (durable Sanity buckets, revision-conditioned CAS,
 * rolling windows) live in `@/lib/rate-limit` — this module is the email-link
 * POLICY on top of them: which subjects are bucketed, in which order, and which
 * failure direction each outage takes.
 *
 * WHAT IS AT REST: a salted hash of the subject (as the document id), the
 * scope, and the hit timestamps. No address and no IP is ever written.
 *
 * FAIL-OPEN ON READ FAILURE, deliberately: this limiter guards a convenience
 * (how often a link may be requested), and a Sanity outage must not make
 * sign-in impossible for everybody. The controls that must fail CLOSED — token
 * verification, single use, origin binding — are elsewhere and do.
 *
 * FAIL-CLOSED ON WRITE FAILURE, equally deliberately: a bucket whose hits are
 * never persisted is not a limit, it is an unbounded mail cannon. The asymmetry
 * is the point — a read outage costs an attacker nothing (the cap is simply
 * absent either way), a write outage would hand them the whole mailbox.
 */
async function hitBucket(
  scope: 'email' | 'ip',
  subject: string,
  rules: readonly RateLimitRule[],
  now: number,
): Promise<boolean> {
  let id: string
  try {
    id = rateLimitKey(scope, subject)
  } catch {
    // AUTH_SECRET missing — the caller cannot mint a token either.
    return false
  }

  return hitRateLimitBucket({
    type: EMAIL_SIGN_IN_RATE_LIMIT_TYPE,
    id,
    scope,
    rules,
    now,
    label: '[email-link]',
    onReadFailure: 'allow',
  })
}

/**
 * Apply BOTH the per-address and the per-IP limits.
 *
 * The address bucket is charged FIRST and, when it denies, the IP bucket is not
 * charged at all — otherwise one address hammering the endpoint would exhaust
 * the shared IP budget of everyone behind the same NAT.
 *
 * A missing/unparseable client IP charges only the address bucket. Trusting a
 * spoofable header to LOCK PEOPLE OUT would be the wrong failure direction; the
 * address limit is the one that actually protects a targeted mailbox.
 */
export async function checkEmailLinkRateLimit(params: {
  normalizedEmail: string
  clientIp?: string | null
  now?: number
}): Promise<{ allowed: boolean; scope?: 'email' | 'ip' }> {
  const now = params.now ?? Date.now()

  if (
    !(await hitBucket(
      'email',
      params.normalizedEmail,
      EMAIL_RATE_LIMIT_RULES,
      now,
    ))
  ) {
    return { allowed: false, scope: 'email' }
  }

  const ip = params.clientIp?.trim()
  if (ip) {
    if (!(await hitBucket('ip', ip, IP_RATE_LIMIT_RULES, now))) {
      return { allowed: false, scope: 'ip' }
    }
  }

  return { allowed: true }
}

/** Delete rate-limit buckets whose longest window has fully elapsed. */
export async function deleteExpiredEmailSignInRateLimits(
  now: number = Date.now(),
): Promise<{ deleted: number }> {
  return deleteExpiredRateLimitBuckets(
    EMAIL_SIGN_IN_RATE_LIMIT_TYPE,
    '[email-link]',
    now,
  )
}

export { clientIpFromHeaders } from '@/lib/rate-limit'
