import { router, protectedProcedure, resolveConferenceId } from '@/server/trpc'
import {
  ListNotificationsSchema,
  MarkReadSchema,
} from '@/server/schemas/notification'
import {
  getNotificationsForSpeaker,
  getUnreadCount,
  markNotificationsRead,
  markAllRead,
} from '@/lib/notification/sanity'

/**
 * The persistent notification hub. Delivery is via polling (`list` /
 * `unreadCount`); the shape is kept SSE-friendly for a later phase. Recipient
 * identity is always `ctx.speaker._id` and the conference is resolved from the
 * current domain — a client can never read or mutate another user's inbox.
 */
export const notificationRouter = router({
  list: protectedProcedure
    .input(ListNotificationsSchema)
    .query(async ({ ctx, input }) => {
      const conferenceId = await resolveConferenceId()
      return getNotificationsForSpeaker({
        speakerId: ctx.speaker._id,
        conferenceId,
        limit: input.limit,
        // `cursor` is the `useInfiniteQuery` alias of `before` (see schema).
        before: input.before ?? input.cursor,
      })
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const conferenceId = await resolveConferenceId()
    return getUnreadCount({ speakerId: ctx.speaker._id, conferenceId })
  }),

  markRead: protectedProcedure
    .input(MarkReadSchema)
    .mutation(async ({ ctx, input }) => {
      const count = await markNotificationsRead({
        speakerId: ctx.speaker._id,
        ids: input.ids,
      })
      return { count }
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const conferenceId = await resolveConferenceId()
    const count = await markAllRead({
      speakerId: ctx.speaker._id,
      conferenceId,
    })
    return { count }
  }),
})
