/**
 * Proposals tRPC Router
 * Handles proposal-related operations including search functionality
 */

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
        // Get the current conference
        const { conference, error } = await getConferenceForCurrentDomain()
        if (error || !conference) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get current conference',
            cause: error,
          })
        }

        // Get proposals with confirmed or accepted status
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

        // Get current featured talks to exclude them from search results
        const { talks: featuredTalks, error: featuredError } =
          await getFeaturedTalks(conference._id)
        if (featuredError) {
          // Don't fail the search if we can't get featured talks, just log a warning
          console.warn(
            'Could not get featured talks for exclusion:',
            featuredError,
          )
        }

        const featuredTalkIds = featuredTalks?.map((talk) => talk._id) || []

        // Filter to proposals with the specified status and by title/description containing the search query
        // and exclude already featured talks
        const filteredProposals = proposals.filter(
          (proposal: ProposalExisting) => {
            // Only include proposals with the specified status
            const targetStatus =
              input.status === 'confirmed' ? Status.confirmed : Status.accepted
            if (proposal.status !== targetStatus) {
              return false
            }

            // Exclude already featured talks
            if (featuredTalkIds.includes(proposal._id)) {
              return false
            }

            // Search in title and description (case-insensitive)
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
