const CHECKIN_API_URL = 'https://api.checkin.no/graphql'
const CHECKIN_API_KEY = process.env.CHECKIN_API_KEY
const CHECKIN_API_SECRET = process.env.CHECKIN_API_SECRET

interface GraphQLError {
  message: string
}

export interface EventTicket {
  id: number
  order_id: number
  category: string
  customer_name: string | null
  sum: string // price without vat
  sum_left: string // outstanding amount
  coupon?: string
  discount?: string
  fields: { key: string; value: string }[]
  crm: {
    first_name: string
    last_name: string
    email: string
  }
}

export interface CheckinPayOrder {
  id: number
  belongsTo: number
  orderId: number
  orderType: string
  documentType: string
  kid: string | null
  invoiceReference: string | null
  archivedAt: string | null
  createdAt: string
  invoiceDate: string | null
  deliveryDate: string | null
  dueAt: string
  contactCrm: {
    firstName: string
    lastName: string
    email: {
      email: string
    }
  }
  billingCrm: {
    firstName: string
    lastName: string
    email: {
      email: string
    }
  } | null
  currency: string | null
  country: string | null
  paymentMethod: string
  paymentStatus: string
  actionRequired: string | null
  debtStatus: string | null
  debtLastUpdatedAt: string | null
  sum: string
  sumLeft: string
  paid: boolean
  sumVat: string
}

export interface GroupedOrder {
  order_id: number
  tickets: EventTicket[]
  totalTickets: number
  totalAmount: number
  amountLeft: number
  categories: string[]
  fields: { key: string; value: string }[]
}

interface EventTicketsResponse {
  data: {
    eventTickets: EventTicket[]
  }
}

interface CheckinPayOrderResponse {
  data: {
    findCheckinPayOrderByID: CheckinPayOrder
  }
}

interface EventDiscount {
  id?: string
  trigger: string
  type: string
  value: string
  triggerValue: string | null
  affects: string
  includeBooking: boolean
  affectsValue: string | null
  modes: string[]
  tickets: string[]
  ticketsOnly: boolean
  times: number
  timesTotal: number
  // Optional fields for date ranges
  startsAt?: string
  stopsAt?: string
}

export interface TicketType {
  id: string | number // Allow both string and number to handle API response
  name: string
  description: string
}

export interface CreateEventDiscountInput {
  eventId: number
  discountCode: string
  numberOfTickets: number
  ticketTypes: string[]
  discountType?: 'percentage' | 'fixed'
  discountValue?: number
  startsAt?: string
  stopsAt?: string
}

