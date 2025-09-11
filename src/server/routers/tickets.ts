/**
 * tRPC Router for Ticket Management
 * Handles ticket target configuration and capacity settings
 */

import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { router, adminProcedure } from '../trpc'
import {
  TicketSettingsUpdateSchema,
  ConferenceIdSchema,
  TicketTargetConfigSchema,
  CreateDiscountCodeSchema,
  GetDiscountsSchema,
  DeleteDiscountCodeSchema,
  GetPaymentDetailsSchema,
} from '../schemas/tickets'
import { clientWrite } from '@/lib/sanity/client'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  createEventDiscount,
  getEventDiscounts,
  deleteEventDiscount,
  fetchEventTickets,
  calculateDiscountUsage,
  fetchOrderPaymentDetails,
  type DiscountUsageStats,
} from '@/lib/tickets/server'
import { fetchAllEventOrderUsers } from '@/lib/tickets/checkin'

/**
 * Update ticket capacity for a conference
 */
async function updateTicketCapacity(conferenceId: string, capacity: number) {
  try {
    const result = await clientWrite
      .patch(conferenceId)
      .set({ ticket_capacity: capacity })
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

/**
 * Update ticket target configuration for a conference
 */
async function updateTicketTargets(
  conferenceId: string,
  targets: {
    enabled: boolean
    sales_start_date?: string
    target_curve?: 'linear' | 'early_push' | 'late_push' | 's_curve'
    milestones?: Array<{
      date: string
      target_percentage: number
      label?: string
    }>
  },
) {
  try {
    const result = await clientWrite
      .patch(conferenceId)
      .set({ ticket_targets: targets })
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

/**
 * Get current ticket settings for a conference
 */
async function getTicketSettings(conferenceId: string) {
  try {
    const query = `*[_type == "conference" && _id == $conferenceId][0]{
      _id,
      ticket_capacity,
      ticket_targets
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
  /**
   * Get ticket settings for a conference
   */
  getSettings: adminProcedure
    .input(ConferenceIdSchema)
    .query(async ({ input }) => {
      const { conferenceId } = input
      return getTicketSettings(conferenceId)
    }),

  /**
   * Update ticket settings (capacity and/or targets)
   */
  updateSettings: adminProcedure
    .input(TicketSettingsUpdateSchema)
    .mutation(async ({ input }) => {
      const { conferenceId, ticket_capacity, ticket_targets } = input

      // Validate conference exists
      await getTicketSettings(conferenceId)

      const updates: Record<string, unknown> = {}

      // Update capacity if provided
      if (ticket_capacity !== undefined) {
        updates.ticket_capacity = ticket_capacity
      }

      // Update targets if provided
      if (ticket_targets !== undefined) {
        updates.ticket_targets = ticket_targets
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

        // Revalidate the admin tickets page to refresh server-side data
        revalidatePath('/admin/tickets')

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

  /**
   * Update only ticket capacity
   */
  updateCapacity: adminProcedure
    .input(
      ConferenceIdSchema.extend({
        capacity: z.number().min(1, 'Capacity must be at least 1'),
      }),
    )
    .mutation(async ({ input }) => {
      const { conferenceId, capacity } = input
      const result = await updateTicketCapacity(conferenceId, capacity)

      // Revalidate the admin tickets page to refresh server-side data
      revalidatePath('/admin/tickets')

      return result
    }),

  /**
   * Update only ticket targets
   */
  updateTargets: adminProcedure
    .input(
      ConferenceIdSchema.extend({
        targets: TicketTargetConfigSchema,
      }),
    )
    .mutation(async ({ input }) => {
      const { conferenceId, targets } = input
      const result = await updateTicketTargets(conferenceId, targets)

      // Revalidate the admin tickets page to refresh server-side data
      revalidatePath('/admin/tickets')

      return result
    }),

  /**
   * Quick enable/disable target tracking
   */
  toggleTargetTracking: adminProcedure
    .input(
      ConferenceIdSchema.extend({
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ input }) => {
      const { conferenceId, enabled } = input

      // Get current settings
      const conference = await getTicketSettings(conferenceId)
      const currentTargets = conference.ticket_targets || {}

      // Update only the enabled flag
      const updatedTargets = {
        ...currentTargets,
        enabled,
      }

      const result = await updateTicketTargets(conferenceId, updatedTargets)

      // Revalidate the admin tickets page to refresh server-side data
      revalidatePath('/admin/tickets')

      return result
    }),

  /**
   * Get available ticket types for an event
   */
  getTicketTypes: adminProcedure.query(async () => {
    try {
      // Get conference data to access checkin event ID
      const { conference, error: conferenceError } =
        await getConferenceForCurrentDomain()

      if (conferenceError || !conference.checkin_event_id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Conference checkin configuration not found',
        })
      }

      const eventId = conference.checkin_event_id
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

  /**
   * Get discount codes for an event
   */
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

  /**
   * Get all discount codes with usage statistics
   */
  getDiscountCodesWithUsage: adminProcedure.query(async () => {
    try {
      // Get conference data to access checkin credentials
      const { conference, error: conferenceError } =
        await getConferenceForCurrentDomain()

      if (
        conferenceError ||
        !conference.checkin_customer_id ||
        !conference.checkin_event_id
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Conference checkin configuration not found',
        })
      }

      // Use conference's checkin event ID
      const customerId = conference.checkin_customer_id
      const eventId = conference.checkin_event_id

      // Always fetch discount codes
      const eventData = await getEventDiscounts(eventId)
      const discounts = eventData.discounts

      // Try to fetch usage statistics using proper customer_id and event_id from conference
      let usageStats: DiscountUsageStats = {}
      let totalTickets = 0

      try {
        const tickets = await fetchEventTickets(customerId, eventId)
        usageStats = calculateDiscountUsage(tickets)
        totalTickets = tickets.length
      } catch (ticketsError) {
        console.warn('Could not fetch tickets for usage stats:', ticketsError)
        // Continue without usage stats - we'll show what we can from the discount definitions
      }

      // Merge discount definitions with usage data (if available)
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
          customerId: conference.checkin_customer_id,
          eventId: conference.checkin_event_id,
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

  /**
   * Create a new discount code
   */
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
        // Check if discount code already exists
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

        // Create the discount code
        const result = await createEventDiscount({
          eventId,
          discountCode,
          numberOfTickets,
          ticketTypes: selectedTicketTypes || [], // Use selected ticket types or empty array for all types
          discountType: 'percentage',
          discountValue: 100, // 100% discount for sponsor tickets
        })

        // Revalidate the discount codes page
        revalidatePath('/admin/tickets/discount')

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

  /**
   * Delete a discount code (placeholder - not supported by Checkin.no API)
   */
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

  /**
   * Get payment details for a specific order
   */
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

  /**
   * Debug: Get raw EventOrderUser data from Checkin API
   */
  debugEventOrderUsers: adminProcedure
    .input(
      z.object({
        eventId: z.number().optional(),
        limit: z.number().min(1).max(1000).default(50),
      }),
    )
    .query(async ({ input }) => {
      try {
        // Get conference data to access checkin event ID and customer ID
        const { conference, error: conferenceError } =
          await getConferenceForCurrentDomain()

        if (
          conferenceError ||
          !conference.checkin_event_id ||
          !conference.checkin_customer_id
        ) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Conference checkin configuration not found',
          })
        }

        const eventId = input.eventId || conference.checkin_event_id
        const customerId = conference.checkin_customer_id

        const eventOrderUsers = await fetchAllEventOrderUsers(
          customerId,
          eventId,
          {
            length: input.limit,
          },
        )

        return {
          success: true,
          data: eventOrderUsers,
          count: eventOrderUsers.length,
          eventId,
          customerId,
          sampleData: eventOrderUsers.slice(0, 3), // First 3 for inspection
        }
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch EventOrderUser debug data',
          cause: error,
        })
      }
    }),

  /**
   * Debug: Get raw EventTicket data from legacy API
   */
  debugEventTickets: adminProcedure
    .input(
      z.object({
        eventId: z.number().optional(),
        limit: z.number().min(1).max(1000).default(50),
      }),
    )
    .query(async ({ input }) => {
      try {
        // Get conference data to access checkin event ID and customer ID
        const { conference, error: conferenceError } =
          await getConferenceForCurrentDomain()

        if (
          conferenceError ||
          !conference.checkin_event_id ||
          !conference.checkin_customer_id
        ) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Conference checkin configuration not found',
          })
        }

        const eventId = input.eventId || conference.checkin_event_id
        const customerId = conference.checkin_customer_id

        const eventTickets = await fetchEventTickets(customerId, eventId)

        // Limit the results
        const limitedTickets = eventTickets.slice(0, input.limit)

        return {
          success: true,
          data: limitedTickets,
          totalCount: eventTickets.length,
          returnedCount: limitedTickets.length,
          eventId,
          customerId,
          sampleData: limitedTickets.slice(0, 3), // First 3 for inspection
        }
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch EventTicket debug data',
          cause: error,
        })
      }
    }),

  /**
   * Debug: Get conference settings and configuration
   */
  debugConferenceConfig: adminProcedure.query(async () => {
    try {
      const { conference, domain, error } =
        await getConferenceForCurrentDomain()

      if (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error.message || 'Conference configuration error',
        })
      }

      return {
        success: true,
        conference: {
          id: conference._id,
          title: conference.title,
          start_date: conference.start_date,
          end_date: conference.end_date,
          checkin_customer_id: conference.checkin_customer_id,
          checkin_event_id: conference.checkin_event_id,
          ticket_capacity: conference.ticket_capacity,
          ticket_targets: conference.ticket_targets,
        },
        domain,
        hasCheckinConfig: !!(
          conference.checkin_customer_id && conference.checkin_event_id
        ),
      }
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch conference debug data',
        cause: error,
      })
    }
  }),

  /**
   * Debug endpoint for ticket data inspection
   */
  getDebugData: adminProcedure.query(async () => {
    try {
      // Get conference data to access checkin credentials
      const {
        conference,
        error: conferenceError,
        domain,
      } = await getConferenceForCurrentDomain()

      if (conferenceError || !conference) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            typeof conferenceError === 'string'
              ? conferenceError
              : conferenceError?.message || 'Conference not found',
        })
      }

      const result = {
        conferenceInfo: {
          id: conference._id,
          title: conference.title,
          start_date: conference.start_date,
          end_date: conference.end_date,
          domain,
          hasCheckinConfig: !!(
            conference.checkin_customer_id && conference.checkin_event_id
          ),
          checkin_customer_id: conference.checkin_customer_id,
          checkin_event_id: conference.checkin_event_id,
          ticket_capacity: conference.ticket_capacity,
          ticket_targets: conference.ticket_targets,
        },
        ticketData: null as {
          totalCount: number
          sampleTicket: object | null
          ticketCategories: string[]
          paidTickets: number
          unpaidTickets: number
          ticketsWithDates: number
          ticketsWithoutDates: number
          priceDataAvailable: number
          rawSamples: object[]
          legacyApiComparison?: object
        } | null,
        transformedData: null as {
          filteredTickets: number
          categories: string[]
          dateRange: { earliest: number; latest: number }
        } | null,
        error: null as string | null,
      }

      // Only fetch ticket data if checkin is configured
      if (conference.checkin_customer_id && conference.checkin_event_id) {
        try {
          const customerId = conference.checkin_customer_id
          const eventId = conference.checkin_event_id

          // Fetch raw ticket data using EventOrderUser (the new API)
          const tickets = await fetchAllEventOrderUsers(customerId, eventId, {
            length: 100, // Limit for debug purposes
          })

          result.ticketData = {
            totalCount: tickets.length,
            sampleTicket: tickets[0] || null,
            ticketCategories: [
              ...new Set(tickets.map((t) => t.ticket?.name).filter(Boolean)),
            ] as string[],
            paidTickets: tickets.filter((t) => t.isPaid).length,
            unpaidTickets: tickets.filter((t) => !t.isPaid).length,
            ticketsWithDates: tickets.filter((t) => t.createdAt).length,
            ticketsWithoutDates: tickets.filter((t) => !t.createdAt).length,
            priceDataAvailable: tickets.filter(
              (t) => t.price && Array.isArray(t.price) && t.price.length > 0,
            ).length,
            rawSamples: tickets.slice(0, 3), // First 3 tickets for detailed inspection
          }

          // Try to also fetch using the old API for comparison
          try {
            const oldTickets = await fetchEventTickets(customerId, eventId)
            if (result.ticketData) {
              result.ticketData.legacyApiComparison = {
                legacyCount: oldTickets.length,
                legacySample: oldTickets[0] || null,
                hasLegacyPricing: oldTickets.filter((t) => t.isPaid).length,
              }
            }
          } catch (legacyError) {
            if (result.ticketData) {
              result.ticketData.legacyApiComparison = {
                error: 'Legacy API not available or failed',
                details:
                  legacyError instanceof Error
                    ? legacyError.message
                    : String(legacyError),
              }
            }
          }

          // Transform data as we do in the chart
          result.transformedData = {
            filteredTickets: tickets.filter((t) => t.isPaid).length,
            categories: [
              ...new Set(tickets.map((t) => t.ticket?.name).filter(Boolean)),
            ] as string[],
            dateRange: {
              earliest: Math.min(
                ...tickets
                  .map((t) => new Date(t.createdAt).getTime())
                  .filter((d) => !isNaN(d)),
              ),
              latest: Math.max(
                ...tickets
                  .map((t) => new Date(t.createdAt).getTime())
                  .filter((d) => !isNaN(d)),
              ),
            },
          }
        } catch (ticketError) {
          result.error =
            ticketError instanceof Error
              ? ticketError.message
              : String(ticketError)
        }
      }

      return result
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch debug data',
        cause: error,
      })
    }
  }),
})
