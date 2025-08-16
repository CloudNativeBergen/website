/**
 * tRPC Router for Featured Content Management
 * Complete CRUD operations for featured speakers and talks
 */

import { TRPCError } from '@trpc/server'
import { revalidatePath } from 'next/cache'
import { router, adminProcedure } from '../trpc'
import {
  FeaturedSpeakerInputSchema,
  FeaturedTalkInputSchema,
  FeaturedSpeakerRemoveSchema,
  FeaturedTalkRemoveSchema,
} from '../schemas/featured'
import {
  getFeaturedSpeakers,
  getFeaturedTalks,
  addFeaturedSpeaker,
  removeFeaturedSpeaker,
  addFeaturedTalk,
  removeFeaturedTalk,
  getFeaturedContentSummary,
} from '@/lib/featured/sanity'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export const featuredRouter = router({
  // Get current featured speakers
  featuredSpeakers: adminProcedure.query(async () => {
    try {
      const { conference, error } = await getConferenceForCurrentDomain()
      if (error || !conference) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get current conference',
          cause: error,
        })
      }

      const { speakers, error: speakersError } = await getFeaturedSpeakers(
        conference._id,
      )
      if (speakersError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get featured speakers',
          cause: speakersError,
        })
      }

      return speakers
    } catch (error) {
      if (error instanceof TRPCError) throw error

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unexpected error getting featured speakers',
        cause: error,
      })
    }
  }),

  // Get current featured talks
  featuredTalks: adminProcedure.query(async () => {
    try {
      const { conference, error } = await getConferenceForCurrentDomain()
      if (error || !conference) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get current conference',
          cause: error,
        })
      }

      const { talks, error: talksError } = await getFeaturedTalks(
        conference._id,
      )
      if (talksError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get featured talks',
          cause: talksError,
        })
      }

      return talks
    } catch (error) {
      if (error instanceof TRPCError) throw error

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unexpected error getting featured talks',
        cause: error,
      })
    }
  }),

  // Add featured speaker
  addSpeaker: adminProcedure
    .input(FeaturedSpeakerInputSchema)
    .mutation(async ({ input }) => {
      try {
        const { conference, error } = await getConferenceForCurrentDomain()
        if (error || !conference) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get current conference',
            cause: error,
          })
        }

        const { success, error: addError } = await addFeaturedSpeaker(
          conference._id,
          input.speakerId,
        )

        if (!success || addError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to add featured speaker',
            cause: addError,
          })
        }

        // Revalidate front page and related pages that might show featured content
        revalidatePath('/')
        revalidatePath('/speakers')
        revalidatePath('/program')

        return { success: true }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Unexpected error adding featured speaker',
          cause: error,
        })
      }
    }),

  // Remove featured speaker
  removeSpeaker: adminProcedure
    .input(FeaturedSpeakerRemoveSchema)
    .mutation(async ({ input }) => {
      try {
        const { conference, error } = await getConferenceForCurrentDomain()
        if (error || !conference) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get current conference',
            cause: error,
          })
        }

        const { success, error: removeError } = await removeFeaturedSpeaker(
          conference._id,
          input.speakerId,
        )

        if (!success || removeError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to remove featured speaker',
            cause: removeError,
          })
        }

        // Revalidate front page and related pages that might show featured content
        revalidatePath('/')
        revalidatePath('/speakers')
        revalidatePath('/program')

        return { success: true }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Unexpected error removing featured speaker',
          cause: error,
        })
      }
    }),

  // Add featured talk
  addTalk: adminProcedure
    .input(FeaturedTalkInputSchema)
    .mutation(async ({ input }) => {
      try {
        const { conference, error } = await getConferenceForCurrentDomain()
        if (error || !conference) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get current conference',
            cause: error,
          })
        }

        const { success, error: addError } = await addFeaturedTalk(
          conference._id,
          input.talkId,
        )

        if (!success || addError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to add featured talk',
            cause: addError,
          })
        }

        // Revalidate front page and related pages that might show featured content
        revalidatePath('/')
        revalidatePath('/speakers')
        revalidatePath('/program')

        return { success: true }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Unexpected error adding featured talk',
          cause: error,
        })
      }
    }),

  // Remove featured talk
  removeTalk: adminProcedure
    .input(FeaturedTalkRemoveSchema)
    .mutation(async ({ input }) => {
      try {
        const { conference, error } = await getConferenceForCurrentDomain()
        if (error || !conference) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get current conference',
            cause: error,
          })
        }

        const { success, error: removeError } = await removeFeaturedTalk(
          conference._id,
          input.talkId,
        )

        if (!success || removeError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to remove featured talk',
            cause: removeError,
          })
        }

        // Revalidate front page and related pages that might show featured content
        revalidatePath('/')
        revalidatePath('/speakers')
        revalidatePath('/program')

        return { success: true }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Unexpected error removing featured talk',
          cause: error,
        })
      }
    }),

  // Get summary statistics
  summary: adminProcedure.query(async () => {
    try {
      const { conference, error } = await getConferenceForCurrentDomain()
      if (error || !conference) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get current conference',
          cause: error,
        })
      }

      const { summary, error: summaryError } = await getFeaturedContentSummary(
        conference._id,
      )
      if (summaryError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get featured content summary',
          cause: summaryError,
        })
      }

      return summary
    } catch (error) {
      if (error instanceof TRPCError) throw error

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unexpected error getting featured content summary',
        cause: error,
      })
    }
  }),
})