export async function getEventDiscounts(
  eventId: number,
): Promise<{ discounts: EventDiscount[]; ticketTypes: TicketType[] }> {
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

  const response = await fetch(CHECKIN_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${CHECKIN_API_KEY}:${CHECKIN_API_SECRET}`,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    console.error(
      'Failed to fetch event discounts:',
      response.status,
      response.statusText,
    )
    throw new Error(`Failed to fetch event discounts: ${response.statusText}`)
  }

  const responseData = await response.json()

  if (responseData.errors) {
    console.error('GraphQL errors in discount query:', responseData.errors)
    throw new Error(
      'Failed to fetch discounts: ' +
        responseData.errors.map((e: GraphQLError) => e.message).join(', '),
    )
  }

  if (!responseData.data || !responseData.data.findEventById) {
    console.error('Invalid event discounts response:', responseData)
    throw new Error('Invalid event discounts response')
  }

  const eventData = responseData.data.findEventById

  return {
    discounts: eventData.settings?.discounts || [],
    ticketTypes: eventData.tickets || [],
  }
}

export interface CreateEventDiscountInput {
  eventId: number
  discountCode: string
  numberOfTickets: number
  ticketTypes: string[]
  discountType?: 'percentage' | 'fixed'
  discountValue?: number
  startsAt?: string
  stopsAt?: string
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

  const query = `
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

  const response = await fetch(CHECKIN_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${CHECKIN_API_KEY}:${CHECKIN_API_SECRET}`,
    },
    body: JSON.stringify({ query }),
  })

  if (!response.ok) {
    console.error(
      'Failed to create event discount:',
      response.status,
      response.statusText,
    )
    throw new Error(`Failed to create event discount: ${response.statusText}`)
  }

  const responseData = await response.json()

  if (responseData.errors) {
    console.error('GraphQL errors in create discount:', responseData.errors)
    throw new Error(
      'GraphQL errors in create discount: ' +
        responseData.errors.map((e: GraphQLError) => e.message).join(', '),
    )
  }

  if (!responseData.data || !responseData.data.createEventDiscount) {
    console.error('Invalid create discount response:', responseData)
    throw new Error('Invalid create discount response')
  }

  // Check if the mutation was successful
  const result = responseData.data.createEventDiscount
  if (!result.success) {
    throw new Error('Failed to create discount code')
  }

  // Return a mock object since the mutation returns success/message, not the discount object
  return {
    trigger: 'coupon',
    type: 'percent',
    value: '100',
    triggerValue: discountCode,
    affects: 'total',
    includeBooking: false,
    affectsValue: '100',
    modes: ['default'],
    tickets: ticketTypes, // Include the selected ticket types
    ticketsOnly: true,
    times: 0,
    timesTotal: numberOfTickets,
  }
}

export async function deleteEventDiscount(
  eventId: number,
  discountCode: string,
): Promise<boolean> {
  const query = `
    mutation DeleteEventDiscount($eventId: Int!, $id: String!) {
      deleteEventDiscount(eventId: $eventId, id: $id) {
        success
      }
    }
  `

  // The ID format appears to be "coupon-{discountCode}"
  const discountId = `coupon-${discountCode}`
  const variables = { eventId, id: discountId }

  const response = await fetch(CHECKIN_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${CHECKIN_API_KEY}:${CHECKIN_API_SECRET}`,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    console.error(
      'Failed to delete event discount:',
      response.status,
      response.statusText,
    )
    throw new Error(`Failed to delete event discount: ${response.statusText}`)
  }

  const responseData = await response.json()

  if (responseData.errors) {
    console.error('GraphQL errors in delete discount:', responseData.errors)
    throw new Error(
      'GraphQL errors in delete discount: ' +
        responseData.errors.map((e: GraphQLError) => e.message).join(', '),
    )
  }

  if (!responseData.data || !responseData.data.deleteEventDiscount) {
    console.error('Invalid delete discount response:', responseData)
    throw new Error('Invalid delete discount response')
  }

  const result = responseData.data.deleteEventDiscount
  return result.success
}

export async function fetchEventTickets(
  customerId: number,
  eventId: number,
): Promise<EventTicket[]> {
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

  const response = await fetch(CHECKIN_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${CHECKIN_API_KEY}:${CHECKIN_API_SECRET}`,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch event tickets: ${response.statusText}`)
  }

  const responseData: EventTicketsResponse = await response.json()

  if (!responseData.data || !responseData.data.eventTickets) {
    throw new Error('Invalid response data')
  }

  return responseData.data.eventTickets
}

export interface DiscountUsageStats {
  [discountCode: string]: {
    usageCount: number
    ticketIds: number[]
    totalValue: number
  }
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

  const response = await fetch(CHECKIN_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${CHECKIN_API_KEY}:${CHECKIN_API_SECRET}`,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    console.error(
      'Failed to validate discount code:',
      response.status,
      response.statusText,
    )
    throw new Error(`Failed to validate discount code: ${response.statusText}`)
  }

  const responseData = await response.json()

  if (responseData.errors) {
    console.error('GraphQL errors in validation query:', responseData.errors)
    throw new Error(
      'GraphQL errors in validation query: ' +
        responseData.errors.map((e: GraphQLError) => e.message).join(', '),
    )
  }

  if (!responseData.data || !responseData.data.eventCouponValidate) {
    console.error('Invalid validation response:', responseData)
    throw new Error('Invalid validation response')
  }

  return responseData.data.eventCouponValidate
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

  const response = await fetch(CHECKIN_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${CHECKIN_API_KEY}:${CHECKIN_API_SECRET}`,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    console.error(
      'Failed to fetch payment details:',
      response.status,
      response.statusText,
    )
    throw new Error(`Failed to fetch payment details: ${response.statusText}`)
  }

  const responseData: CheckinPayOrderResponse = await response.json()

  if (!responseData.data || !responseData.data.findCheckinPayOrderByID) {
    console.error('Invalid payment details response:', responseData)
    throw new Error('Invalid payment details response')
  }

  return responseData.data.findCheckinPayOrderByID
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
