import { z } from 'zod'
import { PushEndpointSchema, MAX_PUSH_KEY_LENGTH } from '@/lib/push/validate'

/**
 * Zod schemas for the `push` tRPC router (issue #444).
 *
 * NOTE: none of these schemas carry a speaker id. The subscription owner is
 * ALWAYS taken from `ctx.speaker._id` on the server, never from client input,
 * so a caller can only ever mutate their own subscriptions.
 *
 * The `endpoint` is validated by the shared {@link PushEndpointSchema} (public
 * https only, no IP literals / loopback) to close off SSRF via a forged
 * subscription; the encryption keys are length-capped.
 */

/** A browser PushSubscription as serialised by `subscription.toJSON()`. */
export const PushSubscriptionInputSchema = z.object({
  endpoint: PushEndpointSchema,
  keys: z.object({
    p256dh: z.string().min(1).max(MAX_PUSH_KEY_LENGTH),
    auth: z.string().min(1).max(MAX_PUSH_KEY_LENGTH),
  }),
  /** Optional UA string to help a speaker recognise a device. */
  userAgent: z.string().max(512).optional(),
})

export const PushUnsubscribeSchema = z.object({
  endpoint: PushEndpointSchema,
})

export const PushPreferencesSchema = z.object({
  proposalDecisions: z.boolean(),
  talkConfirmed: z.boolean(),
  coSpeakerInvites: z.boolean(),
  otherUpdates: z.boolean(),
})
