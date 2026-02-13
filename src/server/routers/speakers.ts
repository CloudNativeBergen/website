import { z } from 'zod'
import { router, adminProcedure } from '@/server/trpc'
import { getSpeakers, getOrganizers } from '@/lib/speaker/sanity'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getFeaturedSpeakers } from '@/lib/featured/sanity'
import { TRPCError } from '@trpc/server'
import { Status, type ProposalExisting } from '@/lib/proposal/types'
import type { Speaker } from '@/lib/speaker/types'

const speakerSearchSchema = z.object({
  query: z.string().optional().default(''),
  includeFeatured: z.boolean().optional().default(false),
})

export const speakersRouter = router({
  search: adminProcedure.input(speakerSearchSchema).query(async ({ input }) => {
    try {
      const { conference, error } = await getConferenceForCurrentDomain()
      if (error || !conference) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get current conference',
          cause: error,
        })
      }

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

      // Also get organizers (who may not have talks)
      const { speakers: organizers, err: organizersErr } = await getOrganizers()
      if (organizersErr) {
        console.warn('Could not get organizers:', organizersErr)
      }

      // Merge speakers and organizers, removing duplicates
      const allSpeakersMap = new Map<
        string,
        Speaker & { proposals?: ProposalExisting[] }
      >()
      speakers.forEach((s) => allSpeakersMap.set(s._id, s))
      organizers?.forEach((o) => {
        if (!allSpeakersMap.has(o._id)) {
          allSpeakersMap.set(o._id, { ...o, proposals: [] })
        }
      })
      const allSpeakers = Array.from(allSpeakersMap.values())

      const { speakers: featuredSpeakers, error: featuredError } =
        await getFeaturedSpeakers(conference._id)
      if (featuredError) {
        console.warn(
          'Could not get featured speakers for exclusion:',
          featuredError,
        )
      }

      const featuredSpeakerIds =
        featuredSpeakers?.map((speaker) => speaker._id) || []

      // Filter speakers by name, title (job title/company), or bio containing the search query (case-insensitive)
      // and optionally exclude already featured speakers
      const filteredSpeakers = allSpeakers.filter((speaker) => {
        // Exclude already featured speakers unless includeFeatured is true
        if (
          !input.includeFeatured &&
          featuredSpeakerIds.includes(speaker._id)
        ) {
          return false
        }

        // If no search query, include all speakers
        if (!input.query || input.query.trim() === '') {
          return true
        }

        const searchTerm = input.query.toLowerCase()
        const nameMatch = speaker.name?.toLowerCase().includes(searchTerm)
        const titleMatch = speaker.title?.toLowerCase().includes(searchTerm)
        const bioMatch = speaker.bio?.toLowerCase().includes(searchTerm)
        return nameMatch || titleMatch || bioMatch
      })

      // Sort speakers: organizers first, then speakers from current conference, then others
      const sortedSpeakers = filteredSpeakers.sort((a, b) => {
        // Prioritize organizers
        if (a.isOrganizer && !b.isOrganizer) return -1
        if (!a.isOrganizer && b.isOrganizer) return 1

        // Then prioritize speakers with talks in the current conference
        const aHasCurrentConference =
          a.proposals?.some(
            (p) =>
              typeof p.conference === 'object' &&
              p.conference &&
              '_id' in p.conference &&
              p.conference._id === conference._id,
          ) ?? false
        const bHasCurrentConference =
          b.proposals?.some(
            (p) =>
              typeof p.conference === 'object' &&
              p.conference &&
              '_id' in p.conference &&
              p.conference._id === conference._id,
          ) ?? false

        if (aHasCurrentConference && !bHasCurrentConference) return -1
        if (!aHasCurrentConference && bHasCurrentConference) return 1

        // Finally sort alphabetically by name
        return a.name.localeCompare(b.name)
      })

      return sortedSpeakers
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
