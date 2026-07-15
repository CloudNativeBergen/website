import { z } from 'zod'

/**
 * Zod schemas for the `push` tRPC router (issue #444).
 *
 * NOTE: none of these schemas carry a speaker id. The subscription owner is
 * ALWAYS taken from `ctx.speaker._id` on the server, never from client input,
 * so a caller can only ever mutate their own subscriptions.
 */

/** A browser PushSubscription as serialised by `subscription.toJSON()`. */
export const PushSubscriptionInputSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  /** Optional UA string to help a speaker recognise a device. */
  userAgent: z.string().max(512).optional(),
})

export const PushUnsubscribeSchema = z.object({
  endpoint: z.string().url(),
})

export const PushPreferencesSchema = z.object({
  proposalDecisions: z.boolean(),
  talkConfirmed: z.boolean(),
  coSpeakerInvites: z.boolean(),
})
