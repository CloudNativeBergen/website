/**
 * Consolidated data processing utilities for tickets
 * This module contains shared logic to eliminate duplication across the tickets system
 */

import type {
  EventTicket,
  EventOrderUser,
  GroupedOrder,
  TargetVsActualData,
  TicketTargetAnalysis,
} from './types'
import { getSpeakers } from '@/lib/speaker/sanity'
import type { Conference } from '@/lib/conference/types'

export const SPONSOR_TIER_TICKET_ALLOCATION: Record<string, number> = {
  Pod: 2,
  Service: 3,
  Ingress: 5,
}

export interface EnhancedGroupedOrder extends GroupedOrder {
  purchaseDate: Date
  categories: string[]
}

export interface EventTicketWithPurchaseDate extends EventTicket {
  order: EventTicket['order'] & {
    createdAt: string
  }
}

export interface TicketStatistics {
  paidTickets: number
  totalRevenue: number
  totalOrders: number
  ticketsByCategory: Record<string, number>
  sponsorTickets: number
  speakerTickets: number
  totalTickets: number
  totalComplimentaryTickets: number
}

/**
 * Common validation for customer and event IDs
 */
export function validateApiParameters(
  customerId: number,
  eventId: number,
): void {
  if (!customerId || customerId <= 0) {
    throw new Error('Valid customer ID is required')
  }
  if (!eventId || eventId <= 0) {
    throw new Error('Valid event ID is required')
  }
}

export interface ConsolidatedTicketStats {
  totalTickets: number
  totalOrders: number
  totalRevenue: number
  ticketsByCategory: Record<string, number>
  revenueByCategory: Record<string, number>
  ordersByCategory: Record<string, number>
  timeline: Array<{
    orderId: number
    date: Date
    ticketCount: number
    revenue: number
    categories: string[]
  }>
}

export function groupItemsByKey<T, K extends string | number, G>(
  items: T[],
  getKey: (item: T) => K,
  createGroup: (key: K, firstItem: T) => G,
  addToGroup: (group: G, item: T) => void,
): Map<K, G> {
  const groups = new Map<K, G>()

  items.forEach((item) => {
    const key = getKey(item)

    if (!groups.has(key)) {
      groups.set(key, createGroup(key, item))
    }

    addToGroup(groups.get(key)!, item)
  })

  return groups
}

export function createEnhancedOrderGroups(
  tickets: EventTicket[],
  orderUsers: EventOrderUser[],
): EnhancedGroupedOrder[] {
  const purchaseDateMap = new Map<number, Date>()
  orderUsers.forEach((user) => {
    purchaseDateMap.set(user.orderId, new Date(user.createdAt))
  })

  const orderGroups = groupItemsByKey(
    tickets,
    (ticket) => ticket.order_id,
    (orderId, firstTicket) => ({
      order_id: orderId,
      tickets: [] as EventTicket[],
      totalTickets: 0,
      totalAmount: 0,
      amountLeft: 0,
      categories: [] as string[],
      fields: firstTicket.fields,
      purchaseDate: purchaseDateMap.get(orderId) || new Date(),
    }),
    (group, ticket) => {
      group.tickets.push(ticket)
      group.totalTickets += 1
      group.totalAmount += parseFloat(ticket.sum) || 0
      group.amountLeft += parseFloat(ticket.sum_left) || 0

      if (!group.categories.includes(ticket.category)) {
        group.categories.push(ticket.category)
      }
    },
  )

  return Array.from(orderGroups.values())
}

export function calculateConsolidatedStats(
  enhancedOrders: EnhancedGroupedOrder[],
): ConsolidatedTicketStats {
  const stats: ConsolidatedTicketStats = {
    totalTickets: 0,
    totalOrders: enhancedOrders.length,
    totalRevenue: 0,
    ticketsByCategory: {},
    revenueByCategory: {},
    ordersByCategory: {},
    timeline: [],
  }

  enhancedOrders.forEach((order) => {
    stats.totalTickets += order.totalTickets
    stats.totalRevenue += order.totalAmount

    const revenuePerCategory =
      order.categories.length > 0
        ? order.totalAmount / order.categories.length
        : 0

    order.categories.forEach((category) => {
      const ticketsInCategory = order.tickets.filter(
        (t) => t.category === category,
      ).length
      stats.ticketsByCategory[category] =
        (stats.ticketsByCategory[category] || 0) + ticketsInCategory

      stats.revenueByCategory[category] =
        (stats.revenueByCategory[category] || 0) + revenuePerCategory

      stats.ordersByCategory[category] =
        (stats.ordersByCategory[category] || 0) + 1
    })

    stats.timeline.push({
      orderId: order.order_id,
      date: order.purchaseDate,
      ticketCount: order.totalTickets,
      revenue: order.totalAmount,
      categories: [...order.categories],
    })
  })

  stats.timeline.sort((a, b) => a.date.getTime() - b.date.getTime())

  return stats
}

