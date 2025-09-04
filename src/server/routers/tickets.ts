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
} from '../schemas/tickets'
import { clientWrite } from '@/lib/sanity/client'

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
})
