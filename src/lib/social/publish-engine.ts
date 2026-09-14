import type {
  PublishInput,
  PublishOutcome,
  SocialPublishAdapter,
  ValidationIssue,
} from './provider/types'
import {
  decideAfterPublish,
  isStaleClaim,
  STALE_CLAIM_MINUTES,
} from './state-machine'
import { resolvePublishMedia } from './media'
import type { PublishableVariant, SocialVariantStore } from './store'
import type { PublishAttempt, SocialPostVariant } from './types'

/**
 * Which adapter publishes a variant, or `null` when the variant is MANUAL —
 * derived at claim time, never stored (#788). The request boundary
 * (`provider/index.ts`) assembles credentials; the engine only asks.
 */
export type AdapterResolver = (
  variant: SocialPostVariant & Pick<PublishableVariant, 'conferenceDomains'>,
) => Promise<SocialPublishAdapter | null>

export interface PublishTickOptions {
  store: SocialVariantStore
  resolveAdapter: AdapterResolver
  now?: Date
  /** Upper bound on due variants handled per tick. */
  limit?: number
  /**
   * When the function running this tick will be killed. No variant is
   * CLAIMED with less than {@link PUBLISH_RESERVE_MS} left: a claim whose
   * publish and settle cannot finish would surface as a stale claim (and a
   * possibly-sent post) a quarter of an hour later. Deferred variants are
   * still `scheduled` and the next tick takes them.
   */
  deadline?: Date
  /** Test seam for {@link ADAPTER_RESOLUTION_TIMEOUT_MS}. */
  resolveTimeoutMs?: number
  /**
   * Called ONCE at the end of the tick with every variant this tick handed
   * to an organizer (`awaiting-manual`, #1006), so the request boundary can
   * notify the assignees in one fan-out. Only variants whose transition
   * LANDED are included: a lost compare-and-set belongs to the tick that
   * won it, which notifies. A throw here is logged in `errors` and never
   * touches the variants.
   */
  onAwaitingManual?: (variants: PublishableVariant[]) => Promise<unknown>
}

export interface PublishTickSummary {
  /** Due variants the store returned before the per-tick limit. */
  candidates: number
  /** Due variants this tick dispatched. */
  due: number
  /** A post-claim write lost to the stale sweep — logged, never re-posted. */
  settleLost: number
  /** Another tick claimed it first (Vercel may fire a cron twice). */
  lostRace: number
  published: number
  awaitingManual: number
  /** Transient/rate-limited: back to `scheduled` with backoff. */
  requeued: number
  failed: number
  /** Stale `publishing` claims surfaced as failed. */
  staleFailed: number
  /** Due variants left unclaimed because the tick's deadline was near. */
  deferred: number
  errors: string[]
}

/**
 * Resolving the adapter reads tenant secrets and the domain gate; a stall
 * there must not eat the publish budget. Past this it is a transient.
 */
export const ADAPTER_RESOLUTION_TIMEOUT_MS = 5_000
/**
 * Time one dispatch may need from claim to settle: adapter resolution
 * (≤ {@link ADAPTER_RESOLUTION_TIMEOUT_MS}) + the adapter's publish budget
 * (Bluesky: 30 s) + a margin for the settle write. The cron route's
 * `maxDuration` minus its own margin must exceed it, or nothing is ever
 * claimed.
 */
export const PUBLISH_RESERVE_MS = 40_000
/**
 * Re-checked AFTER the claim and adapter resolution, right before the
 * platform is contacted: the claim write itself is unbounded I/O, and a
 * slow one must release the claim rather than start a publish the function
 * cannot see through. Adapter budget + settle margin.
 */
export const PUBLISH_START_RESERVE_MS = 35_000

export const DEFAULT_TICK_LIMIT = 50
/**
 * Fairness across tenants: the due scan is global, so one conference with a
 * deep backlog (or a hostile organizer scheduling a thousand posts in 2020)
 * must not starve the others. The STORE caps candidates per conference in
 * the read itself; `pickFairly` re-applies the cap and the total on what
 * comes back so the engine never depends on the store honouring it.
 */
export const MAX_PER_CONFERENCE_PER_TICK = 10
export const MAX_CONFERENCES_PER_TICK = 50

/**
 * Pure: the fair slice of `due` — ROUND-ROBIN across conferences (one each
 * per pass, in first-seen order) until `limit`, never more than
 * `perConference` from any one. Greedy-in-order would let the first few
 * groups of a grouped list consume the whole tick.
 */
