import type { ConfirmCheck, PublishOutcome } from './provider/types'
import type {
  AttemptOutcome,
  PublishAttempt,
  PublishResult,
  VariantStatus,
  VariantSubmission,
} from './types'

/**
 * The variant state machine as PURE decisions. The store (`sanity.ts`) applies
 * them; the engine (`publish-engine.ts`) sequences them. Nothing here touches IO.
 */

const TRANSITIONS: Record<VariantStatus, readonly VariantStatus[]> = {
  draft: ['scheduled'],
  // `draft` from `scheduled` is the organizer pulling a post back before
  // the cron takes it (spec §3.2: rescheduling edits the variant's time).
  scheduled: ['publishing', 'awaiting-manual', 'draft'],
  // A claim ends in success, terminal failure, a re-queue with backoff, or —
  // when the claim reveals no adapter — the manual queue. The claim comes
  // first so two ticks can never both hand the same variant to an organizer.
  // `submitted` is the asynchronous fourth ending (#1128): the vendor took the
  // post and will send it later.
  publishing: [
    'published',
    'failed',
    'scheduled',
    'awaiting-manual',
    'submitted',
  ],
  // Only the confirm sweep settles a submission, and only into a terminal
  // state: re-queueing it would be a second post of something already accepted.
  submitted: ['published', 'failed'],
  'awaiting-manual': ['published'],
  published: [],
  // Retrying a failed variant is the organizer re-entering `scheduled`.
  // `failed → published` is the manual fallback (#1128, spec §5): a vendor
  // error or an `ambiguous` post that did go out, recorded by hand.
  failed: ['scheduled', 'published'],
}

