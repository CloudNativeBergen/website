import { checkinQuery, checkinMutation } from './graphql-client'
import type {
  EventTicket,
  CheckinPayOrder,
  GroupedOrder,
  EventDiscount,
  EventDiscountWithUsage,
  TicketType,
  CreateEventDiscountInput,
  DiscountUsageStats,
  EventTicketsResponse,
  CheckinPayOrderResponse,
  EventDiscountsResponse,
  CreateEventDiscountResponse,
  DeleteEventDiscountResponse,
  ValidateDiscountCodeResponse,
} from './types'

// Re-export types for convenience
export type {
  EventTicket,
  CheckinPayOrder,
  GroupedOrder,
  EventDiscount,
  EventDiscountWithUsage,
  TicketType,
  DiscountUsageStats,
}

export async function getEventDiscounts(
  eventId: number,
): Promise<{ discounts: EventDiscount[]; ticketTypes: TicketType[] }> {
  if (!eventId || eventId <= 0) {
    throw new Error('Valid event ID is required')
  }

  try {
    const query = `
      query findEventByIdQuery($id: Int!) {
        findEventById(id: $id) {
          id
          tickets {
            id
            name
            description
          }
          settings {
            discounts {
              trigger
              triggerValue
              type
              value
              affects
              affectsValue
              includeBooking
              modes
              tickets
              ticketsOnly
              times
              timesTotal
              startsAt
              stopsAt
            }
          }
        }
      }
    `

    const variables = { id: eventId }
    const responseData = await checkinQuery<EventDiscountsResponse>(
      query,
      variables,
    )

    const eventData = responseData.findEventById
    if (!eventData) {
      throw new Error(`Event with ID ${eventId} not found`)
    }

    return {
      discounts: eventData.settings?.discounts || [],
      ticketTypes: eventData.tickets || [],
    }
  } catch (error) {
    // Enhanced error context for debugging
    const errorMessage = error instanceof Error ? error.message : String(error)

    console.error('Failed to fetch event discounts:', {
      eventId,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    })

    // Check for authorization errors and provide helpful context
    if (errorMessage.toLowerCase().includes('authorize')) {
      throw new Error(
        `Access denied to event ${eventId}. This usually means:\n` +
          `1. The API credentials don't have access to this event\n` +
          `2. The event ID ${eventId} is incorrect or doesn't exist\n` +
          `3. The event belongs to a different organization\n` +
          `\nPlease verify the checkin_event_id in your conference settings.`,
      )
    }

    // Re-throw with additional context for other errors
    if (error instanceof Error) {
      throw new Error(
        `Failed to fetch discounts for event ${eventId}: ${error.message}`,
      )
    }
    throw error
  }
}

export async function createEventDiscount(
  input: CreateEventDiscountInput,
): Promise<EventDiscount> {
  const { eventId, discountCode, numberOfTickets, ticketTypes } = input

  // Format ticket types for GraphQL - if empty array, it means all ticket types are eligible
  const ticketsParam =
    ticketTypes.length > 0
      ? `[${ticketTypes.map((id) => id).join(', ')}]` // Remove quotes to pass as integers
      : '[]'

  const mutation = `
    mutation CreateEventDiscount {
      createEventDiscount(
        eventId: ${eventId}
        input: {
          trigger: coupon
          triggerValue: "${discountCode}"
          value: "100"
          affects: total
          affectsValue: 100
          includeBooking: false
          modes: default
          tickets: ${ticketsParam}
          ticketsOnly: true
          timesTotal: ${numberOfTickets}
          type: percent
        }
      ) {
        success
      }
    }
  `

  const responseData =
    await checkinMutation<CreateEventDiscountResponse>(mutation)

  // Check if the mutation was successful
  const result = responseData.createEventDiscount
  if (!result.success) {
    throw new Error('Failed to create discount code')
  }

  // Return a properly typed object since the mutation returns success/message, not the discount object
  return {
    trigger: 'coupon',
    type: 'percent',
    value: '100',
    triggerValue: discountCode,
    affects: 'total',
    includeBooking: false,
    affectsValue: '100',
    modes: ['default'],
    tickets: ticketTypes,
    ticketsOnly: true,
    times: 0,
    timesTotal: numberOfTickets,
  }
}

export async function deleteEventDiscount(
  eventId: number,
  discountCode: string,
): Promise<boolean> {
  const mutation = `
    mutation DeleteEventDiscount($eventId: Int!, $id: String!) {
      deleteEventDiscount(eventId: $eventId, id: $id) {
        success
      }
    }
  `

  // The ID format appears to be "coupon-{discountCode}"
  const discountId = `coupon-${discountCode}`
  const variables = { eventId, id: discountId }

  const responseData = await checkinMutation<DeleteEventDiscountResponse>(
    mutation,
    variables,
  )

  const result = responseData.deleteEventDiscount
  return result.success
}

