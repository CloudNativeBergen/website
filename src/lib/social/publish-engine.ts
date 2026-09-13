import type {
  PublishInput,
  PublishOutcome,
  SocialPublishAdapter,
} from './provider/types'
import {
  decideAfterPublish,
  isStaleClaim,
  STALE_CLAIM_MINUTES,
} from './state-machine'
import type { SocialVariantStore } from './store'
import type { PublishAttempt, SocialPostVariant } from './types'

/**
 * Which adapter publishes a variant, or `null` when the variant is MANUAL —
 * derived at claim time, never stored (#788). The request boundary
 * (`provider/index.ts`) assembles credentials; the engine only asks.
 */
export type AdapterResolver = (
  variant: SocialPostVariant,
) => Promise<SocialPublishAdapter | null>

export interface PublishTickOptions {
  store: SocialVariantStore
  resolveAdapter: AdapterResolver
  now?: Date
  /** Upper bound on due variants handled per tick. */
  limit?: number
}

export interface PublishTickSummary {
  due: number
  /** Another tick claimed it first (Vercel may fire a cron twice). */
  lostRace: number
  published: number
  awaitingManual: number
  /** Transient/rate-limited: back to `scheduled` with backoff. */
  requeued: number
  failed: number
  /** Stale `publishing` claims surfaced as failed. */
  staleFailed: number
  errors: string[]
}

export const DEFAULT_TICK_LIMIT = 50

/**
 * One reconciliation tick (#785): surface stale claims, then claim and dispatch
 * every due variant. Each variant is isolated in its own try/catch so one bad
 * document cannot stall the queue; the tick itself never throws.
 */
export async function runPublishTick(
  options: PublishTickOptions,
): Promise<PublishTickSummary> {
  const { store, resolveAdapter } = options
  const now = options.now ?? new Date()
  const limit = options.limit ?? DEFAULT_TICK_LIMIT
  const summary: PublishTickSummary = {
    due: 0,
    lostRace: 0,
    published: 0,
    awaitingManual: 0,
    requeued: 0,
    failed: 0,
    staleFailed: 0,
    errors: [],
  }

  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MINUTES * 60_000)
  const { due, stale } = await store.findWork(now, staleBefore, limit)
  await failStaleClaims(stale, store, now, summary)
  summary.due = due.length

  for (const variant of due) {
    try {
      await dispatch(variant, store, resolveAdapter, now, summary)
    } catch (error) {
      summary.errors.push(
        `${variant._id}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  return summary
}

/**
 * A `publishing` claim past {@link isStaleClaim} belongs to a tick that died
 * mid-publish. We cannot know whether the platform call went through, so it is
 * FAILED — never re-queued — and the organizer checks the platform by hand.
 * CAS on the revision we read: a tick that is legitimately finishing right now
 * wins, and we leave its result alone.
 */
async function failStaleClaims(
  stale: SocialPostVariant[],
  store: SocialVariantStore,
  now: Date,
  summary: PublishTickSummary,
) {
  for (const variant of stale) {
    if (!isStaleClaim(variant.claimedAt, now)) continue
    try {
      const landed = await store.transition(
        variant._id,
        {
          status: 'failed',
          claimedAt: null,
          attempt: {
            at: now.toISOString(),
            outcome: 'stale-claim',
            error: `Publishing claim from ${variant.claimedAt ?? 'unknown'} never completed. Check the platform before retrying.`,
          },
        },
        { ifRevision: variant._rev },
      )
      if (landed) summary.staleFailed++
    } catch (error) {
      summary.errors.push(
        `${variant._id}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

async function dispatch(
  variant: SocialPostVariant,
  store: SocialVariantStore,
  resolveAdapter: AdapterResolver,
  now: Date,
  summary: PublishTickSummary,
) {
  const claimed = await store.claim(variant, now)
  if (!claimed) {
    summary.lostRace++
    return
  }

  const adapter = await resolveAdapter(claimed)
  if (!adapter) {
    await store.transition(claimed._id, {
      status: 'awaiting-manual',
      claimedAt: null,
    })
    summary.awaitingManual++
    return
  }

  const input = publishInputFor(claimed)
  const outcome = await attemptPublish(adapter, input)
  const attempt: Omit<PublishAttempt, '_key'> = outcome.ok
    ? { at: now.toISOString(), outcome: 'published' }
    : { at: now.toISOString(), outcome: outcome.kind, error: outcome.message }
  const attemptCount = claimed.attemptCount + 1
  const decision = decideAfterPublish(outcome, attemptCount, now)

  switch (decision.status) {
    case 'published':
      await store.transition(claimed._id, {
        status: 'published',
        claimedAt: null,
        attemptCount,
        publishResult: decision.publishResult,
        attempt,
      })
      summary.published++
      return
    case 'scheduled':
      // The backoff time is the ENGINE's override: flag it custom so an
      // organizer editing the post's default time does not pull the retry
      // back to the original slot.
      await store.transition(claimed._id, {
        status: 'scheduled',
        claimedAt: null,
        scheduledAt: decision.scheduledAt,
        usesCustomTime: true,
        attemptCount,
        attempt,
      })
      summary.requeued++
      return
    case 'failed':
      await store.transition(claimed._id, {
        status: 'failed',
        claimedAt: null,
        attemptCount,
        attempt,
      })
      summary.failed++
      return
  }
}

function publishInputFor(variant: SocialPostVariant): PublishInput {
  // Media renditions arrive with the rendition pipeline (#789, spec §9 step 2).
  return {
    text: variant.body,
    media: [],
    link: variant.link ?? undefined,
  }
}

/**
 * Validate defensively, then publish. An adapter that THROWS has broken its
 * contract (typed outcomes are the API), and since we cannot tell whether the
 * post was created the outcome is `ambiguous` — never a retry.
 */
async function attemptPublish(
  adapter: SocialPublishAdapter,
  input: PublishInput,
): Promise<PublishOutcome> {
  const issues = adapter.validate(input)
  if (issues.length > 0) {
    return {
      ok: false,
      kind: 'rejected',
      message: issues
        .map((issue) => `${issue.field}: ${issue.message}`)
        .join('; '),
    }
  }
  try {
    return await adapter.publish(input)
  } catch (error) {
    return {
      ok: false,
      kind: 'ambiguous',
      message: `Adapter threw: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
