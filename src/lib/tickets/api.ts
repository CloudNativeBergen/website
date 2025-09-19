import { checkinQuery } from './graphql-client'
import type {
  EventTicket,
  CheckinPayOrder,
  GroupedOrder,
  EventTicketsResponse,
  CheckinPayOrderResponse,
  EventOrderUser as EventOrder,
  EventOrderUserPage,
  AllEventOrderUsersResponse,
  EventTicketWithoutDate,
} from './types'

// Re-export types for convenience
export type {
  EventTicket,
  CheckinPayOrder,
  GroupedOrder,
  EventOrder as EventOrderUser,
  EventOrderUserPage,
  AllEventOrderUsersResponse,
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

  try {
    // Fetch both datasets in parallel
    const [tickets, orderUsers] = await Promise.all([
      _fetchEventTickets(customerId, eventId),
      _fetchAllEventOrders(customerId, eventId),
    ])

    // Create a map of order IDs to purchase dates
    const orderDateMap = new Map<number, string>()
    orderUsers.forEach((orderUser) => {
      orderDateMap.set(orderUser.orderId, orderUser.createdAt)
    })

    // Enrich tickets with order dates
    return tickets.map(
      (ticket): EventTicket => ({
        ...ticket,
        order_date: orderDateMap.get(ticket.order_id) || '',
      }),
    )
  } catch (error) {
    console.error('Failed to fetch event tickets with dates:', error)
    throw new Error(
      `Failed to fetch tickets with dates for event ${eventId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

async function _fetchEventTickets(
  customerId: number,
  eventId: number,
): Promise<EventTicketWithoutDate[]> {
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

async function _fetchEventOrders(
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
): Promise<EventOrder[]> {
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

async function _fetchAllEventOrders(
  customerId: number,
  eventId: number,
  batchSize: number = 1000,
): Promise<EventOrder[]> {
  if (!customerId || customerId <= 0) {
    throw new Error('Valid customer ID is required')
  }

  if (!eventId || eventId <= 0) {
    throw new Error('Valid event ID is required')
  }

  const allTickets: EventOrder[] = []
  let offset = 0
  let hasMore = true

  while (hasMore) {
    try {
      const batch = await _fetchEventOrders(customerId, eventId, {
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

export function groupEventOrderUsersByOrder(
  eventOrderUsers: EventOrder[],
): Map<number, EventOrder[]> {
  const orderMap = new Map<number, EventOrder[]>()

  eventOrderUsers.forEach((user) => {
    if (!orderMap.has(user.orderId)) {
      orderMap.set(user.orderId, [])
    }
    orderMap.get(user.orderId)!.push(user)
  })

  return orderMap
}
