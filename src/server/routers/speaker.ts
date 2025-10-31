import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure, adminProcedure } from '@/server/trpc'
import {
  SpeakerInputSchema,
  SpeakerCreateSchema,
  SpeakerUpdateSchema,
  EmailUpdateSchema,
  IdParamSchema,
} from '@/server/schemas/speaker'
import {
  getSpeaker,
  updateSpeaker,
  getOrganizers,
  getSpeakers,
} from '@/lib/speaker/sanity'
import { clientWrite } from '@/lib/sanity/client'
import { verifiedEmails } from '@/lib/profile/github'
import { defaultEmails } from '@/lib/profile/server'
import { updateProfileEmail } from '@/lib/profile/sanity'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { Status } from '@/lib/proposal/types'
import type { Speaker } from '@/lib/speaker/types'
import type { ProposalExisting } from '@/lib/proposal/types'
import { generateSlug } from '@/lib/speaker/sanity'

const speakerSearchSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  includeFeatured: z.boolean().optional().default(false),
})

export const speakerRouter = router({
  // Get current user&apos;s speaker profile
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    const { speaker, err } = await getSpeaker(ctx.speaker._id)

    if (err) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch speaker profile',
        cause: err,
      })
    }

    if (!speaker) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Speaker profile not found',
      })
    }

    return speaker
  }),

  // Get speaker by ID (for admin)
  getById: adminProcedure.input(IdParamSchema).query(async ({ input }) => {
    const { speaker, err } = await getSpeaker(input.id)

    if (err) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch speaker',
        cause: err,
      })
    }

    if (!speaker) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Speaker not found',
      })
    }

    return speaker
  }),

  // Update own speaker profile
  update: protectedProcedure
    .input(SpeakerInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const { speaker, err } = await updateSpeaker(ctx.speaker._id, input)

        if (err) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update speaker profile',
            cause: err,
          })
        }

        if (!speaker) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Speaker not found',
          })
        }

        return speaker
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update speaker profile',
          cause: error,
        })
      }
    }),

  // Get OAuth provider emails
  getEmails: protectedProcedure.query(async ({ ctx }) => {
    // Session is guaranteed by protectedProcedure, but account may not exist
    const session = ctx.session!

    if (!session.account) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'No OAuth account found',
      })
    }

    try {
      switch (session.account.provider) {
        case 'github': {
          const result = await verifiedEmails(session.account)
          if (result.error) {
            console.error('Failed to fetch GitHub emails:', result.error)
            return defaultEmails(session)
          }
          return result.emails.length > 0
            ? result.emails
            : defaultEmails(session)
        }

        default:
          return defaultEmails(session)
      }
    } catch (error) {
      console.error('Error fetching emails:', error)
      return defaultEmails(session)
    }
  }),

  // Update speaker email
  updateEmail: protectedProcedure
    .input(EmailUpdateSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const { error } = await updateProfileEmail(input.email, ctx.speaker._id)

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update email',
            cause: error,
          })
        }

        return { success: true, email: input.email }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update email',
          cause: error,
        })
      }
    }),

  // Admin search speakers
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

      // Filter speakers by search query
      const searchTerm = input.query.toLowerCase()
      const filteredSpeakers = allSpeakers.filter((speaker) => {
        const nameMatch = speaker.name?.toLowerCase().includes(searchTerm)
        const titleMatch = speaker.title?.toLowerCase().includes(searchTerm)
        const bioMatch = speaker.bio?.toLowerCase().includes(searchTerm)
        return nameMatch || titleMatch || bioMatch
      })

      // Sort speakers: organizers first, then speakers from current conference, then others
      const sortedSpeakers = filteredSpeakers.sort((a, b) => {
        if (a.is_organizer && !b.is_organizer) return -1
        if (!a.is_organizer && b.is_organizer) return 1

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

        return a.name.localeCompare(b.name)
      })

      return sortedSpeakers
    } catch (error) {
      if (error instanceof TRPCError) throw error

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to search speakers',
        cause: error,
      })
    }
  }),

  // Admin operations
  admin: router({
    // Create speaker
    create: adminProcedure
      .input(SpeakerCreateSchema)
      .mutation(async ({ input }) => {
        try {
          const slug = generateSlug(input.name)

          const speaker = await clientWrite.create({
            _type: 'speaker',
            name: input.name,
            email: input.email,
            slug: { _type: 'slug', current: slug },
            title: input.title,
            bio: input.bio,
            company: input.company,
            links: input.links || [],
            flags: input.flags || [],
            consent: input.consent,
            ...(input.image && {
              image: {
                _type: 'image',
                asset: {
                  _type: 'reference',
                  _ref: input.image,
                },
              },
            }),
          })

          // Fetch the created speaker to get the proper format
          const { speaker: createdSpeaker, err } = await getSpeaker(speaker._id)

          if (err || !createdSpeaker) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to fetch created speaker',
              cause: err,
            })
          }

          return createdSpeaker
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create speaker',
            cause: error,
          })
        }
      }),

    // Update speaker
    update: adminProcedure
      .input(IdParamSchema.extend({ data: SpeakerUpdateSchema }))
      .mutation(async ({ input }) => {
        try {
          // Only update if there's data to update
          if (Object.keys(input.data).length === 0) {
            const { speaker, err } = await getSpeaker(input.id)
            if (err || !speaker) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Speaker not found',
              })
            }
            return speaker
          }

          const { speaker, err } = await updateSpeaker(input.id, input.data)

          if (err) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to update speaker',
              cause: err,
            })
          }

          if (!speaker) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Speaker not found',
            })
          }

          return speaker
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update speaker',
            cause: error,
          })
        }
      }),

    // Delete speaker
    delete: adminProcedure.input(IdParamSchema).mutation(async ({ input }) => {
      try {
        await clientWrite.delete(input.id)
        return { success: true }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete speaker',
          cause: error,
        })
      }
    }),

    // Update speaker email
    updateEmail: adminProcedure
      .input(
        IdParamSchema.extend({
          email: z.string().email('Valid email is required'),
        }),
      )
      .mutation(async ({ input }) => {
        try {
          const { error } = await updateProfileEmail(input.email, input.id)

          if (error) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to update email',
              cause: error,
            })
          }

          return { success: true, email: input.email }
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update email',
            cause: error,
          })
        }
      }),
  }),
})
