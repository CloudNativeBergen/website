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
        // Accumulated below from EVERY ticket — see the note there.
        totalAmount: 0,
        amountLeft: 0,
        categories: [],
        fields: ticket.fields,
      })
    }

    const order = ordersMap.get(orderId)!
    order.totalTickets = order.totalTickets + 1
    // Amounts are per ticket (the adapter guarantees it — `amountBasis` in
    // `provider/types.ts`), so an order's total is the sum of its tickets.
    // These two used to be taken from the FIRST ticket only: a multi-seat
    // order showed one seat's price, and — worse — `amountLeft` drives the
    // Orders page paid/unpaid filter, so an order whose first seat was settled
    // read as PAID while the rest was still outstanding.
    order.totalAmount += parseTicketAmount(ticket.sum)
    order.amountLeft += parseTicketAmount(ticket.sum_left)
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
