import { TRPCError } from '@trpc/server'
import { router, adminProcedure } from '@/server/trpc'
import { SaveScheduleSchema } from '@/server/schemas/schedule'
import { saveScheduleToSanity, getValidTalkIds } from '@/lib/schedule/sanity'
import { validateSchedulePayload } from '@/lib/schedule/validation'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { revalidateTag } from 'next/cache'
import { conferenceTag } from '@/lib/cache/tags'
import type { ConferenceSchedule } from '@/lib/conference/types'

export const scheduleRouter = router({
  save: adminProcedure
    .input(SaveScheduleSchema)
    .mutation(async ({ input, ctx }) => {
      const { conference, error: conferenceError } =
        await getConferenceForCurrentDomain()

      if (conferenceError || !conference) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch conference',
        })
      }

      const payload = input as ConferenceSchedule

      // Validate the incoming payload BEFORE persisting: reject malformed times,
      // out-of-bounds/overlapping slots, ambiguous slots (both/neither talk and
      // placeholder), and dangling/foreign talk refs. The talk-id set is fetched
      // once and passed to the pure validator.
      const validTalkIds = await getValidTalkIds(conference._id)
      const validationError = validateSchedulePayload(payload, validTalkIds)
      if (validationError) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: validationError })
      }

      const {
        schedule,
        error: saveError,
        conflict,
      } = await saveScheduleToSanity(payload, conference, {
        actorId: ctx.speaker?._id,
      })

      if (conflict) {
        throw new TRPCError({
          code: 'CONFLICT',
          message:
            saveError || 'This day was changed elsewhere since you loaded it.',
        })
      }

      if (saveError || !schedule) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: saveError || 'Failed to save schedule',
        })
      }

      // A schedule save changes exactly ONE conference's program. Revalidate the
      // tenant-scoped tag ONLY — the generic `content:program`/`content:conferences`
      // tags would bust every other conference's cached pages. Every page that
      // renders this conference's content (and the shared conference read in
      // `fetchConferenceData`) now carries `sanity:conference-<id>`, so the
      // scoped tag alone fully invalidates this tenant.
      revalidateTag(conferenceTag(conference._id), 'default')

      return { schedule }
    }),
})
