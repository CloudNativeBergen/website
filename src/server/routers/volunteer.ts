import { TRPCError } from '@trpc/server'
import { router, adminProcedure } from '../trpc'
import {
  GetVolunteerByIdSchema,
  GetVolunteersByConferenceSchema,
  UpdateVolunteerStatusSchema,
  SendVolunteerEmailSchema,
  DeleteVolunteerSchema,
} from '../schemas/volunteer'
import {
  getVolunteersByConference,
  getVolunteerById,
  updateVolunteerStatus,
  deleteVolunteer,
} from '@/lib/volunteer/sanity'
import { VolunteerStatus } from '@/lib/volunteer/types'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { sendVolunteerApprovalEmail } from '@/lib/email/volunteer'

export const volunteerRouter = router({
  list: adminProcedure
    .input(GetVolunteersByConferenceSchema)
    .query(async ({ input }) => {
      try {
        const { conference, error: confError } =
          await getConferenceForCurrentDomain()
        if (confError || !conference?._id) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get current conference',
            cause: confError,
          })
        }
        const conferenceId = input.conferenceId || conference._id
        const { volunteers, error } =
          await getVolunteersByConference(conferenceId)

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch volunteers',
            cause: error,
          })
        }

        return volunteers
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch volunteers',
          cause: error,
        })
      }
    }),

  getById: adminProcedure
    .input(GetVolunteerByIdSchema)
    .query(async ({ input }) => {
      try {
        const { volunteer, error } = await getVolunteerById(input.id)

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch volunteer',
            cause: error,
          })
        }

        if (!volunteer) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Volunteer not found',
          })
        }

        return volunteer
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch volunteer',
          cause: error,
        })
      }
    }),

  updateStatus: adminProcedure
    .input(UpdateVolunteerStatusSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const { volunteer, error: fetchError } = await getVolunteerById(
          input.volunteerId,
        )

        if (fetchError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch volunteer',
            cause: fetchError,
          })
        }

        if (!volunteer) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Volunteer not found',
          })
        }

        const reviewerId = ctx.speaker._id
        const { success, error } = await updateVolunteerStatus(
          input.volunteerId,
          input.status,
          reviewerId,
          input.reviewNotes,
        )

        if (error || !success) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update volunteer status',
            cause: error,
          })
        }

        return { success }
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update volunteer status',
          cause: error,
        })
      }
    }),

  sendEmail: adminProcedure
    .input(SendVolunteerEmailSchema)
    .mutation(async ({ input }) => {
      try {
        const { volunteer, error: fetchError } = await getVolunteerById(
          input.volunteerId,
        )

        if (fetchError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch volunteer',
            cause: fetchError,
          })
        }

        if (!volunteer) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Volunteer not found',
          })
        }

        if (volunteer.status !== VolunteerStatus.APPROVED) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Can only send approval emails to approved volunteers',
          })
        }

        let conferenceForEmail: typeof volunteer.conference =
          volunteer.conference
        if (!conferenceForEmail || !conferenceForEmail.contact_email) {
          const { conference: currentConf, error: confError } =
            await getConferenceForCurrentDomain()
          if (confError || !currentConf) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to get conference',
              cause: confError,
            })
          }
          conferenceForEmail = {
            _id: volunteer.conference?._id || currentConf._id,
            title: volunteer.conference?.title || currentConf.title,
            contact_email: currentConf.contact_email,
            cfp_email: currentConf.cfp_email,
            city: currentConf.city,
            country: currentConf.country,
            start_date: currentConf.start_date,
            domains: currentConf.domains,
            organizer: currentConf.organizer,
            social_links:
              Array.isArray(currentConf.social_links) &&
              currentConf.social_links.length > 0 &&
              typeof currentConf.social_links[0] === 'object'
                ? (currentConf.social_links as unknown as Array<{
                    platform: string
                    url: string
                  }>)
                : [],
          }
        }

        const result = await sendVolunteerApprovalEmail(
          volunteer,
          conferenceForEmail,
          input.subject,
          input.message,
        )

        if (result.error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: result.error.error,
          })
        }

        return {
          success: true,
          emailId: result.data?.emailId,
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to send email',
          cause: error,
        })
      }
    }),

  delete: adminProcedure
    .input(DeleteVolunteerSchema)
    .mutation(async ({ input }) => {
      try {
        const { volunteer, error: fetchError } = await getVolunteerById(
          input.volunteerId,
        )

        if (fetchError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch volunteer',
            cause: fetchError,
          })
        }

        if (!volunteer) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Volunteer not found',
          })
        }

        const { success, error } = await deleteVolunteer(input.volunteerId)

        if (error || !success) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to delete volunteer',
            cause: error,
          })
        }

        return { success }
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete volunteer',
          cause: error,
        })
      }
    }),
})
