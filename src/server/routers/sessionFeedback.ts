import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { adminProcedure, protectedProcedure, router } from '@/server/trpc'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { feedbackCodeUrl } from '@/lib/feedback'
import { ensureFeedbackCode } from '@/lib/feedback/server'

/**
 * A published Sanity document id and nothing else. The doc endpoint puts the
 * id in its URL path unencoded and reads a comma as a LIST of ids, so an id
 * with `,`, `/`, `?` or whitespace would read other documents (an existence
 * oracle across tenants) or another endpoint entirely.
 */
const TALK_ID = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/

const talkInput = z.object({ talkId: z.string().max(200).regex(TALK_ID) })

const notFound = () =>
  new TRPCError({ code: 'NOT_FOUND', message: 'Talk not found' })

/**
 * Session Feedback for speakers (speaker feedback spec §5, §9) and the
 * organizers' minting (#1459). The conference is always the one serving the
 * request, never an input.
 */
export const sessionFeedbackRouter = router({
  /**
   * The talk's Feedback Code, minted on first use (§5). Called by the
   * speaker's Session Feedback section on mount. A missing talk, another
   * conference's talk, a talk the caller doesn't speak at and an unconfirmed
   * talk all get the same NOT_FOUND, so the answer reveals nothing (§9.1).
   */
  ensureCode: protectedProcedure
    .input(talkInput)
    .mutation(async ({ ctx, input }) => {
      // An organizer impersonating a speaker (development only) must not
      // write a code as them; other writes refuse the same way.
      if (ctx.session?.isImpersonating) throw notFound()
      // Not `resolveConferenceId()`: the code's URL and window need the
      // conference's `domains` and `endDate` too. Fails closed the same way.
      const { conference } = await getConferenceForCurrentDomain()
      if (!conference?._id) throw notFound()
      const result = await ensureFeedbackCode({
        talkId: input.talkId,
        actor: { speakerId: ctx.speaker._id },
        conference,
        now: new Date(),
      })
      if (result.status === 'refused') throw notFound()
      return {
        code: result.code,
        url: result.code ? feedbackCodeUrl(conference, result.code) : null,
        window: result.window,
      }
    }),
  /**
   * An organizer mints a talk's code (#1459), with the same rules as the
   * speaker's first view (§5) but no speaker check. A talk with a code keeps
   * it; changing one is rotation (§10.4). Another conference's talk gets the
   * same NOT_FOUND as a missing one.
   */
  mintCode: adminProcedure.input(talkInput).mutation(async ({ input }) => {
    const { conference } = await getConferenceForCurrentDomain()
    if (!conference?._id) throw notFound()
    const result = await ensureFeedbackCode({
      talkId: input.talkId,
      actor: { organizer: true },
      conference,
      now: new Date(),
    })
    if (result.status === 'refused') throw notFound()
    return {
      code: result.code,
      url: result.code ? feedbackCodeUrl(conference, result.code) : null,
      window: result.window,
    }
  }),
})
