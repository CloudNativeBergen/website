import type { EventTicket, EventOrderUser } from './types'

/**
 * Configuration for ticket sales chart
 */
export interface SalesChartConfig {
  salesStartDate: string
  conferenceDate: string
  targetCurve: 'linear' | 'early_push' | 'late_push'
  capacity: number
}

/**
 * Data point for a specific week in the chart
 */
export interface WeeklyDataPoint {
  date: string // ISO date string for the week
  week: number // Week number from sales start
  actual: Record<string, number> // Ticket count by category
  actualTotal: number // Total actual tickets sold
  target: number // Target tickets for this week
}

/**
 * Chart series for ApexCharts
 */
export interface ChartSeries {
  name: string
  type: 'column' | 'line'
  data: Array<{ x: string; y: number }>
  color?: string
}

/**
 * Complete chart data ready for visualization
 */
export interface SalesChartData {
  weeks: WeeklyDataPoint[]
  series: ChartSeries[]
  categories: string[]
  maxValue: number
}

/**
 * Color palette for ticket categories
 */
const CATEGORY_COLORS = [
  '#3B82F6', // blue-500
  '#10B981', // emerald-500
  '#F59E0B', // amber-500
  '#EF4444', // red-500
  '#8B5CF6', // violet-500
  '#06B6D4', // cyan-500
] as const

/**
 * Target curve calculations - now with proper exponential curves
 */
function calculateTargetProgress(weekProgress: number, curve: string): number {
  switch (curve) {
    case 'linear':
      return weekProgress
    case 'early_push':
      // Exponential decay curve - fast start, slow finish
      return 1 - Math.exp(-3 * weekProgress)
    case 'late_push':
      // Super aggressive hockey stick curve - very slow start, explosive finish
      // Combines exponential and quadratic growth for maximum steepness in final weeks
      const exponentialComponent =
        (Math.exp(3.5 * weekProgress) - 1) / (Math.exp(3.5) - 1)
      const quadraticBoost = Math.pow(weekProgress, 3) * 0.3
      return Math.min(1, exponentialComponent + quadraticBoost)
    default:
      return weekProgress
  }
}

/**
 * Filter tickets by payment status
 */
function filterTickets(
  tickets: EventTicket[],
  includeFreeTickets: boolean,
): EventTicket[] {
  if (includeFreeTickets) {
    return tickets
  }
  return tickets.filter((ticket) => parseFloat(ticket.sum || '0') >= 1)
}

/**
 * Parse and normalize date strings to ensure consistent handling
 */
function parseDate(dateString: string): Date {
  // Handle various date formats that might come from the database
  const date = new Date(dateString)

  // If parsing failed, try alternative formats
  if (isNaN(date.getTime())) {
    // Try ISO format
    const isoDate = new Date(dateString + 'T00:00:00.000Z')
    if (!isNaN(isoDate.getTime())) {
      return isoDate
    }

    // If all else fails, return current date as fallback
    console.warn('Failed to parse date:', dateString)
    return new Date()
  }

  return date
}

/**
 * Generate weekly timeline from sales start to conference date
 */
function generateWeeklyTimeline(startDate: string, endDate: string): Date[] {
  const start = parseDate(startDate)
  const end = parseDate(endDate)
  const weeks: Date[] = []

  console.log('🗓️ Timeline parsing:', {
    startInput: startDate,
    endInput: endDate,
    startParsed: start.toISOString(),
    endParsed: end.toISOString(),
  })

  const current = new Date(start)

  // Continue generating weeks until we have a week that starts on or after the conference date
  while (current <= end) {
    weeks.push(new Date(current))
    current.setDate(current.getDate() + 7)
  }

  // Add one more week if needed to ensure we show data beyond the conference date
  if (weeks.length > 0) {
    const lastWeek = weeks[weeks.length - 1]
    const daysBetweenLastWeekAndConference = Math.floor(
      (end.getTime() - lastWeek.getTime()) / (1000 * 60 * 60 * 24),
    )

    // If the conference is more than 3 days after the last week start, add another week
    if (daysBetweenLastWeekAndConference >= 3) {
      weeks.push(new Date(current))
    }
  }

  return weeks
}

