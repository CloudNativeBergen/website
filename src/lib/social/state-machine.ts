import type { PublishOutcome } from './provider/types'
import type { PublishAttempt, PublishResult, VariantStatus } from './types'

/**
 * The variant state machine as PURE decisions. The store (`sanity.ts`) applies
 * them; the engine (`publish-engine.ts`) sequences them. Nothing here touches IO.
 */

const TRANSITIONS: Record<VariantStatus, readonly VariantStatus[]> = {
  draft: ['scheduled'],
  // `draft` from `scheduled` is the organizer pulling a post back.
  scheduled: ['publishing', 'awaiting-manual', 'draft'],
  // A claim ends in success, terminal failure, or a re-queue with backoff.
  publishing: ['published', 'failed', 'scheduled'],
  'awaiting-manual': ['published'],
  published: [],
  // Retrying a failed variant is the organizer re-entering `scheduled`.
  failed: ['scheduled'],
}

export function canTransition(from: VariantStatus, to: VariantStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

/**
 * The subset an ORGANIZER may drive by hand. `publishing` is excluded on both
 * sides: a live claim belongs to the cron tick holding it, and its re-queue
 * (`publishing → scheduled`) is the engine's backoff, not a user action. A
 * stuck claim must surface as `failed` (the stale sweep) before a retry.
 */
const ORGANIZER_TRANSITIONS: Record<VariantStatus, readonly VariantStatus[]> = {
  draft: ['scheduled'],
  scheduled: ['draft'],
  publishing: [],
  'awaiting-manual': ['published'],
  published: [],
  failed: ['scheduled'],
}

export function canOrganizerTransition(
  from: VariantStatus,
  to: VariantStatus,
): boolean {
  return ORGANIZER_TRANSITIONS[from].includes(to)
}

/** Orchestrator retry policy (#788): 3 attempts, backoff 5 → 15 → 45 minutes. */
export const MAX_PUBLISH_ATTEMPTS = 3
export const RETRY_BACKOFF_MINUTES = [5, 15, 45] as const

/**
 * A `publishing` claim older than this belongs to a tick that died. It surfaces
 * as `failed` and is NEVER re-posted: we cannot know whether the platform call
 * went through. Vercel functions cap well under this.
 */
export const STALE_CLAIM_MINUTES = 15

export type PublishDecision =
  | { status: 'published'; publishResult: PublishResult }
  | { status: 'scheduled'; scheduledAt: string }
  | { status: 'failed' }

/**
 * Where a variant goes after one publish attempt. `attempts` INCLUDES the
 * attempt whose outcome is being decided, so its length is the attempt count.
 */
export function decideAfterPublish(
  outcome: PublishOutcome,
  attempts: readonly PublishAttempt[],
  now: Date,
): PublishDecision {
  if (outcome.ok) {
    return {
      status: 'published',
      publishResult: { externalId: outcome.externalId, url: outcome.url },
    }
  }

  const retryable =
    outcome.kind === 'transient' || outcome.kind === 'rate-limited'
  if (!retryable || attempts.length >= MAX_PUBLISH_ATTEMPTS) {
    return { status: 'failed' }
  }

  const backoffMinutes =
    RETRY_BACKOFF_MINUTES[
      Math.min(attempts.length, RETRY_BACKOFF_MINUTES.length) - 1
    ]
  const backoffAt = now.getTime() + backoffMinutes * 60_000
  const retryAt = Math.max(backoffAt, outcome.retryAfter?.getTime() ?? 0)
  return { status: 'scheduled', scheduledAt: new Date(retryAt).toISOString() }
}

export function isStaleClaim(claimedAt: string | null, now: Date): boolean {
  if (!claimedAt) return true
  const claimed = new Date(claimedAt).getTime()
  if (Number.isNaN(claimed)) return true
  return now.getTime() - claimed > STALE_CLAIM_MINUTES * 60_000
}
