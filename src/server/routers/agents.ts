import { router, adminProcedure, resolveConferenceId } from '../trpc'
import { getAgentConfig, updateAgentConfig } from '@/lib/agents/sanity'
import { AgentConfigSchema } from '../schemas/agents'
import { TRPCError } from '@trpc/server'

export const agentsRouter = router({
  get: adminProcedure.query(async () => {
    const conferenceId = await resolveConferenceId()
    const { config, error } = await getAgentConfig(conferenceId)

    if (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch agent configuration',
        cause: error,
      })
    }

    return config || {}
  }),

  update: adminProcedure
    .input(AgentConfigSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()

      // Convert nulls to undefined for Sanity consistency if needed,
      // but Sanity handle objects fine.
      // We want to ensure we don't accidentally wipe fields if they are missing from input,
      // but AgentConfigSchema.partial() would be better if we wanted that.
      // For now, we update the whole object.

      const { config, error } = await updateAgentConfig(conferenceId, {
        conferenceContext: input.conferenceContext ?? undefined,
        proposalReviewConfig: input.proposalReviewConfig ?? undefined,
        sponsorCrmConfig: input.sponsorCrmConfig ?? undefined,
      })

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update agent configuration',
          cause: error,
        })
      }

      return config
    }),
})
