import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { protectedProcedure, router } from '@/server/trpc'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { feedbackCodeUrl } from '@/lib/feedback'
import { ensureFeedbackCode } from '@/lib/feedback/server'

/**
 * Session Feedback for speakers (speaker feedback spec §5, §9). The conference
 * is always the one serving the request, never an input.
 */
export const sessionFeedbackRouter = router({
  /**
   * The talk's Feedback Code, minted on first use (§5). Called by the
   * speaker's Session Feedback section on mount. A missing talk, another
   * conference's talk, a talk the caller doesn't speak at and an unconfirmed
   * talk all get the same NOT_FOUND, so the answer reveals nothing (§9.1).
   */
  ensureCode: protectedProcedure
    .input(z.object({ talkId: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const { conference } = await getConferenceForCurrentDomain()
      const result = conference?._id
        ? await ensureFeedbackCode({
            talkId: input.talkId,
            speakerId: ctx.speaker._id,
            conference,
            now: new Date(),
          })
        : ({ status: 'refused' } as const)
      if (result.status === 'refused' || !conference) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Talk not found' })
      }
      return {
        code: result.code,
        url: result.code ? feedbackCodeUrl(conference, result.code) : null,
        window: result.window,
      }
    }),
})
