import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { revalidateTag } from 'next/cache'
import { router, adminProcedure } from '../trpc'
import {
  TicketSettingsUpdateSchema,
  ConferenceIdSchema,
  SalesTargetConfigSchema,
  CreateDiscountCodeSchema,
  GetDiscountsSchema,
  DeleteDiscountCodeSchema,
  GetPaymentDetailsSchema,
  UpdateTicketPageContentSchema,
} from '../schemas/tickets'
import { clientWrite } from '@/lib/sanity/client'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  createEventDiscount,
  getEventDiscounts,
  deleteEventDiscount,
  calculateDiscountUsage,
} from '@/lib/discounts'
import { fetchEventTickets, fetchOrderPaymentDetails } from '@/lib/tickets/api'
import type { DiscountUsageStats } from '@/lib/discounts/types'

async function updateTicketCapacity(conferenceId: string, capacity: number) {
  try {
    const result = await clientWrite
      .patch(conferenceId)
      .set({ ticketCapacity: capacity })
      .commit()

    return result
  } catch (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to update ticket capacity',
      cause: error,
    })
  }
}

async function updateTicketTargets(
  conferenceId: string,
  targets: {
    enabled: boolean
    salesStartDate: string
    targetCurve: 'linear' | 'early_push' | 'late_push' | 's_curve'
    milestones: Array<{
      date: string
      targetPercentage: number
      label: string
    }>
  },
) {
  try {
    const result = await clientWrite
      .patch(conferenceId)
      .set({ ticketTargets: targets })
      .commit()

    return result
  } catch (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to update ticket targets',
      cause: error,
    })
  }
}

async function getTicketSettings(conferenceId: string) {
  try {
    const query = `*[_type == "conference" && _id == $conferenceId][0]{
      _id,
      ticketCapacity,
      ticketTargets
    }`

    const conference = await clientWrite.fetch(query, { conferenceId })

    if (!conference) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Conference not found',
      })
    }

    return conference
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error
    }
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to fetch ticket settings',
      cause: error,
    })
  }
}

