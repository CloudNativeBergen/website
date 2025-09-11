import type { EventTicket, EventOrderUser } from './types'
import { groupTicketsByOrder, type GroupedOrder } from './checkin'
import { getSpeakers } from '@/lib/speaker/sanity'
import type { Conference } from '@/lib/conference/types'
import { filterPaidTickets, filterPaidEventOrderUsers } from './utils'

// Sponsor ticket allocation by tier
export const TIER_TICKET_ALLOCATION: Record<string, number> = {
  Pod: 2,
  Service: 3,
  Ingress: 5,
}

export interface TicketStatistics {
  // Paid ticket statistics (simplified - each ticket = 1)
  paidTickets: number
  totalRevenue: number
  totalOrders: number
  ticketsByCategory: Record<string, number>

  // Complimentary ticket statistics
  sponsorTickets: number
  speakerTickets: number

  // Total statistics
  totalTickets: number
  totalComplimentaryTickets: number
}

export async function calculateTicketStatistics(
  tickets: EventTicket[],
  conference: Conference,
): Promise<TicketStatistics>
export async function calculateTicketStatistics(
  eventOrderUsers: EventOrderUser[],
  conference: Conference,
): Promise<TicketStatistics>
export async function calculateTicketStatistics(
  data: EventTicket[] | EventOrderUser[],
  conference: Conference,
): Promise<TicketStatistics> {
  // Check if we're dealing with EventOrderUser[] by checking for orderId property
  const isEventOrderUser = data.length > 0 && 'orderId' in data[0]

  if (isEventOrderUser) {
    const eventOrderUsers = data as EventOrderUser[]
    return calculateTicketStatisticsFromEventOrderUsers(
      eventOrderUsers,
      conference,
    )
  } else {
    const tickets = data as EventTicket[]
    return calculateTicketStatisticsFromEventTickets(tickets, conference)
  }
}

async function calculateTicketStatisticsFromEventOrderUsers(
  eventOrderUsers: EventOrderUser[],
  conference: Conference,
): Promise<TicketStatistics> {
  const paidOrderUsersList = filterPaidEventOrderUsers(eventOrderUsers)
  const paidTickets = paidOrderUsersList.length

  const orders = groupTicketsByOrder(eventOrderUsers)
  const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0)
  const totalOrders = orders.length

  const ticketsByCategory: Record<string, number> = {}
  paidOrderUsersList.forEach((orderUser) => {
    const category = orderUser.ticket?.name || 'Unknown'
    ticketsByCategory[category] = (ticketsByCategory[category] || 0) + 1
  })

  let sponsorTickets = 0
  if (conference.sponsors && conference.sponsors.length > 0) {
    conference.sponsors.forEach((sponsorData) => {
      const tierTitle = sponsorData.tier?.title || 'Unknown'
      const ticketsForTier = TIER_TICKET_ALLOCATION[tierTitle] || 0
      sponsorTickets += ticketsForTier
    })
  }

  let speakerTickets = 0
  try {
    const { speakers: confirmedSpeakers, err: speakersError } =
      await getSpeakers(conference._id)

    if (!speakersError) {
      speakerTickets = confirmedSpeakers.length
    }
  } catch (error) {
    console.warn('Error fetching speakers for ticket calculation:', error)
  }

  const totalComplimentaryTickets = sponsorTickets + speakerTickets
  const totalTickets = paidTickets + totalComplimentaryTickets

  return {
    paidTickets,
    totalRevenue,
    totalOrders,
    ticketsByCategory,
    sponsorTickets,
    speakerTickets,
    totalTickets,
    totalComplimentaryTickets,
  }
}

async function calculateTicketStatisticsFromEventTickets(
  tickets: EventTicket[],
  conference: Conference,
): Promise<TicketStatistics> {
  const paidTicketsList = filterPaidTickets(tickets)
  const paidTickets = paidTicketsList.length

  // Create a simple EventTicket-compatible grouped structure
  const ordersMap = new Map<
    number,
    { tickets: EventTicket[]; totalAmount: number }
  >()

  tickets.forEach((ticket) => {
    const orderId = ticket.order_id
    if (!ordersMap.has(orderId)) {
      ordersMap.set(orderId, {
        tickets: [],
        totalAmount: parseFloat(ticket.sum) || 0,
      })
    }
    ordersMap.get(orderId)!.tickets.push(ticket)
  })

  const orders = Array.from(ordersMap.values())
  const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0)
  const totalOrders = orders.length

  const ticketsByCategory: Record<string, number> = {}
  paidTicketsList.forEach((ticket) => {
    const category = ticket.category || 'Unknown'
    ticketsByCategory[category] = (ticketsByCategory[category] || 0) + 1
  })

  let sponsorTickets = 0
  if (conference.sponsors && conference.sponsors.length > 0) {
    conference.sponsors.forEach((sponsorData) => {
      const tierTitle = sponsorData.tier?.title || 'Unknown'
      const ticketsForTier = TIER_TICKET_ALLOCATION[tierTitle] || 0
      sponsorTickets += ticketsForTier
    })
  }

  let speakerTickets = 0
  try {
    const { speakers: confirmedSpeakers, err: speakersError } =
      await getSpeakers(conference._id)

    if (!speakersError) {
      speakerTickets = confirmedSpeakers.length
    }
  } catch (error) {
    console.warn('Error fetching speakers for ticket calculation:', error)
  }

  const totalComplimentaryTickets = sponsorTickets + speakerTickets
  const totalTickets = paidTickets + totalComplimentaryTickets

  return {
    paidTickets,
    totalRevenue,
    totalOrders,
    ticketsByCategory,
    sponsorTickets,
    speakerTickets,
    totalTickets,
    totalComplimentaryTickets,
  }
}

