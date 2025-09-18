import type {
  EventTicket,
  TargetDataPoint,
  SalesDataPoint,
  TargetVsActualData,
  TicketTargetAnalysis,
  TicketTargetConfig,
  TargetCurve,
  TicketCategoryBreakdown,
  TargetGenerationOptions,
  AnalyzeTicketSalesInput,
} from './types'

export function analyzeTicketSales(
  input: AnalyzeTicketSalesInput,
): TicketTargetAnalysis {
  const {
    capacity,
    salesStartDate,
    conferenceStartDate,
    targetCurve,
    milestones,
    tickets,
  } = input

  const salesStartDateObj = new Date(salesStartDate)
  const conferenceStartDateObj = new Date(conferenceStartDate)

  // Use conference start date as the end date for target progression
  // This ensures we have data all the way to the conference start
  const targetProgression = generateTargetProgression({
    startDate: salesStartDateObj,
    endDate: conferenceStartDateObj,
    capacity,
    curve: targetCurve,
    milestones,
  })

  const actualProgression = generateActualProgressionFromTickets(tickets)
  const currentSales = calculateCurrentSales(tickets)
  const combinedData = combineSalesData(targetProgression, actualProgression)

  const config: TicketTargetConfig = {
    enabled: true,
    sales_start_date: salesStartDate,
    target_curve: targetCurve,
    milestones,
  }

  const performance = calculatePerformance(
    currentSales,
    targetProgression,
    capacity,
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
}

function generateActualProgressionFromTickets(
  tickets: EventTicket[],
): SalesDataPoint[] {
  const ticketsByDate = new Map<string, EventTicket[]>()

  tickets.forEach((ticket) => {
    const dateKey = ticket.order_date.split('T')[0]
    if (!ticketsByDate.has(dateKey)) {
      ticketsByDate.set(dateKey, [])
    }
    ticketsByDate.get(dateKey)!.push(ticket)
  })

  const sortedDates = Array.from(ticketsByDate.keys()).sort()
  const progression: SalesDataPoint[] = []
  const now = new Date()

  let cumulativeTickets = 0
  let cumulativeRevenue = 0
  const cumulativeCategories: TicketCategoryBreakdown = {}
  const processedOrders = new Set<number>()

  sortedDates.forEach((date) => {
    const dayTickets = ticketsByDate.get(date)!
    const dateObj = new Date(`${date}T00:00:00.000Z`)
    const isFuture = dateObj > now

    cumulativeTickets += dayTickets.length

    dayTickets.forEach((ticket) => {
      // Only count revenue once per order since ticket.sum is the total order amount
      if (!processedOrders.has(ticket.order_id)) {
        cumulativeRevenue += parseFloat(ticket.sum)
        processedOrders.add(ticket.order_id)
      }

      const category = ticket.category
      cumulativeCategories[category] = (cumulativeCategories[category] || 0) + 1
    })

    progression.push({
      date: `${date}T00:00:00.000Z`,
      paidTickets: cumulativeTickets,
      sponsorTickets: 0, // TODO: Implement sponsor/speaker detection
      speakerTickets: 0,
      totalTickets: cumulativeTickets,
      revenue: cumulativeRevenue,
      categories: { ...cumulativeCategories },
      isFuture,
    })
  })

  return progression
}

function calculateCurrentSales(tickets: EventTicket[]): SalesDataPoint {
  const categories: TicketCategoryBreakdown = {}
  let totalRevenue = 0
  const processedOrders = new Set<number>()

  tickets.forEach((ticket) => {
    const category = ticket.category
    categories[category] = (categories[category] || 0) + 1

    // Only count revenue once per order since ticket.sum is the total order amount
    if (!processedOrders.has(ticket.order_id)) {
      totalRevenue += parseFloat(ticket.sum)
      processedOrders.add(ticket.order_id)
    }
  })

  return {
    date: new Date().toISOString(),
    paidTickets: tickets.length,
    sponsorTickets: 0, // TODO: Implement sponsor/speaker detection
    speakerTickets: 0,
    totalTickets: tickets.length,
    revenue: totalRevenue,
    categories,
    isFuture: false, // Current sales are always historical
  }
}
function generateTargetProgression(
  options: TargetGenerationOptions,
): TargetDataPoint[] {
  const { startDate, endDate, capacity, curve, milestones = [] } = options
  const targets: TargetDataPoint[] = []
  const now = new Date()

  // Calculate total duration in milliseconds and weeks
  const totalDurationMs = endDate.getTime() - startDate.getTime()
  const totalWeeks = totalDurationMs / (7 * 24 * 60 * 60 * 1000)

  const currentDate = new Date(startDate)
  let weekCount = 0

  while (currentDate <= endDate) {
    // Calculate progress based on actual duration to conference start
    const progress = totalWeeks > 0 ? Math.min(weekCount / totalWeeks, 1) : 1
    const targetPercentage = calculateCurveValue(progress, curve) * 100

    // Ensure we reach exactly 100% at the conference start date
    const isLastPoint =
      currentDate.getTime() >= endDate.getTime() - 3.5 * 24 * 60 * 60 * 1000 // Within 3.5 days
    const finalTargetPercentage = isLastPoint ? 100 : targetPercentage
    const targetTickets = Math.round((finalTargetPercentage / 100) * capacity)

    // Check if this target point is in the future
    const isFuture = currentDate > now

    const milestone = milestones.find((m) => {
      const milestoneDate = new Date(m.date)
      return (
        Math.abs(milestoneDate.getTime() - currentDate.getTime()) <
        24 * 60 * 60 * 1000
      )
    })

    targets.push({
      date: currentDate.toISOString(),
      targetTickets,
      targetPercentage: finalTargetPercentage,
      isMilestone: !!milestone,
      milestoneLabel: milestone?.label,
      isFuture,
    })

    currentDate.setDate(currentDate.getDate() + 7)
    weekCount++
  }

  return targets
}

function combineSalesData(
  targets: TargetDataPoint[],
  actuals: SalesDataPoint[],
): TargetVsActualData[] {
  const combined: TargetVsActualData[] = []
  const now = new Date()

  const sortedActuals = actuals
    .map((actual) => ({
      ...actual,
      dateObj: new Date(actual.date),
    }))
    .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime())

  const earliestSalesDate =
    sortedActuals.length > 0 ? sortedActuals[0].dateObj : null

  // Get the latest actual sales data to use for future projections
  const latestActualSales =
    sortedActuals.length > 0 ? sortedActuals[sortedActuals.length - 1] : null

  targets.forEach((target) => {
    const targetDate = new Date(target.date)
    const isFuture = targetDate > now

    let latestActual: SalesDataPoint | undefined
    if (earliestSalesDate && targetDate >= earliestSalesDate) {
      for (const actual of sortedActuals) {
        if (actual.dateObj <= targetDate) {
          latestActual = actual
        } else {
          break
        }
      }
    }

    // For future dates, use the latest actual sales data if available
    const actualData =
      latestActual ||
      (isFuture && latestActualSales ? latestActualSales : undefined)

    combined.push({
      date: target.date.split('T')[0],
      target: target.targetTickets,
      actual: actualData?.totalTickets || 0,
      actualPaid: actualData?.paidTickets || 0,
      actualSponsor: actualData?.sponsorTickets || 0,
      actualSpeaker: actualData?.speakerTickets || 0,
      revenue: actualData?.revenue || 0,
      categories: actualData?.categories || {},
      isMilestone: target.isMilestone,
      milestoneLabel: target.milestoneLabel,
      isFuture,
    })
  })

  return combined
}

