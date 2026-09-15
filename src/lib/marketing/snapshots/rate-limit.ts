import 'server-only'
import { createHash } from 'node:crypto'
import {
  deleteExpiredRateLimitBuckets,
  hitRateLimitBucket,
  type RateLimitRule,
} from '@/lib/rate-limit'

/**
 * THE BUDGET ON `marketing.refreshSnapshots` (spec §6.4, "rate-limited per
 * conference with the Sanity rate-limit pattern").
 *
 * WHAT IT PROTECTS is cost, not access: every refresh is a PostHog query
 * against a metered quota plus a Bluesky sweep, and the daily cron already
 * keeps the ledger current — the button is for "we just posted, show me now",
 * not for watching a number tick. One bucket PER CONFERENCE, charged after the
 * organizer check, so one edition's impatience never spends another's budget.
 *
 * FAILS CLOSED on a read outage, like the provisioning limiter and unlike the
 * sign-in one: refusing a refresh costs an organizer a few minutes' wait,
 * while an uncapped one during an outage spends a quota that is already the
 * scarce thing.
 */

export const MARKETING_RATE_LIMIT_TYPE = 'marketingRateLimit'

/**
 * Three in ten minutes covers "post, refresh, look again"; twelve a day is
 * comfortably more than a working session needs and far under a quota.
 */
export const SNAPSHOT_REFRESH_RULES: readonly RateLimitRule[] = [
  { windowSeconds: 600, max: 3 },
  { windowSeconds: 86_400, max: 12 },
]

const SCOPE = 'snapshot-refresh'

/**
 * A salted, non-reversible bucket id. Mirrors the provisioning limiter: the
 * subject never reaches the content lake, only this digest — which is already
 * the document id.
 */
function bucketId(conferenceId: string): string | null {
  const secret = process.env.AUTH_SECRET
  if (!secret) return null
  const digest = createHash('sha256')
    .update(`konf.marketing.rate.v1|${SCOPE}|${conferenceId}|${secret}`)
    .digest('hex')
  return `marketingRate.${digest}`
}

/** Charge one refresh against this conference's bucket. */
export async function chargeSnapshotRefresh(
  conferenceId: string,
  now: number = Date.now(),
): Promise<boolean> {
  const id = bucketId(conferenceId)
  // Without the salt there is no durable bucket, so there is no limit —
  // refuse rather than spend the quota unmetered.
  if (!id) return false
  return hitRateLimitBucket({
    type: MARKETING_RATE_LIMIT_TYPE,
    id,
    scope: SCOPE,
    rules: SNAPSHOT_REFRESH_RULES,
    now,
    label: '[marketing]',
    onReadFailure: 'deny',
  })
}

/** Delete marketing buckets whose longest window has fully elapsed. */
export async function deleteExpiredMarketingRateLimits(
  now: number = Date.now(),
): Promise<{ deleted: number }> {
  return deleteExpiredRateLimitBuckets(
    MARKETING_RATE_LIMIT_TYPE,
    '[marketing]',
    now,
  )
}
