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
  EventOrderUser,
  EventOrderUserPage,
  AllEventOrderUsersResponse,
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
  EventOrderUser,
  EventOrderUserPage,
  AllEventOrderUsersResponse,
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
          affectsValue: ${numberOfTickets}
          includeBooking: false
          modes: default
          tickets: ${ticketsParam}
          ticketsOnly: false
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
    affects: 'first',
    includeBooking: false,
    affectsValue: numberOfTickets.toString(),
    modes: ['default'],
    tickets: ticketTypes,
    ticketsOnly: false,
    times: 0,
    timesTotal: 1,
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

/**
 * Fetch all event order users (tickets) with purchase dates for an event
 * This is the most efficient way to get all tickets/orders with minimal requests
 *
 * @param customerId - The customer/organization ID
 * @param eventId - Optional event ID to filter by specific event
 * @param options - Additional options for pagination and filtering
 * @returns Promise<EventOrderUser[]> - Array of all event order users with purchase dates
 */
export async function fetchAllEventOrderUsers(
  customerId: number,
  eventId?: number,
  options: {
    offset?: number
    length?: number
    reportFilters?: Array<{
      rule: 'AND' | 'OR' | 'AND_NOT' | 'OR_NOT'
      conditions?: Array<{
        rule: 'AND' | 'OR' | 'AND_NOT' | 'OR_NOT'
        field: string
        operator:
          | 'EQUALS'
          | 'NOT_EQUALS'
          | 'GREATER_THAN'
          | 'LESS_THAN'
          | 'GREATER_THAN_OR_EQUAL'
          | 'LESS_THAN_OR_EQUAL'
          | 'CONTAINS'
          | 'STARTS_WITH'
        value: string
      }>
    }>
  } = {},
): Promise<EventOrderUser[]> {
  if (!customerId || customerId <= 0) {
    throw new Error('Valid customer ID is required')
  }

  const { offset = 0, length = 1000, reportFilters = [] } = options

  // Add event ID filter if provided
  const filters = eventId
    ? [
        {
          rule: 'AND',
          conditions: [
            {
              rule: 'AND',
              field: 'EVENT_ID',
              operator: 'EQUALS',
              value: eventId.toString(),
            },
          ],
        },
      ]
    : reportFilters

  try {
    const query = `
      query allEventOrderUsers(
        $customerId: Int!
        $offset: Int
        $length: Int
        $reportFilters: [EventOrderUserReportFilterInput!]
      ) {
        allEventOrderUsers(
          customerId: $customerId
          offset: $offset
          length: $length
          reportFilters: $reportFilters
        ) {
          records
          offset
          length
          data {
            id
            orderId
            eventId
            createdAt
          }
          pageInfo {
            hasNextPage
          }
          cachedAt
        }
      }
    `

    const variables = {
      customerId,
      offset,
      length,
      reportFilters: filters.length > 0 ? filters : undefined,
    }

    const responseData = await checkinQuery<AllEventOrderUsersResponse>(
      query,
      variables,
    )

    if (!responseData.allEventOrderUsers?.data) {
      console.warn('No event order users found in response')
      return []
    }

    return responseData.allEventOrderUsers.data
  } catch (error) {
    console.error('Failed to fetch event order users:', error)
    throw new Error(
      `Failed to fetch event order users: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

/**
 * Fetch all event order users for a specific event with pagination support
 * Automatically handles pagination to fetch all records
 *
 * @param customerId - The customer/organization ID
 * @param eventId - The specific event ID to fetch tickets for
 * @param batchSize - Number of records to fetch per request (default: 1000)
 * @returns Promise<EventOrderUser[]> - Array of all event order users for the event
 */
export async function fetchAllEventTicketsWithPurchaseDates(
  customerId: number,
  eventId: number,
  batchSize: number = 1000,
): Promise<EventOrderUser[]> {
  if (!customerId || customerId <= 0) {
    throw new Error('Valid customer ID is required')
  }

  if (!eventId || eventId <= 0) {
    throw new Error('Valid event ID is required')
  }

  const allTickets: EventOrderUser[] = []
  let offset = 0
  let hasMore = true

  while (hasMore) {
    try {
      const batch = await fetchAllEventOrderUsers(customerId, eventId, {
        offset,
        length: batchSize,
      })

      if (batch.length === 0) {
        hasMore = false
      } else {
        allTickets.push(...batch)
        offset += batchSize

        // If we got fewer results than requested, we've reached the end
        if (batch.length < batchSize) {
          hasMore = false
        }
      }
    } catch (error) {
      console.error(`Failed to fetch batch at offset ${offset}:`, error)
      throw error
    }
  }

  return allTickets
}

/**
 * Group event order users by their order ID
 * Useful for analyzing orders that contain multiple tickets
 *
 * @param eventOrderUsers - Array of event order users
 * @returns Map<number, EventOrderUser[]> - Map where key is orderId and value is array of tickets in that order
 */
export function groupEventOrderUsersByOrder(
  eventOrderUsers: EventOrderUser[],
): Map<number, EventOrderUser[]> {
  const orderMap = new Map<number, EventOrderUser[]>()

  eventOrderUsers.forEach((user) => {
    if (!orderMap.has(user.orderId)) {
      orderMap.set(user.orderId, [])
    }
    orderMap.get(user.orderId)!.push(user)
  })

  return orderMap
}
