const CHECKIN_API_URL = 'https://api.checkin.no/graphql'
const CHECKIN_API_KEY = process.env.CHECKIN_API_KEY
const CHECKIN_API_SECRET = process.env.CHECKIN_API_SECRET

export interface EventTicket {
  id: number
  order_id: number
  category: string
  customer_name: string | null
  numberOfTickets: number
  sum: string // price without vat
  sum_left: string // outstanding amount
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
        numberOfTickets
        sum
        sum_left
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
    console.log(`Customer ID: ${customerId}, Event ID: ${eventId}`)
    console.error(
      'Failed to fetch event tickets:',
      response.status,
      response.statusText,
    )
    throw new Error(`Failed to fetch event tickets: ${response.statusText}`)
  }

  const responseData: EventTicketsResponse = await response.json()

  if (!responseData.data || !responseData.data.eventTickets) {
    console.log(`Customer ID: ${customerId}, Event ID: ${eventId}`)
    console.error('Invalid response data:', responseData)
    throw new Error('Invalid response data')
  }

  return responseData.data.eventTickets
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
        totalTickets: ticket.numberOfTickets, // numberOfTickets is the total for the order
        totalAmount: parseFloat(ticket.sum) || 0, // sum is the total amount for the order
        amountLeft: parseFloat(ticket.sum_left) || 0, // sum_left is the outstanding amount for the order
        categories: [],
        fields: ticket.fields,
      })
    }

    const order = ordersMap.get(orderId)!
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
