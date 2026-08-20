import { parseTicketAmount } from './amount'
import type { EventTicket, CheckinPayOrder, GroupedOrder } from './types'

export function groupTicketsByOrder(tickets: EventTicket[]): GroupedOrder[] {
  const ordersMap = new Map<number, GroupedOrder>()

  tickets.forEach((ticket) => {
    const orderId = ticket.order_id

    if (!ordersMap.has(orderId)) {
      ordersMap.set(orderId, {
        order_id: orderId,
        order_date: ticket.order_date,
        tickets: [],
        totalTickets: 0,
        totalAmount: parseTicketAmount(ticket.sum),
        amountLeft: parseTicketAmount(ticket.sum_left),
        categories: [],
        fields: ticket.fields,
      })
    }

    const order = ordersMap.get(orderId)!
    order.totalTickets = order.totalTickets + 1
    order.tickets.push(ticket)

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

  return dueDate < now && parseTicketAmount(paymentDetails.sumLeft) > 0
}

export function getDaysOverdue(paymentDetails: CheckinPayOrder): number {
  if (!isPaymentOverdue(paymentDetails)) return 0

  const dueDate = new Date(paymentDetails.dueAt)
  const now = new Date()
  const diffTime = now.getTime() - dueDate.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  return diffDays
}
