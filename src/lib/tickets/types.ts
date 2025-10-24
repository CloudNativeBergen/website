import type { Conference } from '@/lib/conference/types'

export type TargetCurve = 'linear' | 'early_push' | 'late_push' | 's_curve'

export interface DailySales {
  date: string
  paidTickets: number
  totalRevenue: number
  categoryBreakdown: Record<string, number>
  orderCount: number
}

export interface CumulativeSales {
  date: string
  totalPaidTickets: number
  totalRevenue: number
  categoryBreakdown: Record<string, number>
  totalOrders: number
}

export interface TargetPoint {
  date: string
  targetTickets: number
  targetPercentage: number
  isMilestone: boolean
  milestoneLabel: string | null
}

export interface CombinedDataPoint {
  date: string
  actualTickets: number
  targetTickets: number
  revenue: number
  categoryBreakdown: Record<string, number>
  isMilestone: boolean
  milestoneLabel: string | null
}

export interface PerformanceMetrics {
  currentPercentage: number
  targetPercentage: number
  variance: number
  isOnTrack: boolean
  nextMilestone: {
    date: string
    label: string
    daysAway: number
  } | null
}

export interface TicketStatistics {
  totalPaidTickets: number
  totalRevenue: number
  totalOrders: number
  averageTicketPrice: number
  categoryBreakdown: Record<string, number>
  sponsorTickets: number
  speakerTickets: number
  totalCapacityUsed: number
}

export interface TicketAnalysisResult {
  statistics: TicketStatistics
  progression: CombinedDataPoint[]
  performance: PerformanceMetrics
  capacity: number
}

export interface SalesTargetConfig {
  enabled: boolean
  sales_start_date: string
  target_curve: TargetCurve
  milestones: Array<{
    date: string
    target_percentage: number
    label: string
  }>
}

export interface ChartSeries {
  name: string
  type: 'column' | 'line'
  data: Array<{ x: string; y: number }>
  color: string
}

export interface ChartAnnotation {
  id: string
  type: 'xaxis' | 'yaxis' | 'point'
  value: number | string
  label?: string
  color?: string
  strokeDashArray?: number
  position?: 'top' | 'bottom' | 'left' | 'right'
}

export interface ChartData {
  series: ChartSeries[]
  maxValue: number
  categories: string[]
  annotations: ChartAnnotation[]
}

export interface ProcessTicketSalesInput {
  tickets: Array<{
    order_id: number
    order_date: string
    category: string
    sum: string
  }>
  config: SalesTargetConfig
  capacity: number
  conference: Conference
  conferenceDate: string
}

export interface EventTicketWithoutDate {
  id: number
  order_id: number
  category: string
  customer_name: string | null
  sum: string
  sum_left: string
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

export interface GroupedOrder {
  order_id: number
  order_date: string
  tickets: EventTicket[]
  totalTickets: number
  totalAmount: number
  amountLeft: number
  categories: string[]
  fields: { key: string; value: string }[]
}

export interface EventTicketsResponse {
  eventTickets: EventTicket[]
}

export interface CheckinPayOrderResponse {
  findCheckinPayOrderByID: CheckinPayOrder
}

export interface EventOrderUser {
  id: number
  orderId: number
  eventId: number
  createdAt: string
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