/**
 * Create category breakdown for admin display
 * Uses consolidated stats to avoid duplication
 */
export function createCategoryBreakdown(stats: ConsolidatedTicketStats): Array<{
  category: string
  count: number
  revenue: number
  orders: number
  percentage: number
}> {
  return Object.entries(stats.ticketsByCategory)
    .map(([category, count]) => ({
      category,
      count,
      revenue: stats.revenueByCategory[category] || 0,
      orders: stats.ordersByCategory[category] || 0,
      percentage:
        stats.totalTickets > 0 ? (count / stats.totalTickets) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count)
}

/**
 * Build cumulative timeline for charts
 * Processes timeline data into cumulative progression
 */
export function buildCumulativeTimeline(
  timeline: ConsolidatedTicketStats['timeline'],
): Array<{
  date: string
  cumulativeTickets: number
  cumulativeRevenue: number
  cumulativeCategories: Record<string, number>
}> {
  const cumulative: Array<{
    date: string
    cumulativeTickets: number
    cumulativeRevenue: number
    cumulativeCategories: Record<string, number>
  }> = []

  let runningTickets = 0
  let runningRevenue = 0
  const runningCategories: Record<string, number> = {}

  // Group by date (daily aggregation)
  const dailyGroups = new Map<string, (typeof timeline)[0][]>()

  timeline.forEach((entry) => {
    const dateKey = entry.date.toISOString().split('T')[0]
    if (!dailyGroups.has(dateKey)) {
      dailyGroups.set(dateKey, [])
    }
    dailyGroups.get(dateKey)!.push(entry)
  })

  // Process each day in chronological order
  Array.from(dailyGroups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([, entries]) => {
      // Add this day's data to running totals
      entries.forEach((entry) => {
        runningTickets += entry.ticketCount
        runningRevenue += entry.revenue

        entry.categories.forEach((category) => {
          const categoryTickets = Math.ceil(
            entry.ticketCount / entry.categories.length,
          )
          runningCategories[category] =
            (runningCategories[category] || 0) + categoryTickets
        })
      })

      cumulative.push({
        date: entries[0].date.toISOString(),
        cumulativeTickets: runningTickets,
        cumulativeRevenue: runningRevenue,
        cumulativeCategories: { ...runningCategories },
      })
    })

  return cumulative
}

export async function calculateTicketStatistics(
  tickets: EventTicket[],
  conference: Conference,
): Promise<TicketStatistics> {
  const paidTickets = tickets.length

  const ticketsByCategory: Record<string, number> = {}
  tickets.forEach((ticket) => {
    const category = ticket.category || 'Unknown'
    ticketsByCategory[category] = (ticketsByCategory[category] || 0) + 1
  })

  const totalRevenue = tickets.reduce(
    (sum, ticket) => sum + (parseFloat(ticket.sum) || 0),
    0,
  )

  const uniqueOrderIds = new Set(tickets.map((ticket) => ticket.order_id))
  const totalOrders = uniqueOrderIds.size

  const sponsorTickets = calculateSponsorTickets(conference)
  const speakerTickets = await calculateSpeakerTickets(conference)
  const totalComplimentaryTickets = sponsorTickets + speakerTickets

  return {
    paidTickets,
    totalRevenue,
    totalOrders,
    ticketsByCategory,
    sponsorTickets,
    speakerTickets,
    totalTickets: paidTickets + totalComplimentaryTickets,
    totalComplimentaryTickets,
  }
}

function calculateSponsorTickets(conference: Conference): number {
  let sponsorTickets = 0
  if (conference.sponsors && conference.sponsors.length > 0) {
    conference.sponsors.forEach((sponsorData) => {
      const tierTitle = sponsorData.tier?.title || 'Unknown'
      const ticketsForTier = SPONSOR_TIER_TICKET_ALLOCATION[tierTitle] || 0
      sponsorTickets += ticketsForTier
    })
  }
  return sponsorTickets
}

async function calculateSpeakerTickets(
  conference: Conference,
): Promise<number> {
  try {
    const { speakers: confirmedSpeakers, err: speakersError } =
      await getSpeakers(conference._id)

    if (!speakersError) {
      return confirmedSpeakers.length
    } else {
      console.warn(
        'Could not fetch speakers for ticket calculation:',
        speakersError,
      )
      return 0
    }
  } catch (error) {
    console.warn('Error fetching speakers for ticket calculation:', error)
    return 0
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
}> {
  if (orders.length > 0 && 'enhancedOrders' in orders[0]) {
    const stats = {
      ticketsByCategory,
      revenueByCategory: {},
      ordersByCategory: {},
    } as ConsolidatedTicketStats
    return createCategoryBreakdown(stats).map((item) => ({
      category: item.category,
      count: item.count,
      revenue: item.revenue,
      orders: item.orders,
    }))
  }

  const categoryRevenue: Record<string, number> = {}
  const categoryOrders: Record<string, number> = {}

  orders.forEach((order) => {
    const categoriesInOrder = order.categories?.length || 1
    const revenuePerCategory = order.totalAmount / categoriesInOrder

    const categories = order.categories || ['Unknown']
    categories.forEach((category: string) => {
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

export interface ChartSeries {
  name: string
  type: 'column' | 'line'
  data: Array<{ x: string; y: number }>
  color?: string
  yAxisIndex?: number
}

export interface ChartDebugInfo {
  totalCategories: number
  categoriesList: string[]
  dataPointsCount: number
  maxActualValue: number
  maxTargetValue: number
}

export interface ChartData {
  series: ChartSeries[]
  combinedData: TargetVsActualData[]
  debugInfo: ChartDebugInfo
}

const TICKET_CATEGORY_COLORS = [
  '#3B82F6', // blue-500
  '#10B981', // emerald-500
  '#F59E0B', // amber-500
  '#EF4444', // red-500
  '#8B5CF6', // violet-500
  '#06B6D4', // cyan-500
  '#F97316', // orange-500
  '#84CC16', // lime-500
  '#EC4899', // pink-500
  '#6366F1', // indigo-500
] as const

const SALES_TARGET_CONFIG = {
  color: '#FDE047', // yellow-300
  name: 'Sales Target',
  type: 'line' as const,
} as const

function validateAnalysisData(analysis: TicketTargetAnalysis): void {
  if (!analysis) {
    throw new Error('Analysis data is required')
  }

  if (!analysis.combinedData || !Array.isArray(analysis.combinedData)) {
    throw new Error('Combined data must be an array')
  }

  if (analysis.combinedData.length === 0) {
    throw new Error('Combined data cannot be empty')
  }
}

function extractUniqueCategories(combinedData: TargetVsActualData[]): string[] {
  const categories = new Set<string>()

  for (const point of combinedData) {
    if (point.categories && typeof point.categories === 'object') {
      for (const category in point.categories) {
        if (Object.prototype.hasOwnProperty.call(point.categories, category)) {
          categories.add(category)
        }
      }
    }
  }

  const hasActualSales = combinedData.some((point) => point.actual > 0)
  if (categories.size === 0 && hasActualSales) {
    categories.add('Total Sales')
  }

  return Array.from(categories).sort()
}

function createCategorySeries(
  categoriesList: string[],
  combinedData: TargetVsActualData[],
): ChartSeries[] {
  return categoriesList.map((category, index) => {
    if (category === 'Total Sales') {
      return {
        name: category,
        type: 'column' as const,
        data: combinedData.map((point) => ({
          x: point.date,
          y: point.actual,
        })),
        color: TICKET_CATEGORY_COLORS[index % TICKET_CATEGORY_COLORS.length],
      }
    }

    return {
      name: category,
      type: 'column' as const,
      data: combinedData.map((point) => ({
        x: point.date,
        y: point.categories[category] || 0,
      })),
      color: TICKET_CATEGORY_COLORS[index % TICKET_CATEGORY_COLORS.length],
    }
  })
}

function createTargetSeries(combinedData: TargetVsActualData[]): ChartSeries {
  return {
    name: SALES_TARGET_CONFIG.name,
    type: SALES_TARGET_CONFIG.type,
    data: combinedData.map((point) => ({
      x: point.date,
      y: point.target,
    })),
    color: SALES_TARGET_CONFIG.color,
  }
}

function calculateChartDebugInfo(
  categoriesList: string[],
  combinedData: TargetVsActualData[],
): ChartDebugInfo {
  const maxActualValue = Math.max(...combinedData.map((d) => d.actual), 0)
  const maxTargetValue = Math.max(...combinedData.map((d) => d.target), 0)

  return {
    totalCategories: categoriesList.length,
    categoriesList,
    dataPointsCount: combinedData.length,
    maxActualValue,
    maxTargetValue,
  }
}

export function processChartData(analysis: TicketTargetAnalysis): ChartData {
  try {
    validateAnalysisData(analysis)

    const { combinedData } = analysis
    const categoriesList = extractUniqueCategories(combinedData)
    const categorySeries = createCategorySeries(categoriesList, combinedData)
    const targetSeries = createTargetSeries(combinedData)
    const allSeries = [...categorySeries, targetSeries]
    const debugInfo = calculateChartDebugInfo(categoriesList, combinedData)

    return {
      series: allSeries,
      combinedData,
      debugInfo,
    }
  } catch {
    const emptyDebugInfo: ChartDebugInfo = {
      totalCategories: 0,
      categoriesList: [],
      dataPointsCount: 0,
      maxActualValue: 0,
      maxTargetValue: 0,
    }

    return {
      series: [],
      combinedData: [],
      debugInfo: emptyDebugInfo,
    }
  }
}
