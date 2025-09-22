import { z } from 'zod'
import { router, adminProcedure } from '@/server/trpc'
import { getProposals } from '@/lib/proposal/data/sanity'
import { ProposalExisting, Status } from '@/lib/proposal/types'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getFeaturedTalks } from '@/lib/featured/sanity'
import { TRPCError } from '@trpc/server'

const proposalSearchSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  status: z.enum(['confirmed', 'accepted']).optional().default('confirmed'),
})

export const proposalsRouter = router({
  searchTalks: adminProcedure
    .input(proposalSearchSchema)
    .query(async ({ input }) => {
      try {
        const { conference, error } = await getConferenceForCurrentDomain()
        if (error || !conference) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get current conference',
            cause: error,
          })
        }

        const { proposals, proposalsError } = await getProposals({
          conferenceId: conference._id,
          returnAll: true,
        })
        if (proposalsError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get proposals',
            cause: proposalsError,
          })
        }

        const { talks: featuredTalks, error: featuredError } =
          await getFeaturedTalks(conference._id)
        if (featuredError) {
          console.warn(
            'Could not get featured talks for exclusion:',
            featuredError,
          )
        }

        const featuredTalkIds = featuredTalks?.map((talk) => talk._id) || []

        const filteredProposals = proposals.filter(
          (proposal: ProposalExisting) => {
            const targetStatus =
              input.status === 'confirmed' ? Status.confirmed : Status.accepted
            if (proposal.status !== targetStatus) {
              return false
            }

            if (featuredTalkIds.includes(proposal._id)) {
              return false
            }

            const searchTerm = input.query.toLowerCase()
            const titleMatch = proposal.title
              ?.toLowerCase()
              .includes(searchTerm)
            const descriptionMatch = proposal.description
              ?.toString()
              .toLowerCase()
              .includes(searchTerm)
            return titleMatch || descriptionMatch
          },
        )

        return filteredProposals
      } catch (error) {
        if (error instanceof TRPCError) throw error

        console.error('Error searching talks:', error)
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to search talks',
          cause: error,
        })
      }
    }),
})
