import type { EventTicket, GroupedOrder, EventOrderUser } from './checkin'
import type {
  TicketTargetAnalysis,
  TicketTargetConfig,
  SalesDataPoint,
  TargetDataPoint,
  TargetVsActualData,
  ConferenceWithTargets,
} from './targets'
import {
  groupTicketsByOrder,
  fetchAllEventTicketsWithPurchaseDates,
} from './checkin'
import { calculateCurveValue } from './target-curves'
import { extractPurchaseTimeline } from './adapters'

// Constants for better maintainability
const DEFAULT_CAPACITY = 250
const DEFAULT_TARGET_WEEKS = 12
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000
const MILLISECONDS_PER_WEEK = 7 * MILLISECONDS_PER_DAY
const DAYS_BUFFER_FOR_RECENT_DATA = 7

/**
 * Main function to analyze ticket targets vs actual sales
 * @param conference - Conference configuration with target settings
 * @param tickets - Array of event tickets from CheckIn.no
 * @param orderUsers - Array of event order users with purchase dates (optional, will fetch if not provided)
 * @returns Complete ticket target analysis or null if not enabled
 */
export async function analyzeTicketTargets(
  conference: ConferenceWithTargets,
  tickets: EventTicket[],
  orderUsers?: EventOrderUser[],
): Promise<TicketTargetAnalysis | null> {
  try {
    const config = conference.ticket_targets

    if (!config?.enabled) {
      return null
    }

    const orders = groupTicketsByOrder(tickets)
    const currentSales = calculateCurrentSales(tickets, orders)
    const capacity = conference.ticket_capacity || DEFAULT_CAPACITY
    const targetProgression = generateTargetProgression(config, capacity)

    // Fetch order users if not provided
    let eventOrderUsers = orderUsers
    if (!eventOrderUsers) {
      eventOrderUsers = await fetchAllEventTicketsWithPurchaseDates(
        conference.checkin_customer_id!,
        conference.checkin_event_id!,
      )
    }

    // Generate actual sales progression
    const actualProgression = generateActualProgression(
      tickets,
      eventOrderUsers,
    )

    // Combine data for visualization
    const combinedData = combineSalesData(targetProgression, actualProgression)

    // Calculate performance metrics
    const performance = calculatePerformance(
      currentSales,
      targetProgression,
      capacity,
      config,
    )

    return {
      config,
      capacity,
      currentSales,
      targetProgression,
      actualProgression,
      combinedData,
      performance,
    }
  } catch (error) {
    console.error('Error analyzing ticket targets:', error)
    return null
  }
}

/**
 * Calculate current sales statistics from tickets and orders
 * @param tickets - Array of event tickets
 * @param orders - Array of grouped orders
 * @returns Current sales data point with totals and categories
 */
function calculateCurrentSales(
  tickets: EventTicket[],
  orders: GroupedOrder[],
): SalesDataPoint {
  // Simple counting - each ticket record = 1 ticket
  const paidTickets = tickets.length

  // Calculate category breakdown - simple count
  const categories: Record<string, number> = {}
  for (const ticket of tickets) {
    const category = ticket.category || 'Unknown'
    categories[category] = (categories[category] || 0) + 1
  }

  // Calculate totals from orders
  const revenue = orders.reduce(
    (sum, order) => sum + (order.totalAmount || 0),
    0,
  )

  return {
    date: new Date().toISOString(),
    paidTickets,
    sponsorTickets: 0, // This would be calculated from sponsor allocations
    speakerTickets: 0, // This would be calculated from speaker allocations
    totalTickets: paidTickets,
    revenue,
    categories,
  }
}

/**
 * Generate target progression based on configuration
 * @param config - Target configuration settings
 * @param capacity - Maximum ticket capacity
 * @returns Array of target data points over time
 */
function generateTargetProgression(
  config: TicketTargetConfig,
  capacity: number,
): TargetDataPoint[] {
  const targets: TargetDataPoint[] = []
  const salesStart = config.sales_start_date
    ? new Date(config.sales_start_date)
    : new Date()

  // Add weekly targets for next 12 weeks
  for (let week = 0; week < DEFAULT_TARGET_WEEKS; week++) {
    const targetDate = new Date(salesStart)
    targetDate.setDate(targetDate.getDate() + week * 7)

    // Calculate progression factor based on curve type
    // Use (week / (DEFAULT_TARGET_WEEKS - 1)) to ensure final week reaches t = 1.0
    const progressionFactor = calculateCurveValue(
      config.target_curve || 'late_push',
      week / (DEFAULT_TARGET_WEEKS - 1),
    )
    const targetPercentage = progressionFactor * 100
    const targetTickets = Math.round((targetPercentage / 100) * capacity)

    // Check for milestones near this date
    const milestone = config.milestones?.find((m) => {
      const milestoneDate = new Date(m.date)
      return (
        Math.abs(milestoneDate.getTime() - targetDate.getTime()) <
        MILLISECONDS_PER_DAY
      )
    })

    targets.push({
      date: targetDate.toISOString(),
      targetTickets,
      targetPercentage,
      isMilestone: !!milestone,
      milestoneLabel: milestone?.label,
    })
  }

  return targets
}