/**
 * Group tickets by actual purchase week using real order creation dates
 */
function groupTicketsByWeek(
  tickets: EventTicket[],
  weeks: Date[],
): Record<string, Record<string, number>> {
  const weeklyData: Record<string, Record<string, number>> = {}

  // Initialize all weeks with empty data
  weeks.forEach((week) => {
    weeklyData[week.toISOString()] = {}
  })

  // Group tickets by their actual purchase week
  tickets.forEach((ticket) => {
    const category = ticket.category || 'Unknown'

    // Use actual order creation date if available
    let purchaseDate: Date
    if (ticket.order?.createdAt) {
      purchaseDate = new Date(ticket.order.createdAt)
    } else {
      // Fallback: assume recent purchases if no order date
      // This handles cases where order data might not be available
      console.warn(
        `⚠️ No order date found for ticket ${ticket.id}, using current week`,
      )
      purchaseDate = new Date()
    }

    // Find the week this ticket belongs to
    const ticketWeek = weeks.find((week) => {
      const weekEnd = new Date(week)
      weekEnd.setDate(weekEnd.getDate() + 7)
      return purchaseDate >= week && purchaseDate < weekEnd
    })

    if (ticketWeek) {
      const weekKey = ticketWeek.toISOString()
      weeklyData[weekKey][category] = (weeklyData[weekKey][category] || 0) + 1
    } else {
      // If ticket purchase is outside our timeline, place it in the most appropriate week
      if (purchaseDate < weeks[0]) {
        // Very old purchases go to first week
        const firstWeekKey = weeks[0].toISOString()
        weeklyData[firstWeekKey][category] =
          (weeklyData[firstWeekKey][category] || 0) + 1
      } else if (purchaseDate >= weeks[weeks.length - 1]) {
        // Recent purchases go to last week
        const lastWeekKey = weeks[weeks.length - 1].toISOString()
        weeklyData[lastWeekKey][category] =
          (weeklyData[lastWeekKey][category] || 0) + 1
      }
    }
  })

  // Convert to cumulative counts for display
  const cumulativeData: Record<string, Record<string, number>> = {}
  const categories = new Set<string>()

  // Collect all categories
  Object.values(weeklyData).forEach((weekData) => {
    Object.keys(weekData).forEach((category) => categories.add(category))
  })

  // Calculate cumulative totals for each category
  const runningTotals: Record<string, number> = {}
  categories.forEach((category) => {
    runningTotals[category] = 0
  })

  weeks.forEach((week) => {
    const weekKey = week.toISOString()
    cumulativeData[weekKey] = {}

    categories.forEach((category) => {
      // Add this week's new tickets to running total
      runningTotals[category] += weeklyData[weekKey][category] || 0
      cumulativeData[weekKey][category] = runningTotals[category]
    })
  })

  console.log('📅 Real purchase date distribution:', {
    totalTickets: tickets.length,
    ticketsWithDates: tickets.filter((t) => t.order?.createdAt).length,
    ticketsWithoutDates: tickets.filter((t) => !t.order?.createdAt).length,
    samplePurchaseDates: tickets
      .filter((t) => t.order?.createdAt)
      .slice(0, 3)
      .map((t) => ({ category: t.category, date: t.order?.createdAt })),
  })

  return cumulativeData
}

/**
 * Main function to generate sales chart data
 */
export function generateSalesChartData(
  tickets: EventTicket[],
  config: SalesChartConfig,
  includeFreeTickets?: boolean,
): SalesChartData
export function generateSalesChartData(
  tickets: EventOrderUser[],
  config: SalesChartConfig,
  includeFreeTickets?: boolean,
): SalesChartData
export function generateSalesChartData(
  tickets: EventTicket[] | EventOrderUser[],
  config: SalesChartConfig,
  includeFreeTickets: boolean = false,
): SalesChartData {
  console.log('📊 Generating sales chart data:', {
    salesStartDate: config.salesStartDate,
    conferenceDate: config.conferenceDate,
    capacity: config.capacity,
    targetCurve: config.targetCurve,
    ticketCount: tickets.length,
    includeFreeTickets,
  })

  // Type detection: EventOrderUser has 'orderId', EventTicket has 'order_id'
  const isEventOrderUser = tickets.length > 0 && 'orderId' in tickets[0]

  if (isEventOrderUser) {
    return generateSalesChartDataFromEventOrderUsers(
      tickets as EventOrderUser[],
      config,
      includeFreeTickets,
    )
  } else {
    return generateSalesChartDataFromEventTickets(
      tickets as EventTicket[],
      config,
      includeFreeTickets,
    )
  }
}

