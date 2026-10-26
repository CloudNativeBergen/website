import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import {
  adminProcedure,
  protectedProcedure,
  resolveConferenceId,
  router,
} from '@/server/trpc'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { isContentJudgementEnabled } from '@/lib/content-judgement'
import { feedbackCodeUrl, type FeedbackWindow } from '@/lib/feedback'
import type { KeepAnswer } from '@/lib/feedback/admin'
import { MAX_RESPONSES_PER_REQUEST } from '@/lib/feedback/bulk-remove'
import { TRIAGE_FILTERS } from '@/lib/feedback/triage'
import { SHORT_CODE_SHAPE } from '@/lib/marketing/short-code'
import {
  countFlaggedComments,
  countTalksWithoutCode,
  MintTooSlowError,
  ensureFeedbackCode,
  flagResponse,
  hideResponses,
  keepResponse,
  readAdminFeedback,
  removeResponses,
  unhideResponses,
  mintConferenceFeedbackCodes,
  readFeedbackCode,
  readSpeakerResults,
  rotateFeedbackCode,
  readTalkFeedback,
} from '@/lib/feedback/server'

/**
 * A published Sanity document id and nothing else. The doc endpoint puts the
 * id in its URL path unencoded and reads a comma as a LIST of ids, so an id
 * with `,`, `/`, `?` or whitespace would read other documents (an existence
 * oracle across tenants) or another endpoint entirely.
 */
/**
 * A mint that ran past its time budget wrote nothing (speaker feedback spec
 * §12.3): a transient TIMEOUT the caller can retry, not the uniform
 * NOT_FOUND of a refused talk.
 */
const tryAgainIfSlow = (error: unknown): never => {
  if (error instanceof MintTooSlowError) {
    throw new TRPCError({ code: 'TIMEOUT', message: 'Please try again' })
  }
  throw error
}

const TALK_ID = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/

const talkInput = z.object({ talkId: z.string().max(200).regex(TALK_ID) })

/** Rotation names the code it ends, as the organizer saw it (§10.4). */
const rotateInput = talkInput.extend({
  code: z.string().regex(SHORT_CODE_SHAPE),
})

/**
 * A published Feedback Response id as `feedbackResponseId` makes them
 * (`src/lib/feedback/device.ts`), and nothing else: no draft, no comma list.
 */
const RESPONSE_ID = /^feedbackResponse-[a-f0-9]{32}$/

const responsesInput = z.object({
  responseIds: z
    .array(z.string().regex(RESPONSE_ID))
    .min(1)
    .max(MAX_RESPONSES_PER_REQUEST),
})

/**
 * Remove's input (§10.2, §10.3), for a comment and a range alike: each
 * response with the `submittedAt` the page showed for it (null when it
 * showed none), and, for a range from the chart, its bounds. A response is
 * removed only while it is still that answer, inside the range.
 */
const removeInput = z.object({
  responses: z
    .array(
      z.object({
        id: z.string().regex(RESPONSE_ID),
        submittedAt: z.string().max(40).nullable(),
      }),
    )
    .min(1)
    .max(MAX_RESPONSES_PER_REQUEST),
  range: z.object({ from: z.iso.datetime(), to: z.iso.datetime() }).optional(),
  /**
   * The talk whose panel the Remove came from (Content judgement spec §7.3):
   * only there is Jev's advice shown, so only such a Remove, of that talk's
   * own comments and not by range, counts an agreement. The overview page
   * sends none.
   */
  talkId: z.string().max(200).regex(TALK_ID).optional(),
})

/**
 * One refusal for every id that is not a published response of a talk of
 * this conference: another conference's answers exactly as a missing one.
 */
const responseNotFound = () =>
  new TRPCError({ code: 'NOT_FOUND', message: 'Feedback Response not found' })

/** A speaker's flag: the talk and the response, one id each. */
const flagInput = talkInput.extend({
  responseId: z.string().regex(RESPONSE_ID),
})

const notFound = () =>
  new TRPCError({ code: 'NOT_FOUND', message: 'Talk not found' })

/**
 * Whether the organization has content judgement on (Content judgement spec
 * §5), read live: Jev's advice is carried to the page, and an organizer's
 * decision on a flagged comment is tallied (§7.3), only while it is.
 */
const judgementOn = (orgId: string | null) =>
  orgId ? isContentJudgementEnabled(orgId) : Promise.resolve(false)