/**
 * Generate actual sales progression over time based on purchase dates
 * Uses EventOrderUser data to get purchase dates in a single API call
 * @param tickets - Array of event tickets
 * @param orderUsers - Array of event order users with purchase dates
 * @returns Array of sales data points showing cumulative progress
 */
function generateActualProgression(
  tickets: EventTicket[],
  orderUsers: EventOrderUser[],
): SalesDataPoint[] {
  try {
    // Extract purchase timeline from order users and tickets
    const purchaseTimeline = extractPurchaseTimeline(orderUsers, tickets)

    // Sort by purchase date
    purchaseTimeline.sort((a, b) => a.date.getTime() - b.date.getTime())

    // Build cumulative progression
    return buildCumulativeProgressionFromTimeline(purchaseTimeline)
  } catch (error) {
    console.error('Error generating sales progression:', error)
    return createFallbackProgression(tickets, [])
  }
}

/**
 * Build cumulative sales progression from purchase timeline data
 * @param timeline - Array of purchase events with dates and ticket counts
 * @returns Array of cumulative sales data points
 */
function buildCumulativeProgressionFromTimeline(
  timeline: Array<{
    orderId: number
    date: Date
    ticketCount: number
    revenue: number
    categories: string[]
  }>,
): SalesDataPoint[] {
  const progression: SalesDataPoint[] = []
  let cumulativeTickets = 0
  let cumulativeRevenue = 0
  const cumulativeCategories: Record<string, number> = {}

  // Track unique dates to avoid duplicate entries
  const processedDates = new Set<string>()

  for (const { date, ticketCount, revenue, categories } of timeline) {
    const dateKey = date.toISOString().split('T')[0] // Use date only, not time

    // Add tickets and revenue from this order
    cumulativeTickets += ticketCount
    cumulativeRevenue += revenue

    // Add category breakdown from this order
    for (const category of categories) {
      // Approximate category distribution based on ticket count
      const categoryTickets = Math.ceil(ticketCount / categories.length)
      cumulativeCategories[category] =
        (cumulativeCategories[category] || 0) + categoryTickets
    }

    // Only add one entry per day (the latest state for that day)
    if (!processedDates.has(dateKey)) {
      const dataPoint: SalesDataPoint = {
        date: date.toISOString(),
        paidTickets: cumulativeTickets,
        sponsorTickets: 0,
        speakerTickets: 0,
        totalTickets: cumulativeTickets,
        revenue: cumulativeRevenue,
        categories: { ...cumulativeCategories },
      }

      progression.push(dataPoint)
      processedDates.add(dateKey)
    } else {
      // Update the existing entry for this date with the latest cumulative values
      const existingIndex = progression.findIndex(
        (p) => p.date.split('T')[0] === dateKey,
      )
      if (existingIndex !== -1) {
        progression[existingIndex] = {
          date: date.toISOString(),
          paidTickets: cumulativeTickets,
          sponsorTickets: 0,
          speakerTickets: 0,
          totalTickets: cumulativeTickets,
          revenue: cumulativeRevenue,
          categories: { ...cumulativeCategories },
        }
      }
    }
  }

  return progression
}

/**
 * Build cumulative sales progression from ordered purchase dates
 * @param orderDates - Array of orders with their purchase dates
 * @returns Array of cumulative sales data points
 */
function buildCumulativeProgression(
  orderDates: Array<{ orderId: number; date: Date; order: GroupedOrder }>,
): SalesDataPoint[] {
  const progression: SalesDataPoint[] = []
  let cumulativeTickets = 0
  let cumulativeRevenue = 0
  const cumulativeCategories: Record<string, number> = {}

  // Track unique dates to avoid duplicate entries
  const processedDates = new Set<string>()

  for (const { date, order } of orderDates) {
    const dateKey = date.toISOString().split('T')[0] // Use date only, not time

    // Add tickets and revenue from this order
    const orderTicketCount = order.tickets.length
    cumulativeTickets += orderTicketCount
    cumulativeRevenue += order.totalAmount || 0

    // Add category breakdown from this order's tickets
    for (const ticket of order.tickets) {
      const category = ticket.category || 'Unknown'
      cumulativeCategories[category] = (cumulativeCategories[category] || 0) + 1
    }

    // Only add one entry per day (the latest state for that day)
    if (!processedDates.has(dateKey)) {
      const dataPoint: SalesDataPoint = {
        date: date.toISOString(),
        paidTickets: cumulativeTickets,
        sponsorTickets: 0,
        speakerTickets: 0,
        totalTickets: cumulativeTickets,
        revenue: cumulativeRevenue,
        categories: { ...cumulativeCategories },
      }

      progression.push(dataPoint)
      processedDates.add(dateKey)
    } else {
      // Update the existing entry for this date with the latest cumulative values
      const existingIndex = progression.findIndex(
        (p) => p.date.split('T')[0] === dateKey,
      )
      if (existingIndex !== -1) {
        progression[existingIndex] = {
          date: date.toISOString(),
          paidTickets: cumulativeTickets,
          sponsorTickets: 0,
          speakerTickets: 0,
          totalTickets: cumulativeTickets,
          revenue: cumulativeRevenue,
          categories: { ...cumulativeCategories },
        }
      }
    }
  }

  return progression
}

