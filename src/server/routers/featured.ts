import { TRPCError } from '@trpc/server'
import { revalidateTag } from 'next/cache'
import { conferenceTag } from '@/lib/cache/tags'
import { router, adminProcedure } from '../trpc'
import {
  requireDocumentInCurrentOrg,
  requireSpeakersInCurrentOrg,
} from '../tenancy'
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
  admin: router({
    listSpeakers: adminProcedure.query(async () => {
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
          message: 'Failed to get featured speakers',
          cause: error,
        })
      }
    }),

    listTalks: adminProcedure.query(async () => {
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
          message: 'Failed to get featured talks',
          cause: error,
        })
      }
    }),

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

          // REFERENCE INJECTION (#730): `addFeaturedSpeaker` is a bare `.append`
          // of `{_ref: input.speakerId}` with no `_type` and no tenant check —
          // another tenant's speaker (name, bio, photo) rendered on this public
          // homepage.
          await requireSpeakersInCurrentOrg([input.speakerId])

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

          // Featured speakers surface on this conference's homepage — bust only
          // this tenant (its pages carry `sanity:conference-<id>`).
          revalidateTag(conferenceTag(conference._id), 'default')

          return { success: true }
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to add featured speaker',
            cause: error,
          })
        }
      }),

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

          // Featured speakers surface on this conference's homepage — bust only
          // this tenant (its pages carry `sanity:conference-<id>`).
          revalidateTag(conferenceTag(conference._id), 'default')

          return { success: true }
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to remove featured speaker',
            cause: error,
          })
        }
      }),

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

          // REFERENCE INJECTION (#730): same shape as `addSpeaker`. An
          // unvalidated talk id dereferenced another tenant's UNPUBLISHED CFP
          // submission onto this public site — an exfiltration channel.
          await requireDocumentInCurrentOrg(input.talkId, 'talk')

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

          // Featured talks surface on this conference's home/program pages —
          // bust only this tenant (all those pages carry `sanity:conference-<id>`).
          revalidateTag(conferenceTag(conference._id), 'default')

          return { success: true }
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to add featured talk',
            cause: error,
          })
        }
      }),

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

          // Featured talks surface on this conference's home/program pages —
          // bust only this tenant (all those pages carry `sanity:conference-<id>`).
          revalidateTag(conferenceTag(conference._id), 'default')

          return { success: true }
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to remove featured talk',
            cause: error,
          })
        }
      }),

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

        const { summary, error: summaryError } =
          await getFeaturedContentSummary(conference._id)
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
          message: 'Failed to get featured content summary',
          cause: error,
        })
      }
    }),
  }),
})