export function createCategoryStatsForAdmin(
  tickets: EventTicket[],
  orders: GroupedOrder[],
  ticketsByCategory: Record<string, number>,
): Array<{
  category: string
  count: number
  revenue: number
  orders: number
}>
export function createCategoryStatsForAdmin(
  eventOrderUsers: EventOrderUser[],
  orders: GroupedOrder[],
  ticketsByCategory: Record<string, number>,
): Array<{
  category: string
  count: number
  revenue: number
  orders: number
}>
export function createCategoryStatsForAdmin(
  data: EventTicket[] | EventOrderUser[],
  orders: GroupedOrder[],
  ticketsByCategory: Record<string, number>,
): Array<{
  category: string
  count: number
  revenue: number
  orders: number
}> {
  // Check if we're dealing with EventOrderUser[] by checking for orderId property
  const isEventOrderUser = data.length > 0 && 'orderId' in data[0]

  if (isEventOrderUser) {
    return createCategoryStatsForAdminFromEventOrderUsers(
      data as EventOrderUser[],
      orders,
      ticketsByCategory,
    )
  } else {
    return createCategoryStatsForAdminFromEventTickets(
      data as EventTicket[],
      orders,
      ticketsByCategory,
    )
  }
}

function createCategoryStatsForAdminFromEventOrderUsers(
  eventOrderUsers: EventOrderUser[],
  orders: GroupedOrder[],
  ticketsByCategory: Record<string, number>,
): Array<{
  category: string
  count: number
  revenue: number
  orders: number
}> {
  const categoryRevenue: Record<string, number> = {}
  const categoryOrders: Record<string, number> = {}

  orders.forEach((order) => {
    const paidOrderUsersInOrder = filterPaidEventOrderUsers(order.tickets)
    const categoriesInOrder = new Set(
      paidOrderUsersInOrder.map(
        (orderUser) => orderUser.ticket?.name || 'Unknown',
      ),
    ).size

    const revenuePerCategory =
      categoriesInOrder > 0 ? order.totalAmount / categoriesInOrder : 0

    const orderCategories = Array.from(
      new Set(
        paidOrderUsersInOrder.map(
          (orderUser) => orderUser.ticket?.name || 'Unknown',
        ),
      ),
    )

    orderCategories.forEach((category: string) => {
      categoryRevenue[category] =
        (categoryRevenue[category] || 0) + revenuePerCategory
      categoryOrders[category] = (categoryOrders[category] || 0) + 1
    })
  })

  return Object.entries(ticketsByCategory)
    .map(([category, count]) => ({
      category,
      count,
      revenue: categoryRevenue[category] || 0,
      orders: categoryOrders[category] || 0,
    }))
    .sort((a, b) => b.count - a.count)
}

function createCategoryStatsForAdminFromEventTickets(
  tickets: EventTicket[],
  orders: GroupedOrder[],
  ticketsByCategory: Record<string, number>,
): Array<{
  category: string
  count: number
  revenue: number
  orders: number
}> {
  const categoryRevenue: Record<string, number> = {}
  const categoryOrders: Record<string, number> = {}

  // For EventTicket[], we need to work with a simpler order structure
  const ticketOrdersMap = new Map<
    number,
    { tickets: EventTicket[]; totalAmount: number }
  >()

  tickets.forEach((ticket) => {
    const orderId = ticket.order_id
    if (!ticketOrdersMap.has(orderId)) {
      ticketOrdersMap.set(orderId, {
        tickets: [],
        totalAmount: parseFloat(ticket.sum) || 0,
      })
    }
    ticketOrdersMap.get(orderId)!.tickets.push(ticket)
  })

  const ticketOrders = Array.from(ticketOrdersMap.values())

  ticketOrders.forEach((order) => {
    const paidTicketsInOrder = filterPaidTickets(order.tickets)
    const categoriesInOrder = new Set(
      paidTicketsInOrder.map((ticket) => ticket.category || 'Unknown'),
    ).size

    const revenuePerCategory =
      categoriesInOrder > 0 ? order.totalAmount / categoriesInOrder : 0

    const orderCategories = Array.from(
      new Set(paidTicketsInOrder.map((ticket) => ticket.category || 'Unknown')),
    )

    orderCategories.forEach((category: string) => {
      categoryRevenue[category] =
        (categoryRevenue[category] || 0) + revenuePerCategory
      categoryOrders[category] = (categoryOrders[category] || 0) + 1
    })
  })

  return Object.entries(ticketsByCategory)
    .map(([category, count]) => ({
      category,
      count,
      revenue: categoryRevenue[category] || 0,
      orders: categoryOrders[category] || 0,
    }))
    .sort((a, b) => b.count - a.count)
}
