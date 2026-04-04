import { TRPCError } from '@trpc/server'
import { router, adminProcedure } from '@/server/trpc'
import { SaveScheduleSchema } from '@/server/schemas/schedule'
import { saveScheduleToSanity } from '@/lib/schedule/sanity'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { revalidateTag } from 'next/cache'
import type { ConferenceSchedule } from '@/lib/conference/types'

export const scheduleRouter = router({
  save: adminProcedure.input(SaveScheduleSchema).mutation(async ({ input }) => {
    const { conference, error: conferenceError } =
      await getConferenceForCurrentDomain()

    if (conferenceError || !conference) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch conference',
      })
    }

    const { schedule, error: saveError } = await saveScheduleToSanity(
      input as ConferenceSchedule,
      conference,
    )

    if (saveError || !schedule) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: saveError || 'Failed to save schedule',
      })
    }

    revalidateTag('content:program', 'default')
    revalidateTag('content:conferences', 'default')
    revalidateTag(`sanity:conference-${conference._id}`, 'default')

    return { schedule }
  }),
})
