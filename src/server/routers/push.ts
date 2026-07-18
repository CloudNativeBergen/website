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
} from '@/lib/push/sanity'
import { getVapidPublicKey } from '@/lib/push/vapid'

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
})