export function pickFairly<V extends SocialPostVariant>(
  due: V[],
  limit: number,
  perConference = MAX_PER_CONFERENCE_PER_TICK,
): V[] {
  const queues = new Map<string, V[]>()
  for (const variant of due) {
    const queue = queues.get(variant.conferenceId) ?? []
    if (queue.length < perConference) queue.push(variant)
    queues.set(variant.conferenceId, queue)
  }
  const picked: V[] = []
  let progressed = true
  while (picked.length < limit && progressed) {
    progressed = false
    for (const queue of queues.values()) {
      if (picked.length >= limit) break
      const next = queue.shift()
      if (next) {
        picked.push(next)
        progressed = true
      }
    }
  }
  return picked
}

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
    candidates: 0,
    due: 0,
    settleLost: 0,
    lostRace: 0,
    published: 0,
    awaitingManual: 0,
    requeued: 0,
    failed: 0,
    staleFailed: 0,
    deferred: 0,
    errors: [],
  }

  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MINUTES * 60_000)
  const work = await store.findWork(now, staleBefore, {
    perConference: MAX_PER_CONFERENCE_PER_TICK,
    maxConferences: MAX_CONFERENCES_PER_TICK,
    staleLimit: limit,
  })
  await failStaleClaims(work.stale, store, now, summary)
  const due = pickFairly(work.due, limit)
  summary.candidates = work.due.length
  summary.due = due.length

  const resolveWithin =
    options.resolveTimeoutMs ?? ADAPTER_RESOLUTION_TIMEOUT_MS
  const boundedResolver: AdapterResolver = (variant) =>
    withTimeout(
      resolveAdapter(variant),
      resolveWithin,
      `Adapter resolution took longer than ${resolveWithin} ms`,
    )

  const awaitingManual: PublishableVariant[] = []
  for (const [index, variant] of due.entries()) {
    if (
      options.deadline &&
      options.deadline.getTime() - Date.now() < PUBLISH_RESERVE_MS
    ) {
      summary.deferred += due.length - index
      break
    }
    try {
      const handedOver = await dispatch(
        variant,
        store,
        boundedResolver,
        now,
        summary,
        options.deadline,
      )
      if (handedOver) awaitingManual.push(handedOver)
    } catch (error) {
      summary.errors.push(
        `${variant._id}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  if (awaitingManual.length > 0 && options.onAwaitingManual) {
    try {
      await options.onAwaitingManual(awaitingManual)
    } catch (error) {
      summary.errors.push(
        `awaiting-manual notification: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  return summary
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms)
    }),
  ]).finally(() => clearTimeout(timer))
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

/**
 * Claim and dispatch one due variant. Returns the variant when this tick
 * handed it to an organizer (`awaiting-manual` landed), else `null`.
 */
async function dispatch(
  variant: PublishableVariant,
  store: SocialVariantStore,
  resolveAdapter: AdapterResolver,
  now: Date,
  summary: PublishTickSummary,
  deadline?: Date,
): Promise<PublishableVariant | null> {
  const claimed = await store.claim(variant, now)
  if (!claimed) {
    summary.lostRace++
    return null
  }

  // Resolving the adapter may read tenant secrets (step 2). A throw here is
  // BEFORE any platform call, so it is a safe transient: same retry policy,
  // never the stale-claim path that tells the organizer to check the platform.
  let adapter: SocialPublishAdapter | null
  try {
    adapter = await resolveAdapter(claimed)
  } catch (error) {
    adapter = null
    await settle(
      claimed,
      {
        ok: false,
        kind: 'transient',
        message: `Adapter resolution failed: ${error instanceof Error ? error.message : String(error)}`,
      },
      store,
      now,
      summary,
    )
    return null
  }

  if (!adapter) {
    const landed = await store.transition(
      claimed._id,
      {
        status: 'awaiting-manual',
        claimedAt: null,
        attempt: { at: now.toISOString(), outcome: 'awaiting-manual' },
      },
      { ifRevision: claimed._rev },
    )
    if (landed) {
      summary.awaitingManual++
      return { ...claimed, status: 'awaiting-manual', claimedAt: null }
    }
    summary.settleLost++
    return null
  }

  if (deadline && deadline.getTime() - Date.now() < PUBLISH_START_RESERVE_MS) {
    // The claim (or the resolution) was slow: hand the variant back, with
    // its schedule and attempt budget untouched, for the next tick.
    const released = await store.transition(
      claimed._id,
      { status: 'scheduled', claimedAt: null },
      { ifRevision: claimed._rev },
    )
    if (released) summary.deferred++
    else summary.settleLost++
    return null
  }

  const input = publishInputFor(claimed, adapter)
  const outcome = input.ok
    ? await attemptPublish(adapter, input.input)
    : input.outcome
  await settle(claimed, outcome, store, now, summary)
  return null
}

