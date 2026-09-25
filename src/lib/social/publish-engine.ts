import { randomUUID } from 'node:crypto'
import { withTimeout } from './with-timeout'
import type {
  PublishContext,
  PublishInput,
  PublishOutcome,
  SocialPublishAdapter,
  ValidationIssue,
} from './provider/types'
import {
  decideAfterConfirm,
  decideAfterPublish,
  isConfirmDue,
  isConfirmTimedOut,
  isStaleClaim,
  STALE_CLAIM_MINUTES,
} from './state-machine'
import { resolvePublishMedia } from './media'
import {
  firstCommentIssues,
  getPlatformConstraints,
} from './provider/constraints'
import type { PublishableVariant, SocialVariantStore } from './store'
import type { ConfirmCheck } from './provider/types'
import type { PublishAttempt, SocialPostVariant } from './types'

/**
 * Which adapter publishes a variant, or `null` when the variant is MANUAL —
 * derived at claim time, never stored (#788). The request boundary
 * (`provider/index.ts`) assembles credentials; the engine only asks.
 */
export type AdapterResolver = (
  variant: SocialPostVariant & Pick<PublishableVariant, 'conferenceDomains'>,
) => Promise<SocialPublishAdapter | null>

export interface VariantFailureEvent {
  variant: SocialPostVariant
  attempt: PublishAttempt
}

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
  /**
   * WHEN IT IS NOW, read again after slow work rather than once per tick.
   *
   * `now` pins the whole tick, which is right for deciding what is due. It is
   * wrong for recording when a vendor accepted a post: Buffer's create call
   * alone took 10.9 s in the spike, and `submittedAt` is what the polling
   * cadence and the 15-minute timeout are measured from. Stamped with the
   * tick's start, a submission is polled early and can be failed `ambiguous`
   * tens of seconds before it has actually waited.
   *
   * Defaults to the real clock in production (the cron passes no `now`) and
   * to the pinned `now` whenever one is injected, so tests stay deterministic
   * without opting in.
   */
  clock?: () => Date
  /** Test seam for {@link ADAPTER_RESOLUTION_TIMEOUT_MS}. */
  resolveTimeoutMs?: number
  /** Test seam for {@link CONFIRM_READ_TIMEOUT_MS}. */
  confirmTimeoutMs?: number
  /** Runs immediately after each successful failure CAS, never on a lost race. */
  onFailed?: (event: VariantFailureEvent) => Promise<unknown>
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
  /** Accepted by an asynchronous vendor this tick: now `submitted` (#1128). */
  submitted: number
  /** Submitted variants this tick read back from the vendor. */
  confirmChecked: number
  /** Confirmed live by the sweep. */
  confirmPublished: number
  /** Settled as failed by the sweep (vendor error, gone, or timed out). */
  confirmFailed: number
  /** Submitted variants the sweep left alone: not due, or out of budget. */
  confirmDeferred: number
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

/**
 * One confirm read's budget. Short by design: the sweep runs BEFORE dispatch
 * in the same 60 s function, so a vendor that hangs must cost a few seconds,
 * not the tick.
 */
export const CONFIRM_READ_TIMEOUT_MS = 5_000
/**
 * How many submissions one tick reads back.
 *
 * THE ARITHMETIC, because the previous number did not survive it. Buffer's
 * 100-requests-per-15-minutes is per ACCOUNT, and an account is one tenant
 * organization — so the budget this cap has to respect is per organization,
 * not global. This cap is global and, unlike the dispatch list, confirms are
 * NOT put through `pickFairly`: `submittedLimit` is a flat limit on
 * `findWork`, so a single organization can occupy every slot in a tick.
 *
 * At 10 per tick and one tick a minute that is 150 reads per 15 minutes for
 * that organization — half again over its whole budget, before dispatch has
 * spent anything. At 5 it is at most 75, which leaves room for the publishes
 * the sweep shares the tick with.
 *
 * What 5 costs: with the backoff in `confirmIntervalMs` one submission takes
 * roughly 10 reads across the 15-minute window, so this services about seven
 * concurrent submissions per organization. Past that, submissions are read
 * less often and some may reach `CONFIRM_TIMEOUT_MINUTES` and settle
 * `ambiguous` — a real cost, and the reason not to cut it further.
 *
 * NOT the final answer. Per-conference fairness for confirms, and a budget
 * shared with dispatch rather than two independent caps, belong with the
 * adapter that actually spends the quota (#1129). Nothing here counts a
 * single real Buffer request yet.
 */