export function canTransition(from: VariantStatus, to: VariantStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

/**
 * The subset an ORGANIZER may drive by hand. `publishing` is excluded on both
 * sides: a live claim belongs to the cron tick holding it, and its re-queue
 * (`publishing → scheduled`) is the engine's backoff, not a user action. A
 * stuck claim must surface as `failed` (the stale sweep) before a retry.
 * `submitted` is excluded for the same reason: the vendor holds the post and
 * only the confirm sweep (or its timeout) may settle it.
 */
const ORGANIZER_TRANSITIONS: Record<VariantStatus, readonly VariantStatus[]> = {
  draft: ['scheduled'],
  scheduled: ['draft'],
  publishing: [],
  submitted: [],
  'awaiting-manual': ['published'],
  // `published → published` exists for ONE case: an asynchronous confirmation
  // that named the post without a URL (#1128). `ConfirmCheck.published`
  // carries `url` optionally — a vendor may confirm a post it cannot link —
  // and the post IS live, so calling it anything but `published` would
  // misstate it. But a publishing Task reads `publishResult.url` to know it
  // is done, and without one the Task stays outstanding forever with no
  // affordance to enter the address.
  //
  // `social.markPosted` therefore accepts a published variant that has NO
  // url, and refuses one that already has a good one — the router enforces
  // that half, since the state machine cannot see the URL.
  published: ['published'],

  // `social.markPosted` (#1128): the manual fallback for a failed or
  // ambiguous post. Same required URL, same `manual` attempt.
  failed: ['scheduled', 'published'],
}

export function canOrganizerTransition(
  from: VariantStatus,
  to: VariantStatus,
): boolean {
  return ORGANIZER_TRANSITIONS[from].includes(to)
}

/**
 * Orchestrator retry policy (#788): at most 3 attempts per scheduling cycle.
 * #788 lists the backoff as 5 → 15 → 45 minutes; with a 3-attempt cap only
 * two re-queues ever happen, so the 45-minute step would need a fourth attempt
 * and is deliberately not listed here.
 */
export const MAX_PUBLISH_ATTEMPTS = 3
export const RETRY_BACKOFF_MINUTES = [5, 15] as const

/**
 * A `publishing` claim older than this belongs to a tick that died. It surfaces
 * as `failed` and is NEVER re-posted: we cannot know whether the platform call
 * went through. Vercel functions cap well under this.
 */
export const STALE_CLAIM_MINUTES = 15

/**
 * How long a submission may stay unresolved before the sweep gives up on it
 * (spec §3.2, from the spike: the create call took 10.9 s and the post was
 * `sent` 22 s later). Past this it is `failed` as `ambiguous` and NEVER
 * re-posted: we cannot know whether the vendor sent it.
 */
export const CONFIRM_TIMEOUT_MINUTES = 15

export type PublishDecision =
  | { status: 'published'; publishResult: PublishResult }
  | { status: 'submitted'; submission: VariantSubmission }
  | { status: 'scheduled'; scheduledAt: string }
  | { status: 'failed' }

/** Where a submitted variant goes after ONE read of the vendor's post. */
export type ConfirmDecision =
  | { status: 'published'; publishResult: PublishResult }
  | {
      status: 'failed'
      outcome: Extract<AttemptOutcome, 'rejected' | 'ambiguous'>
      message: string
    }
  | { status: 'pending' }

/**
 * Where a variant goes after one publish attempt. `attemptCount` INCLUDES the
 * attempt whose outcome is being decided (1 on the first try).
 */
export function decideAfterPublish(
  outcome: PublishOutcome,
  attemptCount: number,
  now: Date,
): PublishDecision {
  if (outcome.ok) {
    if (outcome.result === 'accepted') {
      // The vendor holds the post; the claim is released and the confirm
      // sweep owns it from here. Acceptance is never retried, so the attempt
      // cap does not apply to it.
      return {
        status: 'submitted',
        submission: {
          vendorPostId: outcome.vendorPostId,
          submittedAt: now.toISOString(),
          lastCheckedAt: null,
        },
      }
    }
    return {
      status: 'published',
      publishResult: { externalId: outcome.externalId, url: outcome.url },
    }
  }

  const retryable =
    outcome.kind === 'transient' || outcome.kind === 'rate-limited'
  if (!retryable || attemptCount >= MAX_PUBLISH_ATTEMPTS) {
    return { status: 'failed' }
  }

  const backoffMinutes =
    RETRY_BACKOFF_MINUTES[
      Math.min(attemptCount, RETRY_BACKOFF_MINUTES.length) - 1
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

/**
 * Where a submitted variant goes after one confirm read (#1128, spec §3.2).
 * A SETTLED answer always wins, timeout or not: the vendor telling us the post
 * is live is better evidence than the clock. Nothing here re-queues — a post
 * the vendor accepted must never be sent twice.
 */
export function decideAfterConfirm(
  check: ConfirmCheck,
  submittedAt: string | null,
  now: Date,
): ConfirmDecision {
  switch (check.state) {
    case 'published':
      return {
        status: 'published',
        publishResult: { externalId: check.externalId, url: check.url },
      }
    case 'failed':
      // The vendor's error is free text and it may retry on its own, so this
      // is terminal (spec §3.3, "Decided"). The organizer reschedules or
      // posts by hand.
      return { status: 'failed', outcome: 'rejected', message: check.message }
    case 'gone':
      // Deleted in the vendor's UI, or never really created. It may have gone
      // out before it vanished, so it is AMBIGUOUS, not a refusal.
      return {
        status: 'failed',
        outcome: 'ambiguous',
        message:
          'The post is gone from the publisher before it was confirmed. Check the platform before posting again.',
      }
    case 'pending':
    case 'unreadable':
      if (!isConfirmTimedOut(submittedAt, now)) return { status: 'pending' }
      return {
        status: 'failed',
        outcome: 'ambiguous',
        message: `The publisher did not confirm the post within ${CONFIRM_TIMEOUT_MINUTES} minutes${
          check.state === 'unreadable' ? ` (last error: ${check.message})` : ''
        }. Check the platform before posting again.`,
      }
  }
}

/**
 * How long to wait before the NEXT confirm read, by how old the submission is.
 * The first read is ~30 s after the submit (the spike saw `sent` at 22 s);
 * after that it backs off, because every read spends Buffer's 100-per-15-min
 * budget and the sweep shares the tick with dispatch.
 */
export function confirmIntervalMs(ageMs: number): number {
  if (ageMs < 2 * 60_000) return 30_000
  if (ageMs < 5 * 60_000) return 60_000
  return 120_000
}

/** Whether this submission has waited long enough to be read again. */
export function isConfirmDue(
  submission: VariantSubmission,
  now: Date,
): boolean {
  const submitted = Date.parse(submission.submittedAt)
  // An unknowable submission is read (and, below, timed out) at once rather
  // than left in flight forever.
  if (Number.isNaN(submitted)) return true
  const last = submission.lastCheckedAt
    ? Date.parse(submission.lastCheckedAt)
    : Number.NaN
  const since = Number.isNaN(last) ? submitted : last
  return now.getTime() - since >= confirmIntervalMs(now.getTime() - submitted)
}

/** Past {@link CONFIRM_TIMEOUT_MINUTES}, or with no readable submit time. */
export function isConfirmTimedOut(
  submittedAt: string | null,
  now: Date,
): boolean {
  if (!submittedAt) return true
  const submitted = Date.parse(submittedAt)
  if (Number.isNaN(submitted)) return true
  return now.getTime() - submitted > CONFIRM_TIMEOUT_MINUTES * 60_000
}

/**
 * Outcomes after which THE POST MAY ALREADY BE LIVE, so nothing may tell an
 * organizer to publish it again without checking first.
 *
 * Two ways to end up here, and neither can be distinguished from success by
 * looking at our own records:
 *
 * - `ambiguous` — the create call threw or timed out, the confirm sweep ran
 *   out of time, or the vendor record was gone. `CreatePostInput` carries no
 *   idempotency key, so a retry is a second post, not the same one.
 * - `stale-claim` — a cron claimed the variant and died. If it died AFTER the
 *   platform accepted the post but before the result was saved, the post is
 *   live and we have no record of it. The sweep's own error text already says
 *   "Check the platform before retrying."
 *
 * Every other failure outcome means nothing was created, and those keep the
 * ordinary "post it by hand" and "retry" affordances — a warning shown on all
 * failures would be noise rather than a statement about this one.
 */
export const MAY_BE_LIVE_OUTCOMES = [
  'ambiguous',
  'stale-claim',
] as const satisfies readonly AttemptOutcome[]

/**
 * Whether this variant's LAST attempt left the post possibly live. Reads the
 * last attempt only: an earlier ambiguous attempt that a later one resolved is
 * settled, and it is the outcome the organizer is looking at now that decides
 * what they should be told.
 */
export function mayAlreadyBeLive(variant: {
  status: VariantStatus
  attempts: readonly PublishAttempt[]
}): boolean {
  return outcomeMayBeLive(variant.status, variant.attempts.at(-1)?.outcome)
}

/**
 * The same verdict from a status and the LAST attempt's outcome alone, for
 * readers that project `attempts[-1].outcome` rather than the whole trail
 * (the deletion guards). One rule, however the caller got at the fields.
 */
export function outcomeMayBeLive(
  status: VariantStatus | string,
  lastOutcome: AttemptOutcome | string | null | undefined,
): boolean {
  if (status !== 'failed') return false
  return (
    typeof lastOutcome === 'string' &&
    (MAY_BE_LIVE_OUTCOMES as readonly string[]).includes(lastOutcome)
  )
}