function calculatePerformance(
  currentSales: SalesDataPoint,
  targets: TargetDataPoint[],
  capacity: number,
) {
  const now = new Date()
  const currentTarget = findCurrentTarget(targets, now)

  const actualPercentage = (currentSales.totalTickets / capacity) * 100
  const currentTargetPercentage = currentTarget?.targetPercentage || 0
  const variance = actualPercentage - currentTargetPercentage

  return {
    currentTargetPercentage,
    actualPercentage,
    variance,
    isOnTrack: variance >= -5,
    nextMilestone: findNextMilestone(targets, now),
    daysToNextMilestone: calculateDaysToNextMilestone(targets, now),
  }
}

function findCurrentTarget(targets: TargetDataPoint[], now: Date) {
  return targets
    .slice()
    .reverse()
    .find((target) => {
      const targetDate = new Date(target.date)
      return targetDate <= now
    })
}

function findNextMilestone(targets: TargetDataPoint[], now: Date) {
  const upcomingMilestones = targets
    .filter((target) => {
      const targetDate = new Date(target.date)
      return target.isMilestone && targetDate > now
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  if (upcomingMilestones.length > 0) {
    const nextMilestone = upcomingMilestones[0]
    return {
      date: nextMilestone.date,
      target_percentage: nextMilestone.targetPercentage,
      label: nextMilestone.milestoneLabel,
    }
  }

  return undefined
}

function calculateDaysToNextMilestone(
  targets: TargetDataPoint[],
  now: Date,
): number | undefined {
  const nextMilestone = findNextMilestone(targets, now)
  if (!nextMilestone) return undefined

  const milestoneDate = new Date(nextMilestone.date)
  const diffTime = milestoneDate.getTime() - now.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

function calculateCurveValue(progress: number, curve: TargetCurve): number {
  // Ensure we always reach exactly 1.0 at progress = 1
  if (progress >= 1) return 1
  if (progress <= 0) return 0

  switch (curve) {
    case 'linear':
      return progress
    case 'early_push':
      return Math.sqrt(progress)
    case 'late_push':
      // More aggressive exponential curve for steeper late ramp-up
      return Math.pow(progress, 3)
    case 's_curve':
      // Improved S-curve with steeper end ramp
      const k = 8
      const x = progress * k - k / 2
      const sigmoid = 1 / (1 + Math.exp(-x))
      // Normalize to ensure it reaches 1.0 at progress = 1
      const maxSigmoid = 1 / (1 + Math.exp(-k / 2))
      return sigmoid / maxSigmoid
    default:
      return progress
  }
}

export { calculateCurveValue }

export function generateCurveData(
  curve: TargetCurve,
  points = 100,
): Array<{ x: number; y: number }> {
  const data: Array<{ x: number; y: number }> = []

  for (let i = 0; i <= points; i++) {
    const x = i / points
    const y = calculateCurveValue(x, curve)
    data.push({ x, y })
  }

  return data
}

export function generateCurveSVGPath(
  curve: TargetCurve,
  width = 200,
  height = 100,
): string {
  const points = generateCurveData(curve, 50)

  let path = `M 0 ${height}`

  points.forEach((point, index) => {
    const x = point.x * width
    const y = height - point.y * height

    if (index === 0) {
      path += ` L ${x} ${y}`
    } else {
      path += ` L ${x} ${y}`
    }
  })

  return path
}

export function getCurveMetadata(curve: TargetCurve) {
  const metadata = {
    linear: {
      name: 'Linear',
      description: 'Steady, consistent growth throughout the period',
      icon: '📈',
    },
    early_push: {
      name: 'Early Push',
      description: 'Front-loaded sales with early momentum',
      icon: '🚀',
    },
    late_push: {
      name: 'Late Push',
      description: 'Back-loaded sales with final sprint',
      icon: '🏃‍♂️',
    },
    s_curve: {
      name: 'S-Curve',
      description: 'Slow start, rapid middle, steady end',
      icon: '〰️',
    },
  }

  return metadata[curve] || metadata.linear
}
