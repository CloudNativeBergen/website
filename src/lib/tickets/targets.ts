import type { Conference } from '@/lib/conference/types'
/**
 * Combined target and actual data for visualization
 */
export interface TargetVsActualData {
  date: string // ISO date string
  target: number
  actual: number
  actualPaid: number
  actualSponsor: number
  actualSpeaker: number
  categories: TicketCategoryBreakdown
  revenue: number
  isMilestone?: boolean
  milestoneLabel?: string
  isFuture?: boolean // indicates if this is a future projection
}

/**
 * Different progression curve types for calculating ticket sales targets over time
 */
export type TargetCurve = 'linear' | 'early_push' | 'late_push' | 's_curve'

/**
 * A milestone represents a specific date with a target percentage
 */
export interface SalesMilestone {
  date: string // ISO date string
  target_percentage: number // 0-100
  label?: string
}

/**
 * Configuration for ticket sales target tracking
 */
export interface TicketTargetConfig {
  enabled: boolean
  sales_start_date?: string // ISO date string
  target_curve?: TargetCurve
  milestones?: SalesMilestone[]
}

/**
 * A calculated target point for a specific date
 */
export interface TargetDataPoint {
  date: string // ISO date string
  targetTickets: number
  targetPercentage: number
  isMilestone?: boolean
  milestoneLabel?: string
}

/**
 * Ticket category breakdown for a specific date
 */
export interface TicketCategoryBreakdown {
  [category: string]: number
}

/**
 * Actual sales data point for a specific date
 */
export interface SalesDataPoint {
  date: string // ISO date string
  paidTickets: number
  sponsorTickets: number
  speakerTickets: number
  totalTickets: number
  revenue: number
  categories: TicketCategoryBreakdown // e.g., { "Early Bird": 25, "Regular": 40, "Student": 3 }
}

/**
 * Combined target vs actual data for visualization
 */
export interface TargetVsActualData {
  date: string
  target: number
  actual: number
  actualPaid: number
  actualSponsor: number
  actualSpeaker: number
  revenue: number
  isMilestone?: boolean
  milestoneLabel?: string
}

/**
 * Complete target tracking analysis for a conference
 */
export interface TicketTargetAnalysis {
  config: TicketTargetConfig
  capacity: number
  currentSales: SalesDataPoint
  targetProgression: TargetDataPoint[]
  actualProgression: SalesDataPoint[]
  combinedData: TargetVsActualData[]
  performance: {
    currentTargetPercentage: number
    actualPercentage: number
    variance: number // positive = ahead of target, negative = behind
    isOnTrack: boolean
    nextMilestone?: SalesMilestone
    daysToNextMilestone?: number
  }
}

/**
 * Options for generating target progression
 */
export interface TargetGenerationOptions {
  startDate: Date
  endDate: Date
  capacity: number
  curve: TargetCurve
  milestones?: SalesMilestone[]
  granularity?: 'daily' | 'weekly' // default: weekly
}

/**
 * Extended conference type with ticket target fields
 */
export interface ConferenceWithTargets extends Conference {
  ticket_capacity?: number
  ticket_targets?: TicketTargetConfig
}
