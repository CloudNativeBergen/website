import { TRPCError } from '@trpc/server'
import { revalidateTag } from 'next/cache'
import { conferenceTag } from '@/lib/cache/tags'
import { router, adminProcedure, resolveConferenceId } from '../trpc'
import {
  TicketSettingsUpdateSchema,
  CreateDiscountCodeSchema,
  GetDiscountsSchema,
  DeleteDiscountCodeSchema,
  GetPaymentDetailsSchema,
  UpdateTicketPageContentSchema,
  UpdateTicketCapacitySchema,
  UpdateTicketTargetsSchema,
  ToggleTargetTrackingSchema,
} from '../schemas/tickets'
import { clientWrite } from '@/lib/sanity/client'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { calculateDiscountUsage } from '@/lib/discounts'
import {
  getTicketingProvider,
  platformCheckinCredentials,
} from '@/lib/tickets/provider'
import type { DiscountUsageStats } from '@/lib/discounts/types'

/** Platform-credentialed ticketing provider for this request. */
function checkin() {
  return getTicketingProvider('checkin', platformCheckinCredentials())
}

/**
 * TENANCY FOR PROVIDER IDS (#730). `checkin()` is built from ONE process-wide
 * credential pair shared by every tenant, so a Checkin `eventId` taken from
 * client input addressed any customer's event — minting 100%-off codes on, or
 * deleting codes from, another tenant's paid ticket sale. These are provider
 * ids, not Sanity ids, so the document guards cannot see them: the event id is
 * therefore DERIVED from the request's own conference, and a client-supplied one
 * is accepted only when it matches.
 *
 * FAILS CLOSED: an unresolvable conference or a conference with no
 * `checkinEventId` refuses.
 */
async function requireCheckinEventId(clientEventId?: number): Promise<number> {
  const { conference, error } = await getConferenceForCurrentDomain()
  if (error || !conference?.checkinEventId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Conference checkin configuration not found',
    })
  }
  const eventId = conference.checkinEventId
  if (clientEventId !== undefined && clientEventId !== eventId) {
    // NOT_FOUND, not FORBIDDEN: the caller is not entitled to learn that another
    // tenant's event id exists.
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'No ticket event with that id for this conference',
    })
  }
  return eventId
}

/**
 * SHORT-TTL MEMO OF ONE EVENT'S ORDER-ID SET (#731 N1).
 *
 * `fetchEventTickets` is `fetchEventTicketsRaw` PLUS a `while (hasMore)`
 * pagination loop at 1000 orders per batch, so an uncached ownership check costs
 * 1 + ⌈orders/1000⌉ upstream GraphQL calls returning the entire attendee list.
 * `platformCheckinCredentials()` is ONE account shared by every tenant, so any
 * authenticated organizer of ANY tenant could loop the payment-details endpoint
 * and throttle ticketing for everyone. That amplification is new in this PR,
 * because the guard is.
 *
 * The memo keys on the event and holds the in-flight PROMISE, so concurrent
 * callers share one enumeration and a burst of misses costs one round-trip
 * rather than one each. Rejections are evicted immediately: a failed read must
 * not be cached into a refusal, and the caller fails closed on it anyway.
 *
 * The TTL is deliberately short. It is a rate limiter, not a data cache — an
 * order created within the window is refused until it expires, which is a modal
 * that needs one reopen, against an availability risk for every tenant.
 */
const ORDER_IDS_TTL_MS = 30_000
const orderIdsCache = new Map<
  string,
  { expiresAt: number; orderIds: Promise<Set<number>> }
>()

function orderIdsForEvent(
  customerId: number,
  eventId: number,
): Promise<Set<number>> {
  const key = `${customerId}:${eventId}`
  const now = Date.now()
  const cached = orderIdsCache.get(key)
  if (cached && cached.expiresAt > now) return cached.orderIds

  const orderIds = checkin()
    .fetchEventTickets({ customerId, eventId })
    .then((tickets) => new Set(tickets.map((ticket) => ticket.order_id)))
  orderIds.catch(() => orderIdsCache.delete(key))
  orderIdsCache.set(key, { expiresAt: now + ORDER_IDS_TTL_MS, orderIds })
  // Keep a long-lived warm instance from growing a map entry per event forever.
  for (const [k, entry] of orderIdsCache) {
    if (entry.expiresAt <= now) orderIdsCache.delete(k)
  }
  return orderIds
}

/** Test seam: drop the memo so a case cannot inherit another's enumeration. */
export function __resetOrderIdCache() {
  orderIdsCache.clear()
}

/**
 * The same posture for an `orderId`: prove the order is one of THIS
 * conference's event's orders before reading its payment/customer details.
 */
