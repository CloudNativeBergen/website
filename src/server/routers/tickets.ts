import { TRPCError } from '@trpc/server'
import { revalidateTag } from 'next/cache'
import { conferenceTag } from '@/lib/cache/tags'
import {
  router,
  adminProcedure,
  requireFeatureNotDenied,
  resolveConferenceId,
} from '../trpc'
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
  resolveTicketingCredentials,
  type TicketingProvider,
} from '@/lib/tickets/provider'
import type { DiscountUsageStats } from '@/lib/discounts/types'

/**
 * This request's ticketing context: a Checkin client, plus the ORGANIZATION
 * whose account that client is authenticated against.
 *
 * `orgId` is not decoration. Checkin `customerId` / `eventId` are numeric ids
 * scoped to ONE account, so they are only unique WITHIN an account — two orgs
 * with their own Checkin accounts can legitimately hold the same pair. Anything
 * keyed on those ids alone (a cache, a memo, a lock) therefore needs the account
 * as part of its key or it will serve one org's data to another. `orgId` is the
 * discriminator to use: it identifies the account 1:1 through
 * `resolveTicketingCredentials`, and unlike the API key it is not a secret, so
 * it is safe in a cache key that may reach a log or a key dump.
 */
interface RequestTicketing {
  /** The owning organization — the ACCOUNT discriminator for any cache key. */
  orgId: string
  provider: TicketingProvider
}

/**
 * The Checkin client for THIS request's conference, credentialed through the
 * per-org seam (`resolveTicketingCredentials`) rather than straight off the
 * platform env.
 *
 * WHY IT MOVED. This router used to build ONE process-wide client from
 * `platformCheckinCredentials()`, which bypassed the org-keyed credential
 * resolution every other ticketing surface goes through — so a tenant with its
 * own provisioned Checkin account was served the platform's account here, and a
 * tenant with no account at all was served it too. Resolution is now keyed on
 * the request conference's owning organization, and a tenant the seam declines
 * to credential is REFUSED instead of borrowing the platform's.
 *
 * The provider is pinned to `'checkin'` on purpose: every procedure below speaks
 * Checkin customer/event ids. A Tito-bound conference has no `checkinEventId`
 * and is already refused by `requireCheckinEventId`.
 *
 * COST: `getConferenceForCurrentDomain` is a `'use cache'` read and
 * `resolveTicketingCredentials` is pure env, so calling this twice in one
 * request costs no extra Sanity round-trip. Procedures that need it more than
 * once still hoist it to one local — one resolution per request reads better and
 * keeps `orgId` in scope for the cache key.
 *
 * FAILS CLOSED: an unresolvable conference, a conference with no owning
 * organization, or an org the seam has no credentials for throws BAD_REQUEST.
 */
async function checkin(): Promise<RequestTicketing> {
  const { conference, error } = await getConferenceForCurrentDomain()
  if (error || !conference?._id) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Conference checkin configuration not found',
    })
  }
  const orgId = conference.organization?._ref
  if (!orgId) {
    // No owner means no account to resolve and no discriminator to key on.
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Conference checkin configuration not found',
    })
  }
  const credentials = await resolveTicketingCredentials(orgId, 'checkin')
  if (!credentials) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Ticketing is not configured for this organization',
    })
  }
  return { orgId, provider: getTicketingProvider('checkin', credentials) }
}

/**
 * TENANCY FOR PROVIDER IDS (#730). Even with per-org credentials, a Checkin
 * `eventId` taken from client input addressed any event the resolved account can
 * reach — minting 100%-off codes on, or deleting codes from, another tenant's
 * paid ticket sale whenever two tenants share an account (as every tenant did
 * before the credential seam above). These are provider ids, not Sanity ids, so
 * the document guards cannot see them: the event id is therefore DERIVED from
 * the request's own conference, and a client-supplied one is accepted only when
 * it matches.
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
 * Every organizer sharing one provider account could loop the payment-details
 * endpoint and throttle ticketing for all of them. That amplification is new in
 * this PR, because the guard is.
 *
 * The memo holds the in-flight PROMISE, so concurrent callers share one
 * enumeration and a burst of misses costs one round-trip rather than one each.
 * Rejections are evicted immediately: a failed read must not be cached into a
 * refusal, and the caller fails closed on it anyway.
 *
 * THE KEY IS ACCOUNT-SCOPED (`orgId:customerId:eventId`). Checkin
 * `customerId`/`eventId` are numeric ids unique only WITHIN one Checkin account,
 * so two orgs holding their own accounts can legitimately carry the same pair.
 * Keyed on the ids alone, the second org would be served the first org's cached
 * order-id set — the same cross-tenant read this router's credential seam
 * closes, defeated one layer up in a process-global `Map`. Unreachable while the
 * platform org is the only credentialed tenant, but reachable the moment a
 * second org is provisioned, which is the state this work builds toward.
 *
 * `orgId` — NOT the API key — is the discriminator: it maps 1:1 to the account
 * through `resolveTicketingCredentials` and is not a secret, so it is safe in a
 * key that can surface in a log or a heap dump.
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
  ticketing: RequestTicketing,
  customerId: number,
  eventId: number,
): Promise<Set<number>> {
  const key = `${ticketing.orgId}:${customerId}:${eventId}`
  const now = Date.now()
  const cached = orderIdsCache.get(key)
  if (cached && cached.expiresAt > now) return cached.orderIds

  const orderIds = ticketing.provider
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
async function requireOrderInCurrentEvent(
  ticketing: RequestTicketing,
  orderId: number,
): Promise<void> {
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
      ticketing,
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

/**
 * THE ORGANIZER-FACING TICKETING API, behind the kill switch (#836).
 *
 * Every procedure in `tickets.admin.*` is an ORGANIZER-VISIBLE OUTPUT of the
 * ticketing feature, so an operator's `enabled: false` override must reach all
 * of them and not merely the pages #834 gated. Before this, an authenticated
 * organizer of a switched-off org could still call the router directly — and
 * `createDiscountCode` / `deleteDiscountCode` still WROTE to that tenant's own
 * provider account. The platform is deliberately agent-facing (`konfctl`, an
 * MCP server), so "only reachable through the API" describes a growing surface.
 *
 * IT IS ONE PROCEDURE, NOT A CHECK PER ENDPOINT, on purpose: the sub-router is
 * ticketing in its entirety (13 procedures today), so the fourteenth inherits
 * the gate by being declared here rather than by somebody remembering to add a
 * line to it.
 *
 * SCOPE, SAID EXACTLY. This refuses only on an ACTIVE explicit deny (see
 * `requireFeatureNotDenied`); an org that was never granted ticketing but has
 * its own credentials keeps working, which is the invariant
 * `@/lib/features/ticketing` rule 2 protects. It also touches nothing outside this sub-router: the
 * ATTENDEE-facing ticket sale and workshop eligibility stay ungated (a deny must
 * not break a sale mid-conference), so do the admin status PROBES, and so does
 * speaker-ticket issuance — which therefore still writes a 100%-off discount
 * into a denied org's vendor account (borderline, low-harm, left knowingly).
 */