export const MAX_CONFIRMS_PER_TICK = 5

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
  const clock =
    options.clock ?? (options.now ? () => options.now! : () => new Date())
  const limit = options.limit ?? DEFAULT_TICK_LIMIT
  const summary: PublishTickSummary = {
    candidates: 0,
    due: 0,
    settleLost: 0,
    lostRace: 0,
    published: 0,
    submitted: 0,
    confirmChecked: 0,
    confirmPublished: 0,
    confirmFailed: 0,
    confirmDeferred: 0,
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
    submittedLimit: MAX_CONFIRMS_PER_TICK,
  })
  await failStaleClaims(work.stale, store, now, summary, options.onFailed)
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

  // BEFORE dispatch (spec §3.2): a variant the vendor already has is closer to
  // being live than one still waiting to be sent, and settling it frees the
  // organizer's view. It is capped, each read is timed out, and it stops
  // entirely once the remaining budget is only enough for a dispatch — so it
  // can never starve one.
  await runConfirmSweep(
    work.submitted ?? [],
    store,
    boundedResolver,
    now,
    summary,
    options.deadline,
    options.confirmTimeoutMs,
    resolveWithin,
    options.onFailed,
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
        options.onFailed,
        clock,
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
  onFailed?: PublishTickOptions['onFailed'],
) {
  for (const variant of stale) {
    if (!isStaleClaim(variant.claimedAt, now)) continue
    try {
      const attempt: PublishAttempt = {
        _key: randomUUID(),
        at: now.toISOString(),
        outcome: 'stale-claim',
        error: `Publishing claim from ${variant.claimedAt ?? 'unknown'} never completed. Check the platform before retrying.`,
      }
      const landed = await store.transition(
        variant._id,
        {
          status: 'failed',
          claimedAt: null,
          attempt,
        },
        { ifRevision: variant._rev },
      )
      if (landed) {
        summary.staleFailed++
        await notifyFailure(onFailed, { variant, attempt }, summary)
      }
    } catch (error) {
      summary.errors.push(
        `${variant._id}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

/**
 * Read back every submission that is due, and settle the ones the vendor has
 * an answer for (#1128, spec §3.2). NOTHING here re-queues a post: the vendor
 * already holds it, so the only endings are `published`, `failed`, or waiting.
 *
 * Each variant is isolated; a vendor read is bounded by
 * {@link CONFIRM_READ_TIMEOUT_MS}; the whole sweep stops as soon as the
 * remaining budget is only enough for one dispatch, so it cannot starve the
 * publish half of the tick.
 */
async function runConfirmSweep(
  submitted: SocialPostVariant[],
  store: SocialVariantStore,
  resolveAdapter: AdapterResolver,
  now: Date,
  summary: PublishTickSummary,
  deadline?: Date,
  confirmTimeoutMs?: number,
  resolveWithin: number = ADAPTER_RESOLUTION_TIMEOUT_MS,
  onFailed?: PublishTickOptions['onFailed'],
) {
  const readWithin = confirmTimeoutMs ?? CONFIRM_READ_TIMEOUT_MS
  // What ONE confirm may cost before its settle write: resolving the adapter
  // (which reads tenant secrets) AND the vendor read. Counting only the read
  // would let a slow resolution eat into the dispatch reserve.
  const confirmCost = resolveWithin + readWithin
  for (const [index, variant] of submitted.entries()) {
    const timedOut = isConfirmTimedOut(
      variant.submission?.submittedAt ?? null,
      now,
    )
    // A timed-out submission gets ONE LAST READ, not a fabricated verdict.
    // It used to be settled without asking, on the reasoning that the answer
    // could not change it — but it can: `decideAfterConfirm` returns
    // `published` for a `published` check whatever the clock says. The first
    // revisit after the deadline is often the first revisit at all (cron
    // downtime, a deferred tick), and skipping the read threw away an
    // authoritative answer together with the post's URL and external id,
    // settling `ambiguous` for a post the vendor could name.
    //
    // It costs one read per submission, once, since a timed-out submission
    // settles either way — so the deadline guard now reserves that read for
    // every candidate rather than only the untimed ones.
    if (
      deadline &&
      deadline.getTime() - Date.now() < PUBLISH_RESERVE_MS + confirmCost
    ) {
      summary.confirmDeferred += submitted.length - index
      return
    }
    if (
      !timedOut &&
      (!variant.submission || !isConfirmDue(variant.submission, now))
    ) {
      summary.confirmDeferred++
      continue
    }
    try {
      const check = await readSubmission(
        variant,
        resolveAdapter,
        readWithin,
        summary,
      )
      summary.confirmChecked++
      await settleConfirm(variant, check, store, now, summary, onFailed)
    } catch (error) {
      summary.errors.push(
        `${variant._id}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

/**
 * One bounded read of the vendor's post. Every failure — no adapter, an
 * adapter that cannot confirm, a throw, a timeout — is `unreadable`: it says
 * nothing about the post, so the variant keeps waiting until the confirm
 * timeout decides.
 */
async function readSubmission(
  variant: SocialPostVariant,
  resolveAdapter: AdapterResolver,
  readWithin: number,
  summary: PublishTickSummary,
): Promise<ConfirmCheck> {
  const vendorPostId = variant.submission?.vendorPostId
  if (!vendorPostId) {
    return { state: 'unreadable', message: 'the submission has no vendor id' }
  }
  try {
    // `conferenceDomains` only feeds link-card building at publish time; a
    // confirm read never uses it, so the sweep does not pay for the join.
    const adapter = await resolveAdapter({ ...variant, conferenceDomains: [] })
    if (!adapter?.confirm) {
      return {
        state: 'unreadable',
        message: adapter
          ? `the ${variant.platform} adapter cannot confirm a submission`
          : `no ${variant.platform} adapter is configured any more`,
      }
    }
    return await withTimeout(
      adapter.confirm(vendorPostId),
      readWithin,
      `Confirm read took longer than ${readWithin} ms`,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    summary.errors.push(`${variant._id}: confirm read failed: ${message}`)
    return { state: 'unreadable', message }
  }
}

/**
 * Apply the confirm verdict. Compare-and-set on the revision the sweep read:
 * a variant that moved on (another tick's sweep, a Studio write) keeps its
 * own verdict, and nothing here can overwrite a settled post.
 */
async function settleConfirm(
  variant: SocialPostVariant,
  check: ConfirmCheck,
  store: SocialVariantStore,
  now: Date,
  summary: PublishTickSummary,
  onFailed?: PublishTickOptions['onFailed'],
) {
  const decision = decideAfterConfirm(
    check,
    variant.submission?.submittedAt ?? null,
    now,
  )
  const checked = {
    ...(variant.submission ?? {
      vendorPostId: '',
      submittedAt: now.toISOString(),
    }),
    lastCheckedAt: now.toISOString(),
  }
  if (decision.status === 'pending') {
    // Record the read so the backoff advances; a lost CAS just means the next
    // tick reads it again.
    await store.transition(
      variant._id,
      { status: 'submitted', submission: checked },
      { ifRevision: variant._rev },
    )
    return
  }
  if (decision.status === 'published') {
    // The CONFIRMATION leg — the only one that joins PUBLISHED_OUTCOMES.
    let landed: boolean
    try {
      landed = await store.transition(
        variant._id,
        {
          status: 'published',
          claimedAt: null,
          submission: checked,
          publishResult: decision.publishResult,
          attempt: { at: now.toISOString(), outcome: 'published' },
        },
        { ifRevision: variant._rev },
      )
    } catch (error) {
      // THE WRITE THREW after the vendor said the post is live. The sweep's
      // catch would log the Sanity error alone; the variant stays `submitted`
      // and is read again next tick — but if the vendor record is gone by
      // then, it settles `ambiguous` for a post the engine had proof of.
      // Surfaced with the receipt before rethrowing, as the submit write and
      // the lost-CAS branch below already do.
      summary.errors.push(
        `${variant._id}: the publisher confirmed the post (${decision.publishResult.externalId ?? '?'} ${decision.publishResult.url ?? ''}) but the settle write FAILED (${error instanceof Error ? error.message : String(error)}) — the post IS live; do NOT retry`,
      )
      throw error
    }
    if (landed) {
      summary.confirmPublished++
    } else {
      // Another writer moved the document after this sweep read it. Its
      // verdict stands; the proof that the post IS live must not vanish
      // silently with the losing write.
      summary.settleLost++
      summary.errors.push(
        `${variant._id}: the publisher confirmed the post (${decision.publishResult.externalId ?? '?'} ${decision.publishResult.url ?? ''}) but the document had already moved on — check it before posting again`,
      )
    }
    return
  }
  const attempt: PublishAttempt = {
    _key: randomUUID(),
    at: now.toISOString(),
    outcome: decision.outcome,
    error: decision.message,
  }
  const landed = await store.transition(
    variant._id,
    { status: 'failed', claimedAt: null, submission: checked, attempt },
    { ifRevision: variant._rev },
  )
  if (landed) {
    summary.confirmFailed++
    await notifyFailure(onFailed, { variant, attempt }, summary)
  } else {
    summary.settleLost++
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
  onFailed?: PublishTickOptions['onFailed'],
  clock: () => Date = () => now,
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
      onFailed,
    )
    return null
  }

  if (!adapter) {
    // A MANUAL hand-over is the last point at which this variant is ours, and
    // it is the one transition that does not run `validate` — there is no
    // adapter to run it. Spec §3.1 (#1134): a body that links to our own site
    // on a first-comment platform must not be handed to an organizer as
    // ready to post. It got past save, schedule and approve only because it
    // was written before the rule existed (or the conference gained the
    // domain since), and `awaiting-manual` is NOT editable — so refusing
    // here, which lands the variant in `failed`, is what gives the organizer
    // a way to fix the copy and schedule it again.
    //
    // Deliberately THIS rule and no other: re-running the whole validator
    // would fail a hand-over over an image deleted from the post since
    // scheduling, which the copy-ready view has always shown as a banner.
    const constraints = getPlatformConstraints(claimed.platform)
    const issues = constraints
      ? firstCommentIssues(constraints, claimed.body, claimed.conferenceDomains)
      : []
    if (issues.length > 0) {
      await settle(
        claimed,
        rejectedOutcome(issues),
        store,
        now,
        summary,
        onFailed,
      )
      return null
    }
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
    ? await attemptPublish(adapter, input.input, {
        conferenceDomains: claimed.conferenceDomains,
      })
    : input.outcome
  // AFTER the publish, not the tick's start: this is when the vendor answered,
  // and `submittedAt` is what the confirm cadence and the 15-minute timeout
  // are measured from.
  await settle(claimed, outcome, store, clock(), summary, onFailed)
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
  onFailed?: PublishTickOptions['onFailed'],
) {
  const attempt: PublishAttempt = {
    _key: randomUUID(),
    at: now.toISOString(),
    ...(outcome.ok
      ? { outcome: 'published' as const }
      : { outcome: outcome.kind, error: outcome.message }),
  }
  const attemptCount = claimed.attemptCount + 1
  const decision = decideAfterPublish(outcome, attemptCount, now)

  switch (decision.status) {
    case 'submitted': {
      // The SUBMIT leg (#1128). Its outcome is `submitted`, never
      // `published`: the post is not live, and `firstPublishedAt` reads the
      // earliest PUBLISHED outcome.
      let landed: boolean
      try {
        landed = await store.transition(
          claimed._id,
          {
            status: 'submitted',
            claimedAt: null,
            attemptCount,
            submission: decision.submission,
            attempt: { ...attempt, outcome: 'submitted' },
          },
          { ifRevision: claimed._rev },
        )
      } catch (error) {
        // THE WRITE THREW, and the vendor is holding a post. This is the only
        // moment the receipt exists anywhere: it came back from `publish()`
        // and the write that would have stored it just failed. Without this,
        // the throw reaches dispatch's catch, which logs the Sanity error
        // alone — the document stays `publishing`, is stale-failed a quarter
        // of an hour later, and the id that could reconcile a possibly-live
        // post is gone. Surfaced before rethrowing, same as the lost-CAS
        // branch below, which had this covered while a throw did not.
        summary.errors.push(
          `${claimed._id}: accepted by the publisher as ${decision.submission.vendorPostId} but the submit write FAILED (${error instanceof Error ? error.message : String(error)}) — the post may be live; do NOT retry without checking`,
        )
        throw error
      }
      if (landed) {
        summary.submitted++
      } else {
        // The stale sweep won the race after the vendor accepted the post.
        // The document stays FAILED (never re-posted). The receipt is LOGGED
        // here, not stored: the losing write is the only thing that could
        // have carried it, and re-writing the document would undo the
        // sweep's verdict. An organizer follows the log line to the vendor.
        summary.settleLost++
        summary.errors.push(
          `${claimed._id}: accepted by the publisher as ${decision.submission.vendorPostId} but the claim was already swept — do NOT retry`,
        )
      }
      return
    }
    case 'published':
      if (
        await store.transition(
          claimed._id,
          {
            status: 'published',
            claimedAt: null,
            attemptCount,
            submission: null,
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
            submission: null,
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
          {
            status: 'failed',
            claimedAt: null,
            submission: null,
            attemptCount,
            attempt,
          },
          { ifRevision: claimed._rev },
        )
      ) {
        summary.failed++
        await notifyFailure(onFailed, { variant: claimed, attempt }, summary)
      } else {
        summary.settleLost++
      }
      return
  }
}

async function notifyFailure(
  hook: PublishTickOptions['onFailed'],
  event: VariantFailureEvent,
  summary: PublishTickSummary,
) {
  if (!hook) return
  try {
    await hook(event)
  } catch (error) {
    summary.errors.push(
      `failure notification (${event.variant._id}): ${error instanceof Error ? error.message : String(error)}`,
    )
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
      // The DIDs generation checked: the adapter posts these rather than
      // resolving the handles a second time (tagging spec §4.4, Publish).
      ...(variant.mentions?.length ? { mentions: variant.mentions } : {}),
    },
  }
}

/** Validation issues as the terminal `rejected` outcome, one wording for every caller. */
function rejectedOutcome(issues: readonly ValidationIssue[]): PublishOutcome {
  return {
    ok: false,
    kind: 'rejected',
    message: issues.map((i) => `${i.field}: ${i.message}`).join('; '),
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
  context: PublishContext,
): Promise<PublishOutcome> {
  let issues: ValidationIssue[]
  try {
    issues = adapter.validate(input, context)
  } catch (error) {
    // `validate` is pure and ran BEFORE any platform call, so a throw is a
    // broken adapter, not an unknown post: reject, never retry.
    return {
      ok: false,
      kind: 'rejected',
      message: `Adapter validate threw: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
  if (issues.length > 0) return rejectedOutcome(issues)
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