async function requireOrderInCurrentEvent(orderId: number): Promise<void> {
  const { conference, error } = await getConferenceForCurrentDomain()
  if (error || !conference?.checkinEventId || !conference?.checkinCustomerId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Conference checkin configuration not found',
    })
  }
  let orderIds: Set<number>
  try {
    orderIds = await orderIdsForEvent(
      conference.checkinCustomerId,
      conference.checkinEventId,
    )
  } catch (cause) {
    // FAIL CLOSED: an unreadable ticket list authorizes nothing.
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'No order with that id for this conference',
      cause,
    })
  }
  if (!orderIds.has(orderId)) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'No order with that id for this conference',
    })
  }
}

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
  admin: router({
    getSettings: adminProcedure.query(async () => {
      const conferenceId = await resolveConferenceId()
      return getTicketSettings(conferenceId)
    }),

    updateSettings: adminProcedure
      .input(TicketSettingsUpdateSchema)
      .mutation(async ({ input }) => {
        const conferenceId = await resolveConferenceId()
        const { ticketCapacity, ticketTargets } = input

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
      .input(UpdateTicketCapacitySchema)
      .mutation(async ({ input }) => {
        const conferenceId = await resolveConferenceId()
        const { capacity } = input
        const result = await updateTicketCapacity(conferenceId, capacity)

        revalidateTag('admin:tickets', 'default')

        return result
      }),

    updateTargets: adminProcedure
      .input(UpdateTicketTargetsSchema)
      .mutation(async ({ input }) => {
        const conferenceId = await resolveConferenceId()
        const { targets } = input
        const result = await updateTicketTargets(conferenceId, targets)

        revalidateTag('admin:tickets', 'default')

        return result
      }),

    toggleTargetTracking: adminProcedure
      .input(ToggleTargetTrackingSchema)
      .mutation(async ({ input }) => {
        const conferenceId = await resolveConferenceId()
        const { enabled } = input

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
        const eventData = await checkin().listDiscounts(eventId)

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
        try {
          // OWNERSHIP (#730): the event id comes from THIS conference, never
          // from the payload. Discount codes are redeemable strings.
          const eventId = await requireCheckinEventId(input.eventId)
          const eventData = await checkin().listDiscounts(eventId)
          return {
            success: true,
            discounts: eventData.discounts,
            count: eventData.discounts.length,
          }
        } catch (error) {
          // Preserve the fail-closed refusal instead of masking it as a 500.
          if (error instanceof TRPCError) throw error
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

        const eventData = await checkin().listDiscounts(eventId)
        const discounts = eventData.discounts

        let usageStats: DiscountUsageStats = {}
        let totalTickets = 0

        try {
          const tickets = await checkin().fetchEventTickets({
            customerId,
            eventId,
          })
          usageStats = calculateDiscountUsage(tickets)
          totalTickets = tickets.length
        } catch (ticketsError) {
          console.warn('Could not fetch tickets for usage stats:', ticketsError)
        }

        const discountsWithUsage = discounts.map((discount) => ({
          ...discount,
          actualUsage: usageStats[
            discount.triggerValue?.toUpperCase() || ''
          ] || {
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
          discountCode,
          numberOfTickets,
          sponsorName,
          tierTitle,
          selectedTicketTypes,
        } = input

        try {
          // OWNERSHIP (#730): this endpoint hardcodes `discountValue: 100`, so
          // an unvalidated `eventId` minted 100%-off codes on ANOTHER tenant's
          // paid ticket sale against the shared platform credential.
          const eventId = await requireCheckinEventId(input.eventId)
          const eventData = await checkin().listDiscounts(eventId)
          const codeExists = eventData.discounts.some(
            (discount) => discount.triggerValue === discountCode,
          )

          if (codeExists) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: `Discount code "${discountCode}" already exists`,
            })
          }

          const result = await checkin().createDiscount({
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
          // OWNERSHIP (#730): unvalidated, this deleted another tenant's live
          // sponsor/partner discount codes.
          const eventId = await requireCheckinEventId(input.eventId)
          const success = await checkin().deleteDiscount(
            eventId,
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
          // OWNERSHIP (#730): `orderId` is a small enumerable integer against a
          // credential shared by every tenant — unvalidated, this read another
          // tenant's customer's payment and order details.
          await requireOrderInCurrentEvent(orderId)
          const paymentDetails =
            await checkin().fetchOrderPaymentDetails(orderId)
          return {
            success: true,
            paymentDetails,
          }
        } catch (error) {
          // Preserve the fail-closed refusal instead of masking it as a 500.
          if (error instanceof TRPCError) throw error
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch payment details',
            cause: error,
          })
        }
      }),

    getPageContent: adminProcedure.query(async () => {
      const conferenceId = await resolveConferenceId()

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
        const conferenceId = await resolveConferenceId()
        const { ticketCustomization, ticketInclusions, ticketFaqs } = input

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

          // Ticket page content belongs to one conference — bust only this tenant.
          revalidateTag(conferenceTag(conferenceId), 'default')

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
  }),
})