/** A talk's code as every procedure here answers it, URL on its domain. */
const toCodeResponse = (
  conference: Parameters<typeof feedbackCodeUrl>[0],
  result: { code: string | null; window: FeedbackWindow },
) => ({
  code: result.code,
  url: result.code ? feedbackCodeUrl(conference, result.code) : null,
  window: result.window,
})

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
      }).catch(tryAgainIfSlow)
      if (result.status === 'refused') throw notFound()
      return toCodeResponse(conference, result)
    }),
  /**
   * The talk's Session Feedback for its speakers (§9.1, §9.3), polled by the
   * section while the window is open. Refused like {@link ensureCode}, before
   * any response is read. Until feedback is visible (§6) only the window
   * comes back; hidden comments never do.
   */
  results: protectedProcedure.input(talkInput).query(async ({ ctx, input }) => {
    const { conference } = await getConferenceForCurrentDomain()
    if (!conference?._id) throw notFound()
    const result = await readSpeakerResults({
      talkId: input.talkId,
      speakerId: ctx.speaker._id,
      conference,
      now: new Date(),
    })
    if (result.status === 'refused') throw notFound()
    if (!result.visible)
      return { visible: false as const, window: result.window }
    return {
      visible: true as const,
      window: result.window,
      totals: result.totals,
      comments: result.comments,
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
    }).catch(tryAgainIfSlow)
    if (result.status === 'refused') throw notFound()
    return toCodeResponse(conference, result)
  }),
  /**
   * A talk's code as the admin talk page shows it (#1459). Never mints:
   * `mayMint` offers the Mint button. NOT_FOUND as {@link mintCode}.
   */
  adminCode: adminProcedure.input(talkInput).query(async ({ input }) => {
    const { conference } = await getConferenceForCurrentDomain()
    if (!conference?._id) throw notFound()
    const result = await readFeedbackCode({
      talkId: input.talkId,
      conference,
      now: new Date(),
    })
    if (result.status === 'refused') throw notFound()
    return {
      ...toCodeResponse(conference, result),
      mayMint: result.mayMint,
      mayRotate: result.mayRotate,
    }
  }),

  /** How many confirmed talks the bulk mint would give a code (#1459). */
  mintPreview: adminProcedure.query(async () => {
    const { conference } = await getConferenceForCurrentDomain()
    if (!conference?._id) throw notFound()
    return countTalksWithoutCode({ conference, now: new Date() })
  }),

  /**
   * Mint a code for every confirmed talk of the conference that has none
   * (#1459). One talk failing does not stop the rest; the report names it.
   */
  mintAll: adminProcedure.mutation(async () => {
    const { conference } = await getConferenceForCurrentDomain()
    if (!conference?._id) throw notFound()
    return mintConferenceFeedbackCodes({ conference })
  }),

  /**
   * The organizers' Session Feedback page (§10.1): every session of the
   * conference with its totals and every comment, hidden ones included.
   */
  adminOverview: adminProcedure.query(async () =>
    readAdminFeedback({
      conferenceId: await resolveConferenceId(),
      now: new Date(),
    }),
  ),

  /**
   * Hide (§10.3): the comments disappear from every speaker's view; their
   * colours still count. Every id must be a response of a talk of this
   * conference, checked before anything is written.
   */
  adminHide: adminProcedure
    .input(responsesInput)
    .mutation(async ({ ctx, input }) => {
      const result = await hideResponses({
        conferenceId: await resolveConferenceId(),
        responseIds: input.responseIds,
        now: new Date(),
        tally: await judgementOn(ctx.orgId),
      })
      if (result.status === 'refused') throw responseNotFound()
      return { count: result.count }
    }),

  /** Unhide (§10.3), guarded like {@link adminHide}. */
  adminUnhide: adminProcedure
    .input(responsesInput)
    .mutation(async ({ input }) => {
      const result = await unhideResponses({
        conferenceId: await resolveConferenceId(),
        responseIds: input.responseIds,
      })
      if (result.status === 'refused') throw responseNotFound()
      return { count: result.count }
    }),

  /**
   * Remove (§10.2, §10.3), for a comment and a chart range alike: deletes
   * the whole responses, colour and comment, after the page's confirmation
   * naming the count. Only answers still as the page showed them are
   * deleted, each under its revision guard; one given again since is kept
   * (`changed`). An id that is not a response of this conference (gone, or
   * another conference's) is skipped (`gone`), never written, and answered
   * exactly like a missing one. A chunk that fails after others committed
   * says how many went.
   */
  adminRemove: adminProcedure
    .input(removeInput)
    .mutation(async ({ ctx, input }) => {
      const result = await removeResponses({
        conferenceId: await resolveConferenceId(),
        responses: input.responses,
        range: input.range,
        talkId: input.talkId,
        tally: await judgementOn(ctx.orgId),
      })
      if (result.status === 'failed')
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          // Not "try again": what went is gone; a reload shows what is left.
          message: `Removed ${result.removed} of ${new Set(input.responses.map((r) => r.id)).size} responses. Reload to see what’s left, then remove those.`,
        })
      return {
        removed: result.removed,
        gone: result.gone,
        changed: result.changed,
      }
    }),

  /**
   * Rotate the talk's Feedback Code (§10.4), after the page's confirmation:
   * the old code stops resolving at once, responses are kept. Refused
   * (NOT_FOUND, nothing written) where {@link adminCode} offers no rotation:
   * a talk that is missing, foreign, not confirmed, has no speaker left or
   * no code, or whose window has closed. PRECONDITION_FAILED while a version of the
   * talk waits in a scheduled release, or when the talk holds another code
   * than the one the organizer confirmed (rotated by someone else since).
   */
  rotateCode: adminProcedure.input(rotateInput).mutation(async ({ input }) => {
    const { conference } = await getConferenceForCurrentDomain()
    if (!conference?._id) throw notFound()
    const result = await rotateFeedbackCode({
      talkId: input.talkId,
      expected: input.code,
      conference,
      now: new Date(),
    }).catch(tryAgainIfSlow)
    if (result.status === 'refused') throw notFound()
    // Its own code, apart from CONFLICT: the code is certainly unchanged, so
    // the page may go on offering it.
    if (result.status === 'locked')
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message:
          'A version of this talk waits in a scheduled release. Rotate the code once it is published.',
      })
    if (result.status === 'changed')
      throw new TRPCError({
        code: 'CONFLICT',
        message: `This talk’s code is now ${result.code}: someone changed it since this page loaded. Check it before rotating again.`,
      })
    return toCodeResponse(conference, result)
  }),

  /**
   * One talk's Session Feedback on its admin page (§10.2): totals, every
   * comment, and every response's time for the chart. Another conference's
   * talk gets the same NOT_FOUND as a missing one. With content judgement on,
   * the comments carry Jev's advice and the triage counts, and `filter`
   * narrows the comments to one tile's (Content judgement spec §8.2).
   */
  adminTalk: adminProcedure
    .input(talkInput.extend({ filter: z.enum(TRIAGE_FILTERS).optional() }))
    .query(async ({ ctx, input }) => {
      const { conference } = await getConferenceForCurrentDomain()
      if (!conference?._id) throw notFound()
      const result = await readTalkFeedback({
        conference,
        talkId: input.talkId,
        now: new Date(),
        judgementOn: await judgementOn(ctx.orgId),
        filter: input.filter,
      })
      if (!result) throw notFound()
      return result
    }),

  /**
   * A speaker flags a comment on their talk for organizers (§9.3, §10.3).
   * One-way: no procedure unflags for a speaker. The talk is checked by the
   * same one scoped query as {@link results}, and feedback must be visible,
   * before the response is read; every refusal, of the talk or of the
   * response (missing, another talk's or conference's, hidden, without a
   * comment), is the same NOT_FOUND. Only a flag that sets `flaggedAt`
   * notifies the organizers (§11.2); an already flagged comment answers the
   * same success.
   */
  flag: protectedProcedure.input(flagInput).mutation(async ({ ctx, input }) => {
    // An organizer impersonating a speaker (development only) must not
    // flag as them, like {@link ensureCode}.
    if (ctx.session?.isImpersonating) throw responseNotFound()
    const { conference } = await getConferenceForCurrentDomain()
    if (!conference?._id) throw responseNotFound()
    const result = await flagResponse({
      talkId: input.talkId,
      responseId: input.responseId,
      speakerId: ctx.speaker._id,
      conference,
      now: new Date(),
    })
    if (result.status === 'refused') throw responseNotFound()
    if (result.status === 'conflict')
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'The comment changed while you flagged it. Try again.',
      })
    return { flagged: true as const }
  }),

  /**
   * Keep (§10.3): clears `flaggedAt`, the comment stays visible to speakers,
   * and records who kept it and when (Content judgement spec §8.2), which
   * ends Jev's advice on it. Guarded like {@link adminHide}, and on the
   * response's revision as the page showed it: after a new flag, a reworded
   * comment or any other change since, nothing is written and the answer
   * says where the comment stands now (read through the doc endpoint), never
   * a flag cleared on something nobody looked at.
   */
  adminKeep: adminProcedure
    .input(
      z.object({
        responseId: z.string().regex(RESPONSE_ID),
        rev: z.string().min(1).max(64),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await keepResponse({
        conferenceId: await resolveConferenceId(),
        responseId: input.responseId,
        seenRev: input.rev,
        keptBy: ctx.speaker._id,
        now: new Date(),
        tally: await judgementOn(ctx.orgId),
      })
      if (result.status === 'refused') throw responseNotFound()
      const answer: KeepAnswer =
        result.status === 'kept'
          ? { kept: true }
          : { kept: false, now: result.now }
      return answer
    }),

  /**
   * The flagged count on the admin nav's Session Feedback entry (§10.1).
   * Read once when the admin shell mounts and again after the actions that
   * change it; one live count query.
   */
  flaggedCount: adminProcedure.query(async () =>
    countFlaggedComments(await resolveConferenceId()),
  ),
})
