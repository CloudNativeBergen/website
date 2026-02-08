import type {
  ProcessTicketSalesInput,
  TicketAnalysisResult,
  DailySales,
  CumulativeSales,
  TargetPoint,
  CombinedDataPoint,
  PerformanceMetrics,
  TicketStatistics,
  SalesTargetConfig,
} from './types'

export const SPONSOR_TIER_TICKET_ALLOCATION: Record<string, number> = {
  Pod: 2,
  Service: 3,
  Ingress: 5,
}

export class TicketSalesProcessor {
  private readonly tickets: ProcessTicketSalesInput['tickets']
  private readonly config: SalesTargetConfig
  private readonly capacity: number
  private readonly conference: ProcessTicketSalesInput['conference']
  private readonly conferenceDate: string
  private readonly speakerCount: number
  private readonly today: Date

  constructor(input: ProcessTicketSalesInput) {
    this.tickets = input.tickets
    this.config = input.config
    this.capacity = input.capacity
    this.conference = input.conference
    this.conferenceDate = input.conferenceDate
    this.speakerCount = input.speakerCount
    this.today = new Date()
  }

  public process(): TicketAnalysisResult {
    const dailySales = this.calculateDailySales()
    const cumulativeProgression =
      this.calculateCumulativeProgression(dailySales)
    const targetProgression = this.calculateTargetProgression()
    const combinedProgression = this.combineSalesData(
      targetProgression,
      cumulativeProgression,
    )
    const statistics = this.calculateStatistics()
    const performance = this.calculatePerformance(targetProgression, statistics)

    return {
      statistics,
      progression: combinedProgression,
      performance,
      capacity: this.capacity,
    }
  }

  private calculateDailySales(): Map<string, DailySales> {
    const dailyGroups = new Map<string, ProcessTicketSalesInput['tickets']>()

    this.tickets.forEach((ticket) => {
      const date = ticket.order_date.split('T')[0]
      if (!dailyGroups.has(date)) {
        dailyGroups.set(date, [])
      }
      dailyGroups.get(date)!.push(ticket)
    })

    const dailySales = new Map<string, DailySales>()
    for (const [date, tickets] of dailyGroups) {
      const categoryBreakdown: Record<string, number> = {}
      const processedOrders = new Set<number>()
      let totalRevenue = 0

      tickets.forEach((ticket) => {
        categoryBreakdown[ticket.category] =
          (categoryBreakdown[ticket.category] || 0) + 1

        if (!processedOrders.has(ticket.order_id)) {
          totalRevenue += parseFloat(ticket.sum)
          processedOrders.add(ticket.order_id)
        }
      })

      dailySales.set(date, {
        date,
        paidTickets: tickets.length,
        totalRevenue,
        categoryBreakdown,
        orderCount: processedOrders.size,
      })
    }

    return dailySales
  }

  private calculateCumulativeProgression(
    dailySales: Map<string, DailySales>,
  ): CumulativeSales[] {
    const sortedDates = Array.from(dailySales.keys()).sort()
    const progression: CumulativeSales[] = []

    let cumulativeTickets = 0
    let cumulativeRevenue = 0
    let cumulativeOrders = 0
    const cumulativeCategories: Record<string, number> = {}

    for (const date of sortedDates) {
      const daily = dailySales.get(date)!

      cumulativeTickets += daily.paidTickets
      cumulativeRevenue += daily.totalRevenue
      cumulativeOrders += daily.orderCount

      for (const [category, count] of Object.entries(daily.categoryBreakdown)) {
        cumulativeCategories[category] =
          (cumulativeCategories[category] || 0) + count
      }

      progression.push({
        date,
        totalPaidTickets: cumulativeTickets,
        totalRevenue: cumulativeRevenue,
        categoryBreakdown: { ...cumulativeCategories },
        totalOrders: cumulativeOrders,
      })
    }

    return progression
  }

  private calculateTargetProgression(): TargetPoint[] {
    const startDate = new Date(this.config.sales_start_date)
    const endDate = new Date(this.conferenceDate)
    const totalDays =
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)

    const targets: TargetPoint[] = []
    const currentDate = new Date(startDate)

