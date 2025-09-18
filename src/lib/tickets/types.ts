import type { Conference } from '@/lib/conference/types'

/**
 * TypeScript types for Checkin.no GraphQL API responses
 */

export interface EventTicketWithoutDate {
  id: number
  order_id: number
  category: string
  customer_name: string | null
  sum: string // price without vat
  sum_left: string // outstanding amount
  coupon?: string
  discount?: string
  fields: { key: string; value: string }[]
  crm: {
    first_name: string
    last_name: string
    email: string
  }
  order?: {
    createdAt: string
    paymentStatus: string
    paid: boolean
  }
}

export interface EventTicket extends EventTicketWithoutDate {
  order_date: string
}

export interface CheckinPayOrder {
  id: number
  belongsTo: number
  orderId: number
  orderType: string
  documentType: string
  kid: string | null
  invoiceReference: string | null
  archivedAt: string | null
  createdAt: string
  invoiceDate: string | null
  deliveryDate: string | null
  dueAt: string
  contactCrm: {
    firstName: string
    lastName: string
    email: {
      email: string
    }
  }
  billingCrm: {
    firstName: string
    lastName: string
    email: {
      email: string
    }
  } | null
  currency: string | null
  country: string | null
  paymentMethod: string
  paymentStatus: string
  actionRequired: string | null
  debtStatus: string | null
  debtLastUpdatedAt: string | null
  sum: string
  sumLeft: string
  paid: boolean
  sumVat: string
}

export interface EventDiscount {
  id?: string
  trigger: string
  type: string
  value: string
  triggerValue: string | null
  affects: string
  includeBooking: boolean
  affectsValue: string | null
  modes: string[]
  tickets: string[]
  ticketsOnly: boolean
  times: number
  timesTotal: number
  // Optional fields for date ranges
  startsAt?: string
  stopsAt?: string
}

export interface TicketType {
  id: string | number // Allow both string and number to handle API response
  name: string
  description: string | null // Allow null descriptions
}

export interface GroupedOrder {
  order_id: number
  tickets: EventTicket[]
  totalTickets: number
  totalAmount: number
  amountLeft: number
  categories: string[]
  fields: { key: string; value: string }[]
}

export interface DiscountUsageStats {
  [discountCode: string]: {
    usageCount: number
    ticketIds: number[]
    totalValue: number
  }
}

// Extended EventDiscount type with usage statistics for UI components
export interface EventDiscountWithUsage extends EventDiscount {
  actualUsage?: {
    usageCount: number
    ticketIds: number[]
    totalValue: number
  }
}

export interface CreateEventDiscountInput {
  eventId: number
  discountCode: string
  numberOfTickets: number
  ticketTypes: string[]
  discountType?: 'percentage' | 'fixed'
  discountValue?: number
  startsAt?: string
  stopsAt?: string
}

// GraphQL Response Types
export interface EventTicketsResponse {
  eventTickets: EventTicket[]
}

export interface CheckinPayOrderResponse {
  findCheckinPayOrderByID: CheckinPayOrder
}

export interface EventDiscountsResponse {
  findEventById: {
    id: number
    tickets: TicketType[]
    settings: {
      discounts: EventDiscount[]
    }
  }
}

export interface CreateEventDiscountResponse {
  createEventDiscount: {
    success: boolean
  }
}

export interface DeleteEventDiscountResponse {
  deleteEventDiscount: {
    success: boolean
  }
}

export interface ValidateDiscountCodeResponse {
  eventCouponValidate: {
    valid: boolean
    message: string
    usageCount?: number
    maxUsage?: number
  }
}

// Event Order User Types for bulk ticket/order fetching
export interface EventOrderUser {
  id: number
  orderId: number
  eventId: number
  createdAt: string // Purchase date
}

export interface EventOrderUserPage {
  records: number
  offset: number
  length: number
  data: EventOrderUser[]
  pageInfo: {
    hasNextPage: boolean
  }
  cachedAt?: string | null
}

export interface AllEventOrderUsersResponse {
  allEventOrderUsers: EventOrderUserPage
}

export interface EventOrderUserReportFilter {
  property: string
  operator: string
  value: string
}

export interface FetchAllEventOrderUsersOptions {
  customerId?: number
  offset?: number
  length?: number
  reportFilters?: EventOrderUserReportFilter[]
}

// === TARGET TRACKING TYPES ===

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
  isFuture?: boolean // indicates if this target is in the future
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
  isFuture?: boolean // indicates if this data point is in the future
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
  ticket_capacity: number
  ticket_targets?: TicketTargetConfig
}

/**
 * Strict input type for analyzeTicketSales function with all required fields
 */
export interface AnalyzeTicketSalesInput {
  capacity: number
  salesStartDate: string // ISO date string
  conferenceStartDate: string // ISO date string - when the conference starts
  targetCurve: TargetCurve
  milestones?: SalesMilestone[]
  tickets: EventTicket[]
}