export async function fetchEventTickets(
  customerId: number,
  eventId: number,
): Promise<EventTicket[]> {
  if (!customerId || customerId <= 0) {
    throw new Error('Valid customer ID is required')
  }
  if (!eventId || eventId <= 0) {
    throw new Error('Valid event ID is required')
  }

  const query = `
    query FetchEventTickets($customerId: Int!, $eventId: Int!) {
      eventTickets(customer_id: $customerId, id: $eventId) {
        id
        order_id
        category
        customer_name
        sum
        sum_left
        coupon
        discount
        fields {
          key
          value
        }
        crm {
          first_name
          last_name
          email
        }
      }
    }
  `

  const variables = { customerId, eventId }
  const responseData = await checkinQuery<EventTicketsResponse>(
    query,
    variables,
  )

  return responseData.eventTickets || []
}

/**
 * Calculate discount usage statistics from event tickets
 * This processes tickets that already include coupon/discount fields
 */
export function calculateDiscountUsage(
  tickets: EventTicket[],
): DiscountUsageStats {
  return tickets.reduce((stats, ticket) => {
    const discountCode = ticket.coupon || ticket.discount

    if (discountCode) {
      // Convert to uppercase for case-insensitive matching
      const normalizedCode = discountCode.toUpperCase()

      if (!stats[normalizedCode]) {
        stats[normalizedCode] = {
          usageCount: 0,
          ticketIds: [],
          totalValue: 0,
        }
      }

      stats[normalizedCode].usageCount++
      stats[normalizedCode].ticketIds.push(ticket.id)
      stats[normalizedCode].totalValue += parseFloat(ticket.sum) || 0
    }

    return stats
  }, {} as DiscountUsageStats)
}

/**
 * Validate a discount code and get usage information
 * This is useful for real-time validation during checkout
 */
export async function validateDiscountCode(
  eventId: number,
  discountCode: string,
): Promise<{
  valid: boolean
  message: string
  usageCount?: number
  maxUsage?: number
}> {
  const query = `
    query ValidateEventCoupon($eventId: Int!, $coupon: String!) {
      eventCouponValidate(id: $eventId, coupon: $coupon) {
        valid
        message
        usageCount
        maxUsage
      }
    }
  `

  const variables = { eventId, coupon: discountCode }
  const responseData = await checkinQuery<ValidateDiscountCodeResponse>(
    query,
    variables,
  )

  return responseData.eventCouponValidate
}

export async function fetchOrderPaymentDetails(
  orderId: number,
): Promise<CheckinPayOrder> {
  const query = `
    query FindCheckinPayOrderByID($id: Int!) {
      findCheckinPayOrderByID(id: $id, type: EVENT) {
        id
        belongsTo
        orderId
        orderType
        documentType
        kid
        invoiceReference
        archivedAt
        createdAt
        invoiceDate
        deliveryDate
        dueAt
        contactCrm {
          firstName
          lastName
          email {
            email
          }
        }
        billingCrm {
          firstName
          lastName
          email {
            email
          }
        }
        currency
        country
        paymentMethod
        paymentStatus
        actionRequired
        debtStatus
        debtLastUpdatedAt
        sum
        sumLeft
        paid
        sumVat
      }
    }
  `

  const variables = { id: orderId }
  const responseData = await checkinQuery<CheckinPayOrderResponse>(
    query,
    variables,
  )

  return responseData.findCheckinPayOrderByID
}

export function groupTicketsByOrder(tickets: EventTicket[]): GroupedOrder[] {
  const ordersMap = new Map<number, GroupedOrder>()

  tickets.forEach((ticket) => {
    const orderId = ticket.order_id

    if (!ordersMap.has(orderId)) {
      ordersMap.set(orderId, {
        order_id: orderId,
        tickets: [],
        totalTickets: 0,
        totalAmount: parseFloat(ticket.sum) || 0, // sum is the total amount for the order
        amountLeft: parseFloat(ticket.sum_left) || 0, // sum_left is the outstanding amount for the order
        categories: [],
        fields: ticket.fields,
      })
    }

    const order = ordersMap.get(orderId)!
    order.totalTickets = order.totalTickets + 1
    order.tickets.push(ticket)

    // Add unique categories
    if (!order.categories.includes(ticket.category)) {
      order.categories.push(ticket.category)
    }
  })

  return Array.from(ordersMap.values())
}

export function isPaymentOverdue(paymentDetails: CheckinPayOrder): boolean {
  if (paymentDetails.paid) return false

  const dueDate = new Date(paymentDetails.dueAt)
  const now = new Date()

  return dueDate < now && parseFloat(paymentDetails.sumLeft) > 0
}

export function getDaysOverdue(paymentDetails: CheckinPayOrder): number {
  if (!isPaymentOverdue(paymentDetails)) return 0

  const dueDate = new Date(paymentDetails.dueAt)
  const now = new Date()
  const diffTime = now.getTime() - dueDate.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  return diffDays
}