    while (currentDate <= endDate) {
      const daysElapsed =
        (currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      const progress = Math.min(daysElapsed / totalDays, 1)

      const targetPercentage = this.calculateCurveValue(progress) * 100
      const targetTickets = Math.round((targetPercentage / 100) * this.capacity)

      const milestone = this.config.milestones.find((m) => {
        const milestoneDate = new Date(m.date)
        return (
          Math.abs(milestoneDate.getTime() - currentDate.getTime()) <
          24 * 60 * 60 * 1000
        )
      })

      targets.push({
        date: currentDate.toISOString().split('T')[0],
        targetTickets,
        targetPercentage,
        isMilestone: !!milestone,
        milestoneLabel: milestone?.label || null,
      })

      currentDate.setDate(currentDate.getDate() + 7)
    }

    const lastTarget = targets[targets.length - 1]
    const endDateStr = endDate.toISOString().split('T')[0]

    if (!lastTarget || lastTarget.date !== endDateStr) {
      const finalMilestone = this.config.milestones.find((m) => {
        const milestoneDate = new Date(m.date)
        return (
          Math.abs(milestoneDate.getTime() - endDate.getTime()) <
          24 * 60 * 60 * 1000
        )
      })

      targets.push({
        date: endDateStr,
        targetTickets: this.capacity,
        targetPercentage: 100,
        isMilestone: !!finalMilestone,
        milestoneLabel: finalMilestone?.label || null,
      })
    }

    return targets
  }

  private calculateCurveValue(progress: number): number {
    if (progress >= 1) return 1
    if (progress <= 0) return 0

    switch (this.config.target_curve) {
      case 'linear':
        return progress
      case 'early_push':
        return Math.sqrt(progress)
      case 'late_push':
        return Math.pow(progress, 3)
      case 's_curve':
        const k = 8
        const x = progress * k - k / 2
        const sigmoid = 1 / (1 + Math.exp(-x))
        const maxSigmoid = 1 / (1 + Math.exp(-k / 2))
        return sigmoid / maxSigmoid
      default:
        return progress
    }
  }

  private combineSalesData(
    targets: TargetPoint[],
    actuals: CumulativeSales[],
  ): CombinedDataPoint[] {
    const combined: CombinedDataPoint[] = []

    for (const target of targets) {
      let latestActual: CumulativeSales | undefined
      for (const actual of actuals) {
        if (actual.date <= target.date) {
          latestActual = actual
        } else {
          break
        }
      }

      combined.push({
        date: target.date,
        actualTickets: latestActual?.totalPaidTickets || 0,
        targetTickets: target.targetTickets,
        revenue: latestActual?.totalRevenue || 0,
        categoryBreakdown: latestActual?.categoryBreakdown || {},
        isMilestone: target.isMilestone,
        milestoneLabel: target.milestoneLabel,
      })
    }

    return combined
  }

  private calculateStatistics(): TicketStatistics {
    const categoryBreakdown: Record<string, number> = {}
    const processedOrders = new Set<number>()
    let totalRevenue = 0

    this.tickets.forEach((ticket) => {
      categoryBreakdown[ticket.category] =
        (categoryBreakdown[ticket.category] || 0) + 1

      if (!processedOrders.has(ticket.order_id)) {
        totalRevenue += parseFloat(ticket.sum)
        processedOrders.add(ticket.order_id)
      }
    })

    const sponsorTickets = this.calculateSponsorTickets()
    const speakerTickets = this.speakerCount

    const totalPaidTickets = this.tickets.length
    const averageTicketPrice =
      totalPaidTickets > 0 ? totalRevenue / totalPaidTickets : 0

    return {
      totalPaidTickets,
      totalRevenue,
      totalOrders: processedOrders.size,
      averageTicketPrice,
      categoryBreakdown,
      sponsorTickets,
      speakerTickets,
      totalCapacityUsed: totalPaidTickets + sponsorTickets + speakerTickets,
    }
  }

  private calculateSponsorTickets(): number {
    if (!this.conference.sponsors?.length) return 0

    return this.conference.sponsors.reduce((total, sponsorData) => {
      const tierTitle = sponsorData.tier?.title || ''
      return total + (SPONSOR_TIER_TICKET_ALLOCATION[tierTitle] || 0)
    }, 0)
  }

  private calculatePerformance(
    targets: TargetPoint[],
    statistics: TicketStatistics,
  ): PerformanceMetrics {
    const currentPercentage =
      (statistics.totalPaidTickets / this.capacity) * 100

    const currentTarget = targets
      .slice()
      .reverse()
      .find((target) => new Date(target.date) <= this.today)

    const targetPercentage = currentTarget?.targetPercentage || 0
    const variance = currentPercentage - targetPercentage

    const nextMilestone = targets
      .filter(
        (target) => target.isMilestone && new Date(target.date) > this.today,
      )
      .sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      )[0]

    const nextMilestoneInfo = nextMilestone
      ? {
          date: nextMilestone.date,
          label: nextMilestone.milestoneLabel!,
          daysAway: Math.ceil(
            (new Date(nextMilestone.date).getTime() - this.today.getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        }
      : null

    return {
      currentPercentage,
      targetPercentage,
      variance,
      isOnTrack: variance >= -5,
      nextMilestone: nextMilestoneInfo,
    }
  }
}
