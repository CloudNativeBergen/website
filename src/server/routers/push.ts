import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../trpc'
import {
  PushSubscriptionInputSchema,
  PushUnsubscribeSchema,
  PushPreferencesSchema,
} from '../schemas/push'
import {
  addPushSubscription,
  removePushSubscription,
  getPushPreferences,
  setPushPreferences,
  getSpeakerPushState,
  prunePushSubscription,
} from '@/lib/push/sanity'
import { getVapidPublicKey, isPushConfigured } from '@/lib/push/vapid'
import { sendPush } from '@/lib/push/send'
import { isValidPushEndpoint } from '@/lib/push/validate'
import type { PushMessagePayload } from '@/lib/push/types'

/**
 * Best-effort, per-speaker cooldown for `sendTest` so an accidental double-tap
 * can't hammer the push services. Lives in module memory, so on serverless it is
 * PER-INSTANCE only — a retry routed to a different (or cold) instance won't see
 * a prior send. That's acceptable: the endpoint is self-targeted and the push
 * services rate-limit further downstream. The map is size-capped so it can never
 * grow without bound (oldest-active entry evicted on overflow).
 */
const TEST_COOLDOWN_MS = 10_000
const MAX_COOLDOWN_ENTRIES = 10_000
const lastTestSentAt = new Map<string, number>()

/**
 * Record a test send for `speakerId` and report whether it is allowed right now.
 * Returns false when the speaker sent a test within {@link TEST_COOLDOWN_MS};
 * otherwise stamps the current time and returns true.
 */
function claimTestCooldown(speakerId: string): boolean {
  const now = Date.now()
  const previous = lastTestSentAt.get(speakerId)
  if (previous !== undefined && now - previous < TEST_COOLDOWN_MS) {
    return false
  }
  // Bound memory: a Map iterates in insertion order, so the first key is the
  // least-recently-active. Delete-then-set keeps the just-active speaker at the
  // tail, so eviction always targets the genuinely oldest entry.
  lastTestSentAt.delete(speakerId)
  if (lastTestSentAt.size >= MAX_COOLDOWN_ENTRIES) {
    const oldest = lastTestSentAt.keys().next().value
    if (oldest !== undefined) lastTestSentAt.delete(oldest)
  }
  lastTestSentAt.set(speakerId, now)
  return true
}

/**
 * Web push subscription + preference management (issue #444).
 *
 * SECURITY: every mutation is a `protectedProcedure` and binds the write to
 * `ctx.speaker._id` — the authenticated caller's own speaker document. No
 * procedure accepts a speaker id from the client, so a caller can NEVER read or
 * write another speaker's subscriptions.
 */
