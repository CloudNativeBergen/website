import { TRPCError } from '@trpc/server'
import { router, adminProcedure, publicProcedure } from '../trpc'
import {
  GetVolunteerByIdSchema,
  GetVolunteersByConferenceSchema,
  UpdateVolunteerStatusSchema,
  SendVolunteerEmailSchema,
  DeleteVolunteerSchema,
  CreateVolunteerSchema,
} from '../schemas/volunteer'
import {
  getVolunteersByConference,
  getVolunteerById,
  updateVolunteerStatus,
  deleteVolunteer,
  createVolunteer,
} from '@/lib/volunteer/sanity'
import { VolunteerStatus } from '@/lib/volunteer/types'
import type { VolunteerInput } from '@/lib/volunteer/types'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { sendVolunteerApprovalEmail } from '@/lib/email/volunteer'
import { PRIVACY_POLICY_VERSION } from '@/lib/privacy/config'
import { notifyNewVolunteer } from '@/lib/slack/notify'

export const volunteerRouter = router({
  create: publicProcedure
    .input(CreateVolunteerSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const ipAddress = ctx.ipAddress || ''

        const volunteerInput: VolunteerInput = {
          name: input.name,
          email: input.email,
          phone: input.phone,
          occupation: input.occupation,
          availability: input.availability,
          preferredTasks: input.preferredTasks,
          tshirtSize: input.tshirtSize,
          dietaryRestrictions: input.dietaryRestrictions,
          otherInfo: input.otherInfo,
          conference: {
            _type: 'reference',
            _ref: input.conferenceId,
          },
          consent: {
            dataProcessing: {
              granted: true,
              grantedAt: new Date().toISOString(),
              ipAddress,
            },
            privacyPolicyVersion: PRIVACY_POLICY_VERSION,
          },
        }

        const result = await createVolunteer(volunteerInput)

        if (result.error || !result.volunteer) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message:
              result.error?.message || 'Failed to create volunteer record',
            cause: result.error,
          })
        }

        try {
          const { conference, error } = await getConferenceForCurrentDomain()
          if (!error && conference) {
            void notifyNewVolunteer(result.volunteer, conference)
          }
        } catch {
          // Ignore notification errors
        }

        return {
          success: true,
          volunteerId: result.volunteer._id,
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create volunteer application',
          cause: error,
        })
      }
    }),

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
        if (!conferenceForEmail || !conferenceForEmail.contactEmail) {
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
            contactEmail: currentConf.contactEmail,
            cfpEmail: currentConf.cfpEmail,
            city: currentConf.city,
            country: currentConf.country,
            startDate: currentConf.startDate,
            domains: currentConf.domains,
            organizer: currentConf.organizer,
            socialLinks:
              Array.isArray(currentConf.socialLinks) &&
              currentConf.socialLinks.length > 0 &&
              typeof currentConf.socialLinks[0] === 'object'
                ? (currentConf.socialLinks as unknown as Array<{
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
