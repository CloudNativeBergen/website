import { router, adminProcedure } from '../trpc'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { buildConferenceStatusSummary } from '@/lib/status/summary'
import { TRPCError } from '@trpc/server'

export const statusRouter = router({
  admin: router({
    summary: adminProcedure.query(async () => {
      const { conference, error } = await getConferenceForCurrentDomain({
        organizers: true,
        sponsors: true,
      })

      if (error || !conference?._id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Could not resolve conference from domain',
        })
      }

      return buildConferenceStatusSummary(conference)
    }),
  }),
})