const ticketingAdminProcedure = adminProcedure.use(
  requireFeatureNotDenied('ticketing'),
)

export const ticketsRouter = router({
  admin: router({
    getSettings: ticketingAdminProcedure.query(async () => {
      const conferenceId = await resolveConferenceId()
      return getTicketSettings(conferenceId)
    }),

    updateSettings: ticketingAdminProcedure
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

    updateCapacity: ticketingAdminProcedure
      .input(UpdateTicketCapacitySchema)
      .mutation(async ({ input }) => {
        const conferenceId = await resolveConferenceId()
        const { capacity } = input
        const result = await updateTicketCapacity(conferenceId, capacity)

        revalidateTag('admin:tickets', 'default')

        return result
      }),

    updateTargets: ticketingAdminProcedure
      .input(UpdateTicketTargetsSchema)
      .mutation(async ({ input }) => {
        const conferenceId = await resolveConferenceId()
        const { targets } = input
        const result = await updateTicketTargets(conferenceId, targets)

        revalidateTag('admin:tickets', 'default')

        return result
      }),

    toggleTargetTracking: ticketingAdminProcedure
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

    getTicketTypes: ticketingAdminProcedure.query(async () => {
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
        const { provider } = await checkin()
        const eventData = await provider.listDiscounts(eventId)

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

    getDiscountCodes: ticketingAdminProcedure
      .input(GetDiscountsSchema)
      .query(async ({ input }) => {
        try {
          // OWNERSHIP (#730): the event id comes from THIS conference, never
          // from the payload. Discount codes are redeemable strings.
          const eventId = await requireCheckinEventId(input.eventId)
          const { provider } = await checkin()
          const eventData = await provider.listDiscounts(eventId)
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

    getDiscountCodesWithUsage: ticketingAdminProcedure.query(async () => {
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

        // ONE resolution for both provider calls below.
        const { provider } = await checkin()
        const eventData = await provider.listDiscounts(eventId)
        const discounts = eventData.discounts

        let usageStats: DiscountUsageStats = {}
        let totalTickets = 0

        try {
          const tickets = await provider.fetchEventTickets({
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

    createDiscountCode: ticketingAdminProcedure
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
          // ONE resolution for the existence check and the create below.
          const { provider } = await checkin()
          const eventData = await provider.listDiscounts(eventId)
          const codeExists = eventData.discounts.some(
            (discount) => discount.triggerValue === discountCode,
          )

          if (codeExists) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: `Discount code "${discountCode}" already exists`,
            })
          }

          const result = await provider.createDiscount({
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

    deleteDiscountCode: ticketingAdminProcedure
      .input(DeleteDiscountCodeSchema)
      .mutation(async ({ input }) => {
        try {
          // OWNERSHIP (#730): unvalidated, this deleted another tenant's live
          // sponsor/partner discount codes.
          const eventId = await requireCheckinEventId(input.eventId)
          const { provider } = await checkin()
          const success = await provider.deleteDiscount(
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

    getPaymentDetails: ticketingAdminProcedure
      .input(GetPaymentDetailsSchema)
      .query(async ({ input }) => {
        const { orderId } = input

        try {
          // OWNERSHIP (#730): `orderId` is a small enumerable integer against a
          // credential shared by every tenant — unvalidated, this read another
          // tenant's customer's payment and order details.
          // ONE resolution: the ownership enumeration and the read that
          // follows MUST run against the SAME account, or the guard proves
          // nothing about the order it just admitted.
          const ticketing = await checkin()
          await requireOrderInCurrentEvent(ticketing, orderId)
          const paymentDetails =
            await ticketing.provider.fetchOrderPaymentDetails(orderId)
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

    getPageContent: ticketingAdminProcedure.query(async () => {
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

    updatePageContent: ticketingAdminProcedure
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