export const ticketsRouter = router({
  getSettings: adminProcedure
    .input(ConferenceIdSchema)
    .query(async ({ input }) => {
      const { conferenceId } = input
      return getTicketSettings(conferenceId)
    }),

  updateSettings: adminProcedure
    .input(TicketSettingsUpdateSchema)
    .mutation(async ({ input }) => {
      const { conferenceId, ticketCapacity, ticketTargets } = input

      await getTicketSettings(conferenceId)

      const updates: Record<string, unknown> = {}

      if (ticketCapacity !== undefined) {
        updates.ticketCapacity = ticketCapacity
      }

      if (ticketTargets !== undefined) {
        updates.ticketTargets = ticketTargets
      }

      if (Object.keys(updates).length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No updates provided',
        })
      }

      try {
        const result = await clientWrite
          .patch(conferenceId)
          .set(updates)
          .commit()

        revalidateTag('admin:tickets', 'default')

        return {
          success: true,
          updated: result,
        }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update ticket settings',
          cause: error,
        })
      }
    }),

  updateCapacity: adminProcedure
    .input(
      ConferenceIdSchema.extend({
        capacity: z.number().min(1, 'Capacity must be at least 1'),
      }),
    )
    .mutation(async ({ input }) => {
      const { conferenceId, capacity } = input
      const result = await updateTicketCapacity(conferenceId, capacity)

      revalidateTag('admin:tickets', 'default')

      return result
    }),

  updateTargets: adminProcedure
    .input(
      ConferenceIdSchema.extend({
        targets: SalesTargetConfigSchema,
      }),
    )
    .mutation(async ({ input }) => {
      const { conferenceId, targets } = input
      const result = await updateTicketTargets(conferenceId, targets)

      revalidateTag('admin:tickets', 'default')

      return result
    }),

  toggleTargetTracking: adminProcedure
    .input(
      ConferenceIdSchema.extend({
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ input }) => {
      const { conferenceId, enabled } = input

      const conference = await getTicketSettings(conferenceId)
      const currentTargets = conference.ticketTargets || {}

      const updatedTargets = {
        ...currentTargets,
        enabled,
      }

      const result = await updateTicketTargets(conferenceId, updatedTargets)

      revalidateTag('admin:tickets', 'default')

      return result
    }),

  getTicketTypes: adminProcedure.query(async () => {
    try {
      const { conference, error: conferenceError } =
        await getConferenceForCurrentDomain()

      if (conferenceError || !conference.checkinEventId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Conference checkin configuration not found',
        })
      }

      const eventId = conference.checkinEventId
      const eventData = await getEventDiscounts(eventId)

      return {
        success: true,
        ticketTypes: eventData.ticketTypes,
        count: eventData.ticketTypes.length,
        eventId,
      }
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch ticket types',
        cause: error,
      })
    }
  }),

  getDiscountCodes: adminProcedure
    .input(GetDiscountsSchema)
    .query(async ({ input }) => {
      const { eventId } = input

      try {
        const eventData = await getEventDiscounts(eventId)
        return {
          success: true,
          discounts: eventData.discounts,
          count: eventData.discounts.length,
        }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch discount codes',
          cause: error,
        })
      }
    }),

  getDiscountCodesWithUsage: adminProcedure.query(async () => {
    try {
      const { conference, error: conferenceError } =
        await getConferenceForCurrentDomain()

      if (
        conferenceError ||
        !conference.checkinCustomerId ||
        !conference.checkinEventId
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Conference checkin configuration not found',
        })
      }

      const customerId = conference.checkinCustomerId
      const eventId = conference.checkinEventId

      const eventData = await getEventDiscounts(eventId)
      const discounts = eventData.discounts

      let usageStats: DiscountUsageStats = {}
      let totalTickets = 0

      try {
        const tickets = await fetchEventTickets(customerId, eventId)
        usageStats = calculateDiscountUsage(tickets)
        totalTickets = tickets.length
      } catch (ticketsError) {
        console.warn('Could not fetch tickets for usage stats:', ticketsError)
      }

      const discountsWithUsage = discounts.map((discount) => ({
        ...discount,
        actualUsage: usageStats[discount.triggerValue?.toUpperCase() || ''] || {
          usageCount: 0,
          ticketIds: [],
          totalValue: 0,
        },
      }))

      return {
        success: true,
        discounts: discountsWithUsage,
        ticketTypes: eventData.ticketTypes,
        usageStats,
        totalTickets,
        count: discounts.length,
        hasUsageData: Object.keys(usageStats).length > 0,
        conferenceInfo: {
          customerId: conference.checkinCustomerId,
          eventId: conference.checkinEventId,
          title: conference.title,
        },
      }
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch discount codes with usage',
        cause: error,
      })
    }
  }),

  createDiscountCode: adminProcedure
    .input(CreateDiscountCodeSchema)
    .mutation(async ({ input }) => {
      const {
        eventId,
        discountCode,
        numberOfTickets,
        sponsorName,
        tierTitle,
        selectedTicketTypes,
      } = input

      try {
        const eventData = await getEventDiscounts(eventId)
        const codeExists = eventData.discounts.some(
          (discount) => discount.triggerValue === discountCode,
        )

        if (codeExists) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Discount code "${discountCode}" already exists`,
          })
        }

        const result = await createEventDiscount({
          eventId,
          discountCode,
          numberOfTickets,
          ticketTypes: selectedTicketTypes || [],
          discountType: 'percentage',
          discountValue: 100,
        })

        revalidateTag('admin:tickets', 'default')

        return {
          success: true,
          discountCode,
          result,
          message: `Created discount code "${discountCode}" for ${sponsorName}${tierTitle ? ` (${tierTitle} tier)` : ''} with ${numberOfTickets} tickets`,
        }
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to create discount code',
          cause: error,
        })
      }
    }),

  deleteDiscountCode: adminProcedure
    .input(DeleteDiscountCodeSchema)
    .mutation(async ({ input }) => {
      try {
        const success = await deleteEventDiscount(
          input.eventId,
          input.discountCode,
        )

        if (!success) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to delete discount code',
          })
        }

        return { success: true }
      } catch (error) {
        console.error('Error deleting discount code:', error)

        if (error instanceof TRPCError) {
          throw error
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to delete discount code',
        })
      }
    }),

  getPaymentDetails: adminProcedure
    .input(GetPaymentDetailsSchema)
    .query(async ({ input }) => {
      const { orderId } = input

      try {
        const paymentDetails = await fetchOrderPaymentDetails(orderId)
        return {
          success: true,
          paymentDetails,
        }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch payment details',
          cause: error,
        })
      }
    }),

  getPageContent: adminProcedure
    .input(ConferenceIdSchema)
    .query(async ({ input }) => {
      const { conferenceId } = input

      try {
        const query = `*[_type == "conference" && _id == $conferenceId][0]{
          _id,
          ticketCustomization,
          ticketInclusions,
          ticketFaqs,
          vanityMetrics
        }`

        const conference = await clientWrite.fetch(query, { conferenceId })

        if (!conference) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Conference not found',
          })
        }

        return conference
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch ticket page content',
          cause: error,
        })
      }
    }),

  updatePageContent: adminProcedure
    .input(UpdateTicketPageContentSchema)
    .mutation(async ({ input }) => {
      const {
        conferenceId,
        ticketCustomization,
        ticketInclusions,
        ticketFaqs,
      } = input

      const updates: Record<string, unknown> = {}

      if (ticketCustomization !== undefined) {
        updates.ticketCustomization = ticketCustomization
      }

      if (ticketInclusions !== undefined) {
        updates.ticketInclusions = ticketInclusions
      }

      if (ticketFaqs !== undefined) {
        updates.ticketFaqs = ticketFaqs
      }

      if (Object.keys(updates).length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No updates provided',
        })
      }

      try {
        const result = await clientWrite
          .patch(conferenceId)
          .set(updates)
          .commit()

        revalidateTag('content:tickets', 'default')

        return {
          success: true,
          updated: result,
        }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update ticket page content',
          cause: error,
        })
      }
    }),
})