/**
 * Record the attempt and apply the retry policy to a claimed variant. Every
 * write is compare-and-set on the CLAIM's revision: if the stale sweep has
 * already failed this claim (a dispatch that outlived the window), the
 * sweep's verdict stands and nothing here can re-queue a possibly-sent post.
 */
async function settle(
  claimed: SocialPostVariant,
  outcome: PublishOutcome,
  store: SocialVariantStore,
  now: Date,
  summary: PublishTickSummary,
) {
  const attempt: Omit<PublishAttempt, '_key'> = outcome.ok
    ? { at: now.toISOString(), outcome: 'published' }
    : { at: now.toISOString(), outcome: outcome.kind, error: outcome.message }
  const attemptCount = claimed.attemptCount + 1
  const decision = decideAfterPublish(outcome, attemptCount, now)

  switch (decision.status) {
    case 'published':
      if (
        await store.transition(
          claimed._id,
          {
            status: 'published',
            claimedAt: null,
            attemptCount,
            publishResult: decision.publishResult,
            attempt,
          },
          { ifRevision: claimed._rev },
        )
      ) {
        summary.published++
      } else {
        // The stale sweep won the race after the platform accepted the post.
        // The verdict on the document stays FAILED (never re-posted); the
        // proof that it went out must not vanish with it.
        summary.settleLost++
        summary.errors.push(
          `${claimed._id}: published (${decision.publishResult.externalId ?? '?'} ${decision.publishResult.url ?? ''}) but the claim was already swept — do NOT retry`,
        )
      }
      return
    case 'scheduled':
      // The backoff time is the ENGINE's override: flag it custom so an
      // organizer editing the post's default time does not pull the retry
      // back to the original slot.
      if (
        await store.transition(
          claimed._id,
          {
            status: 'scheduled',
            claimedAt: null,
            scheduledAt: decision.scheduledAt,
            usesCustomTime: true,
            attemptCount,
            attempt,
          },
          { ifRevision: claimed._rev },
        )
      ) {
        summary.requeued++
      } else {
        summary.settleLost++
      }
      return
    case 'failed':
      if (
        await store.transition(
          claimed._id,
          { status: 'failed', claimedAt: null, attemptCount, attempt },
          { ifRevision: claimed._rev },
        )
      ) {
        summary.failed++
      } else {
        summary.settleLost++
      }
      return
  }
}

/**
 * The adapter's input: the post's attachments resolved to the renditions
 * for THIS platform's crop policy — the same resolution the editor and
 * `scheduleVariant` validated against. An attachment the post no longer
 * carries is a definite refusal: the organizer approved a post WITH that
 * image, so it must never go out without it.
 */
function publishInputFor(
  variant: PublishableVariant,
  adapter: SocialPublishAdapter,
): { ok: true; input: PublishInput } | { ok: false; outcome: PublishOutcome } {
  const media = resolvePublishMedia(
    variant.attachments,
    variant.postAttachments,
    adapter.constraints,
  )
  if (!media) {
    const missing = variant.attachments
      .filter((a) => !variant.postAttachments.some((p) => p._key === a.source))
      .map((a) => a.source)
    // No attachments at all means the post itself could not be read: it
    // was deleted, or it belongs to another conference than the variant.
    const message =
      variant.postAttachments.length === 0
        ? `media: the post's attachments could not be read (the post is gone, or belongs to another conference); edit the post and schedule again.`
        : `media: the post no longer has attachment ${missing.join(', ')}; edit the post and schedule again.`
    return { ok: false, outcome: { ok: false, kind: 'rejected', message } }
  }
  return {
    ok: true,
    input: {
      text: variant.body,
      media,
      link: variant.link ?? undefined,
    },
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
  let issues: ValidationIssue[]
  try {
    issues = adapter.validate(input)
  } catch (error) {
    // `validate` is pure and ran BEFORE any platform call, so a throw is a
    // broken adapter, not an unknown post: reject, never retry.
    return {
      ok: false,
      kind: 'rejected',
      message: `Adapter validate threw: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
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