/**
 * Create fallback progression when API calls fail
 * @param tickets - Array of event tickets
 * @param orders - Array of grouped orders
 * @returns Single-point fallback progression
 */
function createFallbackProgression(
  tickets: EventTicket[],
  orders: GroupedOrder[],
): SalesDataPoint[] {
  const categories: Record<string, number> = {}
  for (const ticket of tickets) {
    const category = ticket.category || 'Unknown'
    categories[category] = (categories[category] || 0) + 1
  }

  const paidTickets = tickets.length
  const revenue = orders.reduce(
    (sum, order) => sum + (order.totalAmount || 0),
    0,
  )

  return [
    {
      date: new Date().toISOString(),
      paidTickets,
      sponsorTickets: 0,
      speakerTickets: 0,
      totalTickets: paidTickets,
      revenue,
      categories,
    },
  ]
}

/**
 * Combine target and actual data for visualization
 * @param targets - Array of target data points
 * @param actuals - Array of actual sales data points
 * @returns Combined array of target vs actual data
 */
function combineSalesData(
  targets: TargetDataPoint[],
  actuals: SalesDataPoint[],
): TargetVsActualData[] {
  const combined: TargetVsActualData[] = []
  const now = new Date()

  // Create data points by merging targets with actuals
  for (const target of targets) {
    const targetDate = new Date(target.date)
    const isFuture = targetDate > now

    // Initialize cumulative data
    let cumulativeData = {
      paidTickets: 0,
      sponsorTickets: 0,
      speakerTickets: 0,
      totalTickets: 0,
      revenue: 0,
      categories: {} as Record<string, number>,
    }

    if (!isFuture && actuals.length > 0) {
      // Find all sales up to this target date
      const salesUpToDate = actuals.filter((actual) => {
        const actualDate = new Date(actual.date)
        return actualDate <= targetDate
      })

      if (salesUpToDate.length > 0) {
        // Use the latest actual data up to this date (should be cumulative)
        const latestActual = salesUpToDate[salesUpToDate.length - 1]
        cumulativeData = {
          paidTickets: latestActual.paidTickets,
          sponsorTickets: latestActual.sponsorTickets,
          speakerTickets: latestActual.speakerTickets,
          totalTickets: latestActual.totalTickets,
          revenue: latestActual.revenue,
          categories: latestActual.categories,
        }
      }

      // For recent target dates (within buffer days of now), always use the latest actual data
      const daysDiff =
        Math.abs(targetDate.getTime() - now.getTime()) / MILLISECONDS_PER_DAY
      if (daysDiff <= DAYS_BUFFER_FOR_RECENT_DATA && actuals.length > 0) {
        const latestActual = actuals[actuals.length - 1]
        cumulativeData = {
          paidTickets: latestActual.paidTickets,
          sponsorTickets: latestActual.sponsorTickets,
          speakerTickets: latestActual.speakerTickets,
          totalTickets: latestActual.totalTickets,
          revenue: latestActual.revenue,
          categories: latestActual.categories,
        }
      }
    }

    combined.push({
      date: target.date,
      target: target.targetTickets,
      actual: cumulativeData.totalTickets,
      actualPaid: cumulativeData.paidTickets,
      actualSponsor: cumulativeData.sponsorTickets,
      actualSpeaker: cumulativeData.speakerTickets,
      categories: cumulativeData.categories,
      revenue: cumulativeData.revenue,
      isMilestone: target.isMilestone,
      milestoneLabel: target.milestoneLabel,
      isFuture,
    })
  }

  return combined
}

/**
 * Calculate performance metrics comparing actual vs target sales
 * @param currentSales - Current sales data
 * @param targets - Array of target data points
 * @param capacity - Maximum ticket capacity
 * @param config - Target configuration
 * @returns Performance metrics and milestone information
 */
function calculatePerformance(
  currentSales: SalesDataPoint,
  targets: TargetDataPoint[],
  capacity: number,
  config: TicketTargetConfig,
) {
  const now = new Date()

  // Find the current target (within a week of now)
  const currentTarget = targets.find((t) => {
    const targetDate = new Date(t.date)
    return (
      Math.abs(targetDate.getTime() - now.getTime()) < MILLISECONDS_PER_WEEK
    )
  })

  const currentTargetPercentage = currentTarget?.targetPercentage || 0
  const actualPercentage = (currentSales.totalTickets / capacity) * 100
  const variance = actualPercentage - currentTargetPercentage
  const isOnTrack = variance >= 0

  // Find next milestone
  const nextMilestone = config.milestones?.find((m) => new Date(m.date) > now)
  const daysToNextMilestone = nextMilestone
    ? Math.ceil(
        (new Date(nextMilestone.date).getTime() - now.getTime()) /
          MILLISECONDS_PER_DAY,
      )
    : undefined

  return {
    currentTargetPercentage,
    actualPercentage,
    variance,
    isOnTrack,
    nextMilestone,
    daysToNextMilestone,
  }
}
