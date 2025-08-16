/**
 * Speaker tRPC Router
 * Handles speaker-related operations including search functionality
 */

import { z } from 'zod'
import { router, adminProcedure } from '@/server/trpc'
import { getSpeakers } from '@/lib/speaker/sanity'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getFeaturedSpeakers } from '@/lib/featured/sanity'
import { TRPCError } from '@trpc/server'
import { Status } from '@/lib/proposal/types'

const speakerSearchSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
})

export const speakersRouter = router({
  search: adminProcedure.input(speakerSearchSchema).query(async ({ input }) => {
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

      // Get speakers with accepted/confirmed talks and include proposals from other conferences
      const { speakers, err } = await getSpeakers(
        conference._id,
        [Status.confirmed, Status.accepted],
        true,
      )
      if (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get speakers',
          cause: err,
        })
      }

      // Get current featured speakers to exclude them from search results
      const { speakers: featuredSpeakers, error: featuredError } =
        await getFeaturedSpeakers(conference._id)
      if (featuredError) {
        // Don't fail the search if we can't get featured speakers, just log a warning
        console.warn(
          'Could not get featured speakers for exclusion:',
          featuredError,
        )
      }

      const featuredSpeakerIds =
        featuredSpeakers?.map((speaker) => speaker._id) || []

      // Filter speakers by name or title containing the search query (case-insensitive)
      // and exclude already featured speakers
      const filteredSpeakers = speakers.filter((speaker) => {
        // Exclude already featured speakers
        if (featuredSpeakerIds.includes(speaker._id)) {
          return false
        }

        const searchTerm = input.query.toLowerCase()
        const nameMatch = speaker.name?.toLowerCase().includes(searchTerm)
        const titleMatch = speaker.title?.toLowerCase().includes(searchTerm)
        return nameMatch || titleMatch
      })

      return filteredSpeakers
    } catch (error) {
      if (error instanceof TRPCError) throw error

      console.error('Error searching speakers:', error)
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to search speakers',
        cause: error,
      })
    }
  }),
})