export const pushRouter = router({
  /**
   * The VAPID PUBLIC key, needed by the browser to create a subscription. Safe
   * to expose (the private key never leaves the server). `protectedProcedure`
   * because only signed-in speakers can subscribe anyway.
   */
  getVapidKey: protectedProcedure.query(() => {
    return { publicKey: getVapidPublicKey() }
  }),

  /** Store a PushSubscription on the caller's own speaker doc (dedup by endpoint). */
  subscribe: protectedProcedure
    .input(PushSubscriptionInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        await addPushSubscription(ctx.speaker._id, {
          endpoint: input.endpoint,
          keys: { p256dh: input.keys.p256dh, auth: input.keys.auth },
          userAgent: input.userAgent,
        })
        return { success: true }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to store push subscription',
          cause: error,
        })
      }
    }),

  /** Remove a subscription (by endpoint) from the caller's own speaker doc. */
  unsubscribe: protectedProcedure
    .input(PushUnsubscribeSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        await removePushSubscription(ctx.speaker._id, input.endpoint)
        return { success: true }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to remove push subscription',
          cause: error,
        })
      }
    }),

  /** Read the caller's own push preferences (all default ON). */
  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await getPushPreferences(ctx.speaker._id)
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to load push preferences',
        cause: error,
      })
    }
  }),

  /** Overwrite the caller's own push preferences. */
  setPreferences: protectedProcedure
    .input(PushPreferencesSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await setPushPreferences(ctx.speaker._id, input)
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to save push preferences',
          cause: error,
        })
      }
    }),

  /**
   * Send a test notification to the CALLER'S OWN subscriptions so a speaker can
   * verify their push setup end-to-end (keys → subscription → SW display → deep
   * link) with one tap.
   *
   * SECURITY: self-targeted only — no input, the recipient is always
   * `ctx.speaker._id`. Like every other procedure here it can never read or
   * write another speaker's subscriptions, so it needs no extra authz beyond
   * `protectedProcedure`.
   *
   * Returns `{ sent, gone, total, configured, failures }`:
   *   - `configured`: whether the server has VAPID keys at all;
   *   - `sent`: how many of the caller's devices the push service accepted;
   *   - `gone`: how many dead/invalid subscriptions were pruned in the process;
   *   - `total`: how many subscriptions existed when the test ran;
   *   - `failures`: deduped, capped diagnostics for LIVE subscriptions the push
   *     service rejected (e.g. a 403 VapidPkHashMismatch), so the client can
   *     advise the fix (turn notifications off/on to re-subscribe). A 403 is
   *     NOT auto-pruned — a server-side key misconfig would otherwise mass-purge
   *     valid subscriptions — it is surfaced as a hint only.
   */
  sendTest: protectedProcedure.mutation(async ({ ctx }) => {
    // No VAPID keys → push can never work; report it rather than pretending.
    if (!isPushConfigured()) {
      return { sent: 0, gone: 0, total: 0, configured: false }
    }

    // Best-effort guard against accidental hammering (see claimTestCooldown).
    if (!claimTestCooldown(ctx.speaker._id)) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Please wait a few seconds before sending another test.',
      })
    }

    let state
    try {
      state = await getSpeakerPushState(ctx.speaker._id)
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to load push subscriptions',
        cause: error,
      })
    }

    if (state.subscriptions.length === 0) {
      return { sent: 0, gone: 0, total: 0, configured: true }
    }

    // A deliberate, explicit user action — so it BYPASSES per-category
    // preferences entirely (unlike sendPushForNotifications, which gates each
    // notification on the speaker's category prefs). If a speaker taps "send
    // test", they get the test regardless of which categories they've muted.
    const payload: PushMessagePayload = {
      title: 'Test notification',
      body: 'Push notifications are working on this device 🎉',
      url: '/cfp/profile',
      tag: 'test-notification',
    }

    let sent = 0
    let gone = 0

    // Same transport as production (`sendPush`) and the SAME prune helper
    // (`prunePushSubscription`) on a 404/410, so this exercises the real path.
    const results = await Promise.allSettled(
      state.subscriptions.map(async (subscription) => {
        // Defense in depth against SSRF, mirroring send.ts: never POST to a
        // stored endpoint that no longer passes public-https validation. Prune
        // and skip it (counts as gone) rather than requesting it.
        if (!isValidPushEndpoint(subscription.endpoint)) {
          await prunePushSubscription(
            ctx.speaker._id,
            subscription.endpoint,
          ).catch((error) => {
            console.error(
              `Failed to prune invalid push subscription for speaker ${ctx.speaker._id}:`,
              error,
            )
          })
          return { ok: false, gone: true }
        }

        const result = await sendPush(subscription, payload)
        if (result.gone) {
          await prunePushSubscription(
            ctx.speaker._id,
            subscription.endpoint,
          ).catch((error) => {
            console.error(
              `Failed to prune dead push subscription for speaker ${ctx.speaker._id}:`,
              error,
            )
          })
        }
        return result
      }),
    )

    // Diagnostic failures for LIVE (non-gone) subscriptions the push service
    // rejected. `sendPush` composes each `message` from the push-service
    // response and never includes the endpoint, so it is safe to return to the
    // authenticated OWNER of these subscriptions (their own device's result).
    const failures: Array<{ statusCode?: number; message?: string }> = []
    for (const r of results) {
      if (r.status !== 'fulfilled') {
        // `sendPush` never throws and the prune helpers catch their own
        // rejections, so this is unreachable in practice — but map it
        // defensively rather than let a rejection vanish silently.
        console.error(
          `[push] test send task rejected for speaker ${ctx.speaker._id}:`,
          r.reason,
        )
        // Carry the actual rejection reason to the client (truncated) — the
        // opaque 'internal error' copy hid a real VAPID misconfiguration once.
        const reason =
          r.reason instanceof Error ? r.reason.message : String(r.reason)
        failures.push({
          statusCode: undefined,
          message: reason.slice(0, 200) || 'internal error',
        })
        continue
      }
      if (r.value.ok) {
        sent += 1
        continue
      }
      if (r.value.gone) {
        gone += 1
        continue
      }
      failures.push({
        statusCode: r.value.statusCode,
        message: r.value.errorMessage,
      })
    }

    // Dedupe identical (statusCode, message) pairs — every device behind the
    // same push service typically fails identically — then cap the list so the
    // response stays small.
    const seen = new Set<string>()
    const dedupedFailures: Array<{ statusCode?: number; message?: string }> = []
    for (const failure of failures) {
      const key = `${failure.statusCode ?? ''}::${failure.message ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      dedupedFailures.push(failure)
    }

    // `total` lets the client distinguish "no devices subscribed" (total 0)
    // from "devices exist but every send failed" (total > 0, sent 0); `failures`
    // lets it explain WHY (e.g. a 403 → re-subscribe hint).
    return {
      sent,
      gone,
      total: state.subscriptions.length,
      configured: true,
      failures: dedupedFailures.slice(0, 5),
    }
  }),
})
