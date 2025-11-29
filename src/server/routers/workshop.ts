import { z } from 'zod'
import { router, publicProcedure, adminProcedure } from '@/server/trpc'
import { TRPCError } from '@trpc/server'
import { revalidateTag } from 'next/cache'
import { clientWrite } from '@/lib/sanity/client'
import {
  workshopListInputSchema,
  workshopAvailabilitySchema,
  workshopSignupInputSchema,
  workshopSignupsByUserSchema,
  workshopSignupsByWorkshopSchema,
  cancelWorkshopSignupSchema,
  confirmWorkshopSignupSchema,
  updateWorkshopCapacitySchema,
  workshopSignupFiltersSchema,
  batchConfirmSignupsSchema,
  batchCancelSignupsSchema,
} from '@/server/schemas/workshop'
import {
  checkWorkshopCapacity,
  verifyWorkshopBelongsToConference,
  getWorkshopSignups,
  createWorkshopSignup,
  cancelWorkshopSignup,
  confirmWorkshopSignup,
  updateWorkshopCapacity,
  getWorkshopSignupsByWorkshop,
  getAllWorkshopSignups,
  getWorkshopStatistics,
} from '@/lib/workshop/sanity'
import { getWorkshops } from '@/lib/proposal/data/sanity'
import { Status } from '@/lib/proposal/types'
import { sendBasicWorkshopConfirmation } from '@/lib/email/workshop'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { WorkshopSignupStatus } from '@/lib/workshop/types'

