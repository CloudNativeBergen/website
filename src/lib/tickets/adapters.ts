/**
 * Adapter functions to enhance EventTicket data with purchase dates from EventOrderUser
 * This allows us to use the more efficient fetchAllEventOrderUsers API to get purchase dates
 * while maintaining compatibility with existing components and functions
 */

import type { EventOrderUser, EventTicket, GroupedOrder } from './types'

/**
 * Enhanced EventTicket with purchase date information
 */
export interface EventTicketWithPurchaseDate extends EventTicket {
  order: EventTicket['order'] & {
    createdAt: string // Purchase date from EventOrderUser
  }
}

/**
 * Enhance EventTicket with purchase date from EventOrderUser
 * Combines the rich ticket data with accurate purchase dates
 */
export function enhanceTicketWithPurchaseDate(
  ticket: EventTicket,
  orderUser: EventOrderUser,
): EventTicketWithPurchaseDate {
  return {
    ...ticket,
    order: {
      ...ticket.order,
      createdAt: orderUser.createdAt,
      paymentStatus: ticket.order?.paymentStatus || 'unknown',
      paid: ticket.order?.paid || false,
    },
  }
}

/**
 * Enhance array of EventTickets with purchase dates from EventOrderUsers
 * Matches tickets to order users by order_id
 */
export function enhanceTicketsWithPurchaseDates(
  tickets: EventTicket[],
  orderUsers: EventOrderUser[],
): EventTicketWithPurchaseDate[] {
  // Create a map for quick lookup of purchase dates by order ID
  const purchaseDateMap = new Map<number, string>()
  orderUsers.forEach((user) => {
    purchaseDateMap.set(user.orderId, user.createdAt)
  })

  return tickets.map((ticket) => {
    const purchaseDate = purchaseDateMap.get(ticket.order_id)

    return {
      ...ticket,
      order: {
        ...ticket.order,
        createdAt: purchaseDate || new Date().toISOString(), // Fallback to current date
        paymentStatus: ticket.order?.paymentStatus || 'unknown',
        paid: ticket.order?.paid || false,
      },
    }
  })
}

/**
 * Extract purchase date timeline from EventOrderUser data
 * Groups by order ID and provides purchase dates for target analysis
 */
export function extractPurchaseTimeline(
  orderUsers: EventOrderUser[],
  tickets: EventTicket[],
): Array<{
  orderId: number
  date: Date
  ticketCount: number
  revenue: number
  categories: string[]
}> {
  // Create a map to count tickets and calculate revenue per order
  const orderTicketMap = new Map<
    number,
    { tickets: EventTicket[]; count: number; revenue: number }
  >()

  tickets.forEach((ticket) => {
    const orderId = ticket.order_id
    if (!orderTicketMap.has(orderId)) {
      orderTicketMap.set(orderId, { tickets: [], count: 0, revenue: 0 })
    }
    const orderData = orderTicketMap.get(orderId)!
    orderData.tickets.push(ticket)
    orderData.count += 1
    orderData.revenue += parseFloat(ticket.sum) || 0
  })

  // Create purchase timeline with dates from orderUsers
  const purchaseDateMap = new Map<number, string>()
  orderUsers.forEach((user) => {
    purchaseDateMap.set(user.orderId, user.createdAt)
  })

  return Array.from(orderTicketMap.entries())
    .map(([orderId, orderData]) => ({
      orderId,
      date: new Date(purchaseDateMap.get(orderId) || new Date()),
      ticketCount: orderData.count,
      revenue: orderData.revenue,
      categories: [...new Set(orderData.tickets.map((t) => t.category))],
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}