/**
 * Generate sales chart data from EventTicket[] (legacy format)
 */
function generateSalesChartDataFromEventTickets(
  tickets: EventTicket[],
  config: SalesChartConfig,
  includeFreeTickets: boolean,
): SalesChartData {
  console.log('🗓️ Date parsing check:', {
    salesStartParsed: new Date(config.salesStartDate).toISOString(),
    conferenceParsed: new Date(config.conferenceDate).toISOString(),
    expectedConferenceDate: '2025-10-27',
    actualConferenceDate: config.conferenceDate,
  })

  // Filter tickets based on payment status
  const filteredTickets = filterTickets(tickets, includeFreeTickets)

  // Generate weekly timeline
  const weeks = generateWeeklyTimeline(
    config.salesStartDate,
    config.conferenceDate,
  )

  console.log('📅 Generated timeline:', {
    totalWeeks: weeks.length,
    firstWeek: weeks[0]?.toISOString(),
    lastWeek: weeks[weeks.length - 1]?.toISOString(),
    today: new Date().toISOString(),
    expectedWeeks: 'Should be ~17 weeks from July to October',
  }) // Group tickets by week and category (cumulative)
  const weeklyTicketData = groupTicketsByWeek(filteredTickets, weeks)

  // Extract all categories
  const categories = Array.from(
    new Set(filteredTickets.map((ticket) => ticket.category || 'Unknown')),
  ).sort()

  // Generate weekly data points
  const weeklyDataPoints: WeeklyDataPoint[] = weeks.map((week, index) => {
    const weekKey = week.toISOString()
    const weekProgress = index / Math.max(weeks.length - 1, 1)
    const targetProgress = calculateTargetProgress(
      weekProgress,
      config.targetCurve,
    )

    // Calculate total for this week
    const actualTotal = Object.values(weeklyTicketData[weekKey] || {}).reduce(
      (sum, count) => sum + count,
      0,
    )

    return {
      date: weekKey,
      week: index + 1,
      actual: weeklyTicketData[weekKey] || {},
      actualTotal,
      target: Math.round(targetProgress * config.capacity),
    }
  })

  // Generate chart series for categories (stacked columns)
  const categorySeries: ChartSeries[] = categories.map((category, index) => ({
    name: category,
    type: 'column',
    data: weeklyDataPoints.map((point) => ({
      x: new Date(point.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      y: point.actual[category] || 0,
    })),
    color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
  }))

  // Generate target line series (separate from stacked columns)
  const targetSeries: ChartSeries = {
    name: 'Sales Target',
    type: 'line',
    data: weeklyDataPoints.map((point) => ({
      x: new Date(point.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      y: point.target,
    })),
    color: '#EA580C', // orange-600 - very visible in both light and dark modes
  }

  console.log('🎯 Target line data points:', targetSeries.data.length)
  console.log('📈 Categories found:', categories.length, categories)
  console.log(
    '📊 Target curve peaks at:',
    Math.max(...weeklyDataPoints.map((p) => p.target)),
  )
  console.log('🔍 Sample target data:', targetSeries.data.slice(0, 3))

  const allSeries = [...categorySeries, targetSeries]
  const maxValue = Math.max(
    config.capacity,
    ...weeklyDataPoints.map((p) => p.actualTotal),
    ...weeklyDataPoints.map((p) => p.target),
  )

  return {
    weeks: weeklyDataPoints,
    series: allSeries,
    categories,
    maxValue,
  }
}

/**
 * Generate sales chart data from EventOrderUser[] (new format)
 */
function generateSalesChartDataFromEventOrderUsers(
  tickets: EventOrderUser[],
  config: SalesChartConfig,
  includeFreeTickets: boolean,
): SalesChartData {
  console.log('🗓️ Date parsing check:', {
    salesStartParsed: new Date(config.salesStartDate).toISOString(),
    conferenceParsed: new Date(config.conferenceDate).toISOString(),
    expectedConferenceDate: '2025-10-27',
    actualConferenceDate: config.conferenceDate,
  })

  // Filter tickets based on payment status (EventOrderUser uses different logic)
  // For mixed orders (free + paid), we include the ticket if it has any paid component
  const filteredTickets = includeFreeTickets
    ? tickets
    : tickets.filter((ticket) => {
        console.log('🔍 Filtering ticket:', {
          id: ticket.id,
          isPaid: ticket.isPaid,
          ticketName: ticket.ticket?.name,
          hasPriceData: !!ticket.price && Array.isArray(ticket.price),
        })

        // For EventOrderUser, if isPaid is true, we accept it
        // The isPaid field should already indicate if this ticket was paid for
        if (ticket.isPaid) {
          console.log('✅ Ticket accepted: isPaid=true')
          return true
        }

        // If not marked as paid but includeFreeTickets is false, check price components
        if (ticket.price && Array.isArray(ticket.price)) {
          const hasPaidComponent = ticket.price.some(
            (p) => Number(p.price || 0) > 0,
          )
          if (hasPaidComponent) {
            console.log('✅ Ticket accepted: has paid component')
            return true
          }
        }

        console.log('❌ Ticket rejected: not paid and no paid components')
        return false
      })

  // Find the earliest actual purchase date to adjust timeline
  const purchaseDates = filteredTickets
    .map((ticket) => ticket.createdAt)
    .filter((date) => date)
    .map((date) => new Date(date))
    .sort((a, b) => a.getTime() - b.getTime())

  const earliestPurchase = purchaseDates[0]
  const configuredStart = new Date(config.salesStartDate)

  // Use the earlier of configured start date or earliest purchase date
  const actualStartDate =
    earliestPurchase && earliestPurchase < configuredStart
      ? earliestPurchase.toISOString().split('T')[0] // Convert to YYYY-MM-DD format
      : config.salesStartDate

  console.log('📅 Timeline adjustment:', {
    configuredStart: config.salesStartDate,
    earliestPurchase: earliestPurchase?.toISOString().split('T')[0] || 'none',
    actualStartDate,
    purchaseCount: purchaseDates.length,
  })

  // Generate weekly timeline using adjusted start date
  const weeks = generateWeeklyTimeline(actualStartDate, config.conferenceDate)

  console.log('📅 Generated timeline:', {
    totalWeeks: weeks.length,
    firstWeek: weeks[0]?.toISOString(),
    lastWeek: weeks[weeks.length - 1]?.toISOString(),
    today: new Date().toISOString(),
    expectedWeeks: 'Should be ~17 weeks from July to October',
  })

  // Group tickets by week and category using EventOrderUser structure
  const weeklyTicketData = groupEventOrderUsersByWeek(filteredTickets, weeks)

  // Extract all categories from ticket names
  const categories = Array.from(
    new Set(filteredTickets.map((ticket) => ticket.ticket?.name || 'Unknown')),
  ).sort()

  console.log('📅 Real purchase date distribution:', {
    totalTickets: filteredTickets.length,
    ticketsWithDates: filteredTickets.filter((t) => t.createdAt).length,
    ticketsWithoutDates: filteredTickets.filter((t) => !t.createdAt).length,
    samplePurchaseDates: filteredTickets.slice(0, 3).map((t) => t.createdAt),
  })

  // Generate weekly data points
  const weeklyDataPoints: WeeklyDataPoint[] = weeks.map((week, index) => {
    const weekKey = week.toISOString()
    const weekProgress = index / Math.max(weeks.length - 1, 1)
    const targetProgress = calculateTargetProgress(
      weekProgress,
      config.targetCurve,
    )

    // Calculate total for this week
    const actualTotal = Object.values(weeklyTicketData[weekKey] || {}).reduce(
      (sum, count) => sum + count,
      0,
    )

    return {
      date: weekKey,
      week: index + 1,
      actual: weeklyTicketData[weekKey] || {},
      actualTotal,
      target: Math.round(targetProgress * config.capacity),
    }
  })

  // Generate chart series for categories (stacked columns) with future transparency
  const today = new Date()
  const categorySeries: ChartSeries[] = categories.map((category, index) => {
    const baseColor = CATEGORY_COLORS[index % CATEGORY_COLORS.length]

    return {
      name: category,
      type: 'column',
      data: weeklyDataPoints.map((point) => {
        const pointDate = new Date(point.date)
        const isFuture = pointDate > today

        return {
          x: new Date(point.date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          }),
          y: point.actual[category] || 0,
          fillColor: isFuture ? `${baseColor}40` : baseColor, // Add 40 for 25% opacity in hex
        }
      }),
      color: baseColor,
    }
  })

  // Generate target line series (separate from stacked columns) with future transparency
  const targetSeries: ChartSeries = {
    name: 'Sales Target',
    type: 'line',
    data: weeklyDataPoints.map((point) => {
      const pointDate = new Date(point.date)
      const isFuture = pointDate > today

      return {
        x: new Date(point.date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        y: point.target,
        strokeColor: isFuture ? '#EA580C80' : '#EA580C', // Add 80 for 50% opacity in hex
      }
    }),
    color: '#EA580C', // orange-600 - very visible in both light and dark modes
  }

  console.log('🎯 Target line data points:', targetSeries.data.length)
  console.log('📈 Categories found:', categories.length, categories)
  console.log(
    '📊 Target curve peaks at:',
    Math.max(...weeklyDataPoints.map((p) => p.target)),
  )
  console.log('🔍 Sample target data:', targetSeries.data.slice(0, 3))

  const allSeries = [...categorySeries, targetSeries]
  const maxValue = Math.max(
    config.capacity,
    ...weeklyDataPoints.map((p) => p.actualTotal),
    ...weeklyDataPoints.map((p) => p.target),
  )

  return {
    weeks: weeklyDataPoints,
    series: allSeries,
    categories,
    maxValue,
  }
}

/**
 * Group EventOrderUser tickets by week (for purchase date tracking)
 */
function groupEventOrderUsersByWeek(
  tickets: EventOrderUser[],
  weeks: Date[],
): Record<string, Record<string, number>> {
  const weeklyData: Record<string, Record<string, number>> = {}

  // Initialize all weeks
  weeks.forEach((week) => {
    weeklyData[week.toISOString()] = {}
  })

  // Track cumulative sales per category per week
  tickets.forEach((ticket) => {
    const category = ticket.ticket?.name || 'Unknown'
    const purchaseDate = ticket.createdAt
      ? new Date(ticket.createdAt)
      : new Date()

    // Find which week this purchase falls into
    let targetWeek = weeks[weeks.length - 1] // Default to last week if date is in future

    if (!ticket.createdAt) {
      console.warn(
        `⚠️ No order date found for ticket ${ticket.id}, using current week`,
      )
    }

    for (const week of weeks) {
      if (purchaseDate >= week) {
        targetWeek = week
      } else {
        break
      }
    }

    // Add to all weeks from target week onwards (cumulative)
    let found = false
    for (const week of weeks) {
      if (week >= targetWeek) {
        found = true
      }
      if (found) {
        const weekKey = week.toISOString()
        weeklyData[weekKey][category] = (weeklyData[weekKey][category] || 0) + 1
      }
    }
  })

  return weeklyData
}

/**
 * Calculate current sales summary
 */
export function calculateSalesSummary(
  chartData: SalesChartData,
  capacity: number,
): {
  totalSold: number
  percentageOfCapacity: number
  currentTarget: number
  isOnTrack: boolean
} {
  const today = new Date()
  const currentWeek = chartData.weeks.find((week) => {
    const weekDate = new Date(week.date)
    const nextWeek = new Date(weekDate)
    nextWeek.setDate(nextWeek.getDate() + 7)
    return weekDate <= today && today < nextWeek
  })

  const totalSold =
    chartData.weeks[chartData.weeks.length - 1]?.actualTotal || 0
  const currentTarget = currentWeek?.target || 0

  return {
    totalSold,
    percentageOfCapacity: (totalSold / capacity) * 100,
    currentTarget,
    isOnTrack: totalSold >= currentTarget,
  }
}