export const workshopRouter = router({
  listWorkshops: publicProcedure
    .input(workshopListInputSchema)
    .query(async ({ input }) => {
      try {
        const { workshops, workshopsError } = await getWorkshops({
          conferenceId: input.conferenceId,
          statuses: [Status.confirmed],
          includeScheduleInfo: true,
        })

        if (workshopsError) {
          throw workshopsError
        }

        return {
          success: true,
          data: workshops,
          count: workshops.length,
        }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch workshops',
          cause: error,
        })
      }
    }),

  getWorkshopAvailability: publicProcedure
    .input(workshopAvailabilitySchema)
    .query(async ({ input }) => {
      try {
        const belongs = await verifyWorkshopBelongsToConference(
          input.workshopId,
          input.conferenceId,
        )

        if (!belongs) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Workshop not found for this conference',
          })
        }

        const capacity = await checkWorkshopCapacity(input.workshopId)

        return {
          success: true,
          data: {
            workshopId: input.workshopId,
            available: capacity.available,
            capacity: capacity.capacity,
            signups: capacity.signups,
            isAvailable: capacity.available > 0,
          },
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to check workshop availability',
          cause: error,
        })
      }
    }),

  getUserSignups: publicProcedure
    .input(workshopSignupsByUserSchema)
    .query(async ({ input, ctx }) => {
      try {
        const sessionUser = ctx.session?.user as
          | { id?: string; sub?: string }
          | undefined
        const userWorkOSId =
          input.userWorkOSId || sessionUser?.id || sessionUser?.sub

        if (!userWorkOSId || !input.conferenceId) {
          return {
            success: true,
            data: [],
            count: 0,
          }
        }

        const signups = await getWorkshopSignups(
          userWorkOSId,
          input.conferenceId,
          'status' in input && typeof input.status === 'string'
            ? input.status
            : undefined,
        )

        return {
          success: true,
          data: signups,
          count: signups.length,
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch user signups',
          cause: error,
        })
      }
    }),

  signupForWorkshop: publicProcedure
    .input(workshopSignupInputSchema)
    .mutation(async ({ input }) => {
      try {
        if (!input.userWorkOSId || !input.userEmail || !input.userName) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'User information is required',
          })
        }

        const { conference } = await getConferenceForCurrentDomain({})

        if (!conference) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Conference not found',
          })
        }

        const now = new Date()
        if (
          conference.workshop_registration_start &&
          new Date(conference.workshop_registration_start) > now
        ) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: `Workshop registration opens on ${new Date(conference.workshop_registration_start).toLocaleDateString()}`,
          })
        }

        if (
          conference.workshop_registration_end &&
          new Date(conference.workshop_registration_end) < now
        ) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Workshop registration has closed',
          })
        }

        const belongs = await verifyWorkshopBelongsToConference(
          input.workshop._ref,
          input.conference._ref,
        )

        if (!belongs) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Workshop does not belong to the specified conference',
          })
        }

        const existingSignups = await getWorkshopSignups(
          input.userWorkOSId,
          input.conference._ref,
          undefined,
        )

        const alreadySignedUp = existingSignups.some(
          (signup) => signup.workshop._ref === input.workshop._ref,
        )

        if (alreadySignedUp) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'You are already signed up for this workshop',
          })
        }

        const capacity = await checkWorkshopCapacity(input.workshop._ref)
        const isWaitlist = !capacity || capacity.available <= 0

        const signup = await createWorkshopSignup({
          ...input,
          status: isWaitlist
            ? WorkshopSignupStatus.WAITLIST
            : WorkshopSignupStatus.CONFIRMED,
        })

        await sendBasicWorkshopConfirmation({
          userEmail: signup.userEmail,
          userName: signup.userName,
          status: signup.status,
          conference: conference || undefined,
          workshopTitle: signup.workshop?.title ?? input.workshop._ref,
          workshopDate: (signup.workshop as { date?: string })?.date,
          workshopTime: (signup.workshop as { startTime?: string })?.startTime,
        }).catch(() => {})

        revalidateTag('content:workshops', 'default')
        revalidateTag('admin:workshops', 'default')

        return {
          success: true,
          data: signup,
          message: isWaitlist
            ? 'Successfully added to workshop waitlist'
            : 'Successfully signed up for workshop',
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create workshop signup',
          cause: error,
        })
      }
    }),

  cancelSignup: publicProcedure
    .input(cancelWorkshopSignupSchema)
    .mutation(async ({ input }) => {
      try {
        const signups = await getAllWorkshopSignups({
          signupIds: [input.signupId],
        })

        if (signups.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Signup not found',
          })
        }

        await cancelWorkshopSignup(input.signupId)

        revalidateTag('content:workshops', 'default')

        return {
          success: true,
          message: 'Workshop signup cancelled successfully',
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to cancel workshop signup',
          cause: error,
        })
      }
    }),

  getAllSignups: adminProcedure
    .input(workshopSignupFiltersSchema)
    .query(async ({ input }) => {
      try {
        const signups = await getAllWorkshopSignups({
          conferenceId: input.conferenceId,
          workshopId: input.workshopId,
          status: input.status as WorkshopSignupStatus | undefined,
          page: input.page,
          pageSize: input.pageSize,
        })

        const allSignups = await getAllWorkshopSignups({
          conferenceId: input.conferenceId,
          workshopId: input.workshopId,
          status: input.status as WorkshopSignupStatus | undefined,
        })

        return {
          success: true,
          data: signups,
          pagination: {
            page: input.page || 1,
            pageSize: input.pageSize || 50,
            total: allSignups.length,
            totalPages: Math.ceil(allSignups.length / (input.pageSize || 50)),
          },
        }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch workshop signups',
          cause: error,
        })
      }
    }),

  getSignupsByWorkshop: adminProcedure
    .input(workshopSignupsByWorkshopSchema)
    .query(async ({ input }) => {
      try {
        const signups = await getWorkshopSignupsByWorkshop(
          input.workshopId,
          input.status as WorkshopSignupStatus | undefined,
        )

        return {
          success: true,
          data: signups,
          count: signups.length,
        }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch workshop signups',
          cause: error,
        })
      }
    }),

  confirmSignup: adminProcedure
    .input(confirmWorkshopSignupSchema)
    .mutation(async ({ input }) => {
      try {
        const signups = await getAllWorkshopSignups({
          signupIds: [input.signupId],
        })

        if (signups.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Signup not found',
          })
        }

        const signup = signups[0]
        const wasWaitlisted = signup.status === 'waitlist'

        await confirmWorkshopSignup(input.signupId)

        if (input.sendEmail && wasWaitlisted) {
          const { conference } = await getConferenceForCurrentDomain({})
          if (conference) {
            await sendBasicWorkshopConfirmation({
              userEmail: signup.userEmail,
              userName: signup.userName,
              status: 'confirmed',
              conference,
              workshopTitle: signup.workshop?.title ?? 'Workshop',
              workshopDate: (signup.workshop as { date?: string })?.date,
              workshopTime: (signup.workshop as { startTime?: string })
                ?.startTime,
            }).catch(() => {})
          }
        }

        revalidateTag('admin:workshops', 'default')
        revalidateTag('content:workshops', 'default')

        return {
          success: true,
          message: wasWaitlisted
            ? 'Participant confirmed and notification email sent'
            : 'Workshop signup confirmed successfully',
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to confirm workshop signup',
          cause: error,
        })
      }
    }),

  updateWorkshopCapacity: adminProcedure
    .input(updateWorkshopCapacitySchema)
    .mutation(async ({ input }) => {
      try {
        const current = await checkWorkshopCapacity(input.workshopId)
        const signupCount = current.signups

        if (input.capacity < signupCount) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Cannot reduce capacity below current signup count (${signupCount})`,
          })
        }

        const oldCapacity = current.capacity
        const updatedWorkshop = await updateWorkshopCapacity(
          input.workshopId,
          input.capacity,
        )

        const capacityIncrease = input.capacity - oldCapacity
        let promotedCount = 0

        if (capacityIncrease > 0) {
          const waitlistSignups = await getWorkshopSignupsByWorkshop(
            input.workshopId,
            'waitlist',
          )

          const signupsToPromote = waitlistSignups
            .sort((a, b) => {
              const dateA = new Date(a.signedUpAt || a._createdAt).getTime()
              const dateB = new Date(b.signedUpAt || b._createdAt).getTime()
              return dateA - dateB
            })
            .slice(0, capacityIncrease)

          const { conference } = await getConferenceForCurrentDomain({})

          const promotionResults = await Promise.allSettled(
            signupsToPromote.map(async (signup) => {
              await confirmWorkshopSignup(signup._id)

              if (conference) {
                await sendBasicWorkshopConfirmation({
                  userEmail: signup.userEmail,
                  userName: signup.userName,
                  status: 'confirmed',
                  conference,
                  workshopTitle: signup.workshop?.title ?? 'Workshop',
                  workshopDate: (signup.workshop as { date?: string })?.date,
                  workshopTime: (signup.workshop as { startTime?: string })
                    ?.startTime,
                })
              }

              return signup
            }),
          )

          promotedCount = promotionResults.filter(
            (r) => r.status === 'fulfilled',
          ).length
        }

        revalidateTag('content:workshops', 'default')
        revalidateTag('admin:workshops', 'default')

        return {
          success: true,
          data: updatedWorkshop,
          message:
            promotedCount > 0
              ? `Workshop capacity updated successfully. ${promotedCount} participant${promotedCount === 1 ? '' : 's'} promoted from waitlist.`
              : 'Workshop capacity updated successfully',
          promotedCount,
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update workshop capacity',
          cause: error,
        })
      }
    }),

  batchConfirmSignups: adminProcedure
    .input(batchConfirmSignupsSchema)
    .mutation(async ({ input }) => {
      try {
        const signups = await getAllWorkshopSignups({
          signupIds: input.signupIds,
        })

        const { conference } = await getConferenceForCurrentDomain({})

        const results = await Promise.allSettled(
          signups.map(async (signup) => {
            const wasWaitlisted = signup.status === 'waitlist'
            await confirmWorkshopSignup(signup._id)

            if (input.sendEmails && wasWaitlisted && conference) {
              await sendBasicWorkshopConfirmation({
                userEmail: signup.userEmail,
                userName: signup.userName,
                status: 'confirmed',
                conference,
                workshopTitle: signup.workshop?.title ?? 'Workshop',
                workshopDate: (signup.workshop as { date?: string })?.date,
                workshopTime: (signup.workshop as { startTime?: string })
                  ?.startTime,
              }).catch(() => {})
            }

            return signup
          }),
        )

        const succeeded = results.filter((r) => r.status === 'fulfilled').length
        const failed = results.filter((r) => r.status === 'rejected').length

        revalidateTag('admin:workshops', 'default')
        revalidateTag('content:workshops', 'default')

        return {
          success: true,
          message: `Confirmed ${succeeded} signup${succeeded === 1 ? '' : 's'}${failed > 0 ? `, ${failed} failed` : ''}`,
          results: {
            succeeded,
            failed,
            total: input.signupIds.length,
          },
        }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to batch confirm signups',
          cause: error,
        })
      }
    }),

  batchCancelSignups: adminProcedure
    .input(batchCancelSignupsSchema)
    .mutation(async ({ input }) => {
      try {
        const results = await Promise.allSettled(
          input.signupIds.map((id) => cancelWorkshopSignup(id)),
        )

        const succeeded = results.filter((r) => r.status === 'fulfilled').length
        const failed = results.filter((r) => r.status === 'rejected').length

        revalidateTag('admin:workshops', 'default')
        revalidateTag('content:workshops', 'default')

        return {
          success: true,
          message: `Cancelled ${succeeded} signups${failed > 0 ? `, ${failed} failed` : ''}`,
          results: {
            succeeded,
            failed,
            total: input.signupIds.length,
          },
        }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to batch cancel signups',
          cause: error,
        })
      }
    }),

  deleteSignup: adminProcedure
    .input(z.object({ signupId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const { deleteWorkshopSignup } = await import('@/lib/workshop/sanity')

        await deleteWorkshopSignup(input.signupId)

        revalidateTag('admin:workshops', 'default')
        revalidateTag('content:workshops', 'default')

        return {
          success: true,
          message: 'Signup deleted successfully',
        }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete signup',
          cause: error,
        })
      }
    }),

  getWorkshopSummary: adminProcedure
    .input(z.object({ conferenceId: z.string() }))
    .query(async ({ input }) => {
      try {
        const statistics = await getWorkshopStatistics(input.conferenceId)

        return {
          success: true,
          data: statistics,
          generatedAt: new Date().toISOString(),
        }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate workshop summary',
          cause: error,
        })
      }
    }),

  manualSignupForWorkshop: adminProcedure
    .input(workshopSignupInputSchema)
    .mutation(async ({ input }) => {
      try {
        const belongs = await verifyWorkshopBelongsToConference(
          input.workshop._ref,
          input.conference._ref,
        )

        if (!belongs) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Workshop does not belong to the specified conference',
          })
        }

        const capacity = await checkWorkshopCapacity(input.workshop._ref)
        if (!capacity || capacity.available <= 0) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Workshop is full',
          })
        }

        const existingSignups = await getWorkshopSignups(
          input.userWorkOSId,
          input.conference._ref,
          undefined,
        )

        const alreadySignedUp = existingSignups.some(
          (signup) => signup.workshop._ref === input.workshop._ref,
        )

        if (alreadySignedUp) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'User is already signed up for this workshop',
          })
        }

        const signup = await createWorkshopSignup(input)

        await sendBasicWorkshopConfirmation({
          userEmail: signup.userEmail,
          userName: signup.userName,
          workshopTitle: signup.workshop?.title ?? input.workshop._ref,
          workshopDate: (signup.workshop as { date?: string })?.date,
          workshopTime: (signup.workshop as { startTime?: string })?.startTime,
        }).catch(() => {})

        revalidateTag('content:workshops', 'default')
        revalidateTag('admin:workshops', 'default')

        return {
          success: true,
          data: signup,
          message: 'Successfully added participant to workshop',
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to add participant to workshop',
          cause: error,
        })
      }
    }),

  updateRegistrationTimes: adminProcedure
    .input(
      z.object({
        conferenceId: z.string().min(1, 'Conference ID is required'),
        startDate: z.string().nullable(),
        endDate: z.string().nullable(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const { conferenceId, startDate, endDate } = input

        // Validate dates
        if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'End date must be after start date',
          })
        }

        await clientWrite
          .patch(conferenceId)
          .set({
            workshop_registration_start: startDate
              ? new Date(startDate).toISOString()
              : null,
            workshop_registration_end: endDate
              ? new Date(endDate).toISOString()
              : null,
          })
          .commit()

        revalidateTag('admin:settings', 'default')
        revalidateTag(`sanity:conference-${conferenceId}`, 'default')

        return {
          success: true,
          message: 'Workshop registration times updated successfully',
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update workshop registration times',
          cause: error,
        })
      }
    }),
})
