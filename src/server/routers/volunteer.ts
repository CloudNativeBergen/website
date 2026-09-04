import { TRPCError } from '@trpc/server'
import {
  router,
  adminProcedure,
  publicProcedure,
  resolveConferenceId,
} from '../trpc'
import {
  GetVolunteerByIdSchema,
  UpdateVolunteerStatusSchema,
  UpdateVolunteerDetailsSchema,
  SendVolunteerEmailSchema,
  DeleteVolunteerSchema,
  CreateVolunteerSchema,
} from '../schemas/volunteer'
import { requireDocumentInCurrentConference } from '../tenancy'
import {
  getVolunteersByConference,
  getVolunteerById,
  updateVolunteerStatus,
  updateVolunteerDetails,
  deleteVolunteer,
  createVolunteer,
} from '@/lib/volunteer/sanity'
import { VolunteerStatus } from '@/lib/volunteer/types'
import type { VolunteerInput } from '@/lib/volunteer/types'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { sendVolunteerApprovalEmail } from '@/lib/email/volunteer'
import { PRIVACY_POLICY_VERSION } from '@/lib/privacy/config'
import { notifyNewVolunteer } from '@/lib/slack/notify'
import { getCurrentDateTime } from '@/lib/time'
import { createNotifications } from '@/lib/notification/sanity'
import { resolveRoutedOrganizerIds } from '@/lib/teams'
import type { NotificationInput } from '@/lib/notification/types'

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
            _ref: await resolveConferenceId(),
          },
          consent: {
            dataProcessing: {
              granted: true,
              grantedAt: getCurrentDateTime(),
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

            // In-app mirror for organizers. This is a public endpoint, so
            // there is no actor to exclude. Shares createNotifications'
            // never-fail contract: the volunteer record is already created.
            const volunteerName = result.volunteer.name
            // TEAMS-2: volunteer signups route to the `volunteers` team (all
            // organizers when it is not configured — the shared fallback).
            const organizerIds = await resolveRoutedOrganizerIds({
              conferenceId: conference._id,
              teamKey: 'volunteers',
            })
            await createNotifications(
              organizerIds
                .filter((id) => id)
                .map((id): NotificationInput => ({
                  recipientId: id,
                  conferenceId: conference._id,
                  notificationType: 'system',
                  title: `New volunteer signup: ${volunteerName}`,
                  link: '/admin/volunteers',
                })),
            )
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

  admin: router({
    list: adminProcedure.query(async () => {
      try {
        const conferenceId = await resolveConferenceId()
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
          // OWNERSHIP (#730): a READ of the same unscoped lookup — volunteer
          // applications carry contact details, so scope it like the mutations.
          await requireDocumentInCurrentConference(input.id, 'volunteer')
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
          // OWNERSHIP (#730): `getVolunteerById` is `*[_type == "volunteer" &&
          // _id == $id][0]` — an EXISTENCE check, not an ownership check. Any
          // tenant's volunteer application could be approved or rejected.
          await requireDocumentInCurrentConference(
            input.volunteerId,
            'volunteer',
          )
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

    update: adminProcedure
      .input(UpdateVolunteerDetailsSchema)
      .mutation(async ({ input }) => {
        try {
          const { volunteerId, ...details } = input
          // OWNERSHIP (#730) — see `updateStatus` above. Guard FIRST: below
          // this, `getVolunteerById` is a global by-id read, so guarding after
          // it pulls another tenant's application into the request before
          // refusing to write it (#863).
          await requireDocumentInCurrentConference(volunteerId, 'volunteer')
          const { volunteer, error: fetchError } =
            await getVolunteerById(volunteerId)

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

          const { success, error } = await updateVolunteerDetails(
            volunteerId,
            details,
          )

          if (error || !success) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to update volunteer details',
              cause: error,
            })
          }

          return { success }
        } catch (error) {
          if (error instanceof TRPCError) throw error
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update volunteer details',
            cause: error,
          })
        }
      }),

    sendEmail: adminProcedure
      .input(SendVolunteerEmailSchema)
      .mutation(async ({ input }) => {
        try {
          // OWNERSHIP (#858) — see `updateStatus` above. Unguarded, this read
          // any tenant's volunteer application and mailed its owner. It also
          // makes the `currentConf` fallback below SAFE BY CONSTRUCTION: the
          // volunteer's conference is now the request's conference, so the two
          // sides of that rebuilt object are the same document and cannot
          // disagree on venue, dates, reply address or links.
          await requireDocumentInCurrentConference(
            input.volunteerId,
            'volunteer',
          )
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
              // SAME PRECEDENCE as the `_id`/`title` above, deliberately: this
              // is the key `resolveEmailSender` resolves the Resend account
              // from, so it must follow the identity it accompanies — the
              // VOLUNTEER's conference — not the request's domain. Taking it
              // from `currentConf` would send a volunteer of org A through org
              // B's Resend account whenever B's organizer processes A's
              // volunteer, which `getVolunteerById` (a global by-id fetch) made
              // reachable while this procedure had no ownership guard (#856,
              // #858). The guard above now closes that door — the precedence
              // stays because it is what makes this object's identity coherent
              // regardless, and it must not silently regress if the guard ever
              // moves.
              organization:
                volunteer.conference?.organization ?? currentConf.organization,
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
          // OWNERSHIP (#730) — see `updateStatus` above. Unguarded, this
          // deleted any tenant's volunteer application. Guard FIRST: below
          // this, `getVolunteerById` is a global by-id read, so guarding after
          // it pulls another tenant's application into the request before
          // refusing to delete it (#863).
          await requireDocumentInCurrentConference(
            input.volunteerId,
            'volunteer',
          )
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
  }),
})
