import type { EventTicket, EventOrderUser } from './types'

/**
 * Determines if a ticket is free based on price only
 */
export function isFreeTicket(ticket: EventTicket): boolean {
  // Check ticket price - if price is zero or very low, it's free
  const price = parseFloat(ticket.sum) || 0
  return price < 1
}

/**
 * Determines if an event order user's ticket is free based on price
 */
export function isFreeEventOrderUser(orderUser: EventOrderUser): boolean {
  // Check total price from price array - if total is zero or very low, it's free
  const totalPrice =
    orderUser.price?.reduce((sum, p) => sum + (p.price || 0), 0) || 0
  return totalPrice < 1
}

/**
 * Filter out free tickets from an array of tickets
 */
export function filterPaidTickets(tickets: EventTicket[]): EventTicket[] {
  return tickets.filter((ticket) => !isFreeTicket(ticket))
}

/**
 * Filter out free event order users from an array
 */
export function filterPaidEventOrderUsers(
  orderUsers: EventOrderUser[],
): EventOrderUser[] {
  return orderUsers.filter((orderUser) => !isFreeEventOrderUser(orderUser))
}
