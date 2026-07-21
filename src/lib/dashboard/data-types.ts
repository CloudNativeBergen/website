/**
 * Dashboard widget data type definitions
 */

// Types for widget data structures
export interface ReviewProgressData {
  reviewedCount: number
  totalProposals: number
  percentage: number
  averageScore: number
  nextUnreviewed?: {
    id: string
    title: string
  }
}

export interface SpeakerEngagementData {
  totalSpeakers: number
  featuredCount: number
  /** Speakers explicitly flagged as first-time. Untagged speakers are NOT
   * assumed to be returning — there is no reliable "returning" signal. */
  newSpeakers: number
  diverseSpeakers: number
  localSpeakers: number
  awaitingConfirmation: number
  averageProposalsPerSpeaker: number
}

export interface ScheduleStatusData {
  totalSlots: number
  filledSlots: number
  percentage: number
  byDay: { day: string; filled: number; total: number }[]
  unassignedConfirmedTalks: number
  placeholderSlots: number
}

export interface SponsorPipelineWidgetData {
  stages: {
    name: string
    count: number
    value: number
    sponsors: {
      name: string
      logo?: string
      logoBright?: string
    }[]
  }[]
  totalValue: number
  wonDeals: number
  lostDeals: number
  revenueGoal: number
  recentActivity: {
    id: string
    sponsor: string
    activity: string
    timestamp: string
  }[]
}

export interface TravelSupportData {
  pendingApprovals: number
  /** Number of requests approved or paid (used for "speakers supported"). */
  approvedCount: number
  totalRequested: number
  totalApproved: number
  budgetAllocated: number
  averageRequest: number
  requests: {
    id: string
    speaker: string
    amount: number
    status: string
    submittedAt: string
  }[]
}

export interface DeadlineData {
  name: string
  date: string
  daysRemaining: number
  urgency: 'high' | 'medium' | 'low'
  phase: string
  action?: string
  actionLink?: string
}

export interface ActivityItem {
  id: string
  type: 'proposal' | 'review' | 'sponsor' | 'speaker'
  description: string
  user: string
  timestamp: string
  link?: string
}

export interface QuickAction {
  label: string
  shortLabel?: string // Compact label for tight spaces
  icon: string
  link: string
  badge?: number
  variant: 'primary' | 'secondary' | 'success' | 'warning'
}

export interface TicketSalesData {
  currentSales: number
  capacity: number
  percentage: number
  revenue: number
  salesByDate: { date: string; sales: number; target: number }[]
  milestones: { name: string; target: number; reached: boolean }[]
  daysUntilEvent: number
  salesVelocity: number
}

/**
 * Discriminated result for ticket sales so the widget can distinguish
 * "integration not configured" (no checkin IDs on the conference) from
 * "the ticket API call failed" — previously both collapsed to `null`.
 */
export type TicketSalesResult =
  | { status: 'unconfigured' }
  | { status: 'error' }
  | { status: 'ok'; data: TicketSalesData }

export interface CFPHealthData {
  totalSubmissions: number
  submissionGoal: number
  submissionsPerDay: { date: string; count: number }[]
  formatDistribution: { format: string; count: number }[]
  daysRemaining: number
  averagePerDay: number
}

export interface ProposalPipelineData {
  submitted: number
  accepted: number
  rejected: number
  confirmed: number
  total: number
  acceptanceRate: number
  pendingDecisions: number
  /** Distinct speakers across confirmed talks (a talk can have co-speakers). */
  distinctSpeakers: number
}

/**
 * TEAMS-3 (L4) — "My areas". One needs-attention metric on a team card, deep
 * linking to the filtered surface (inbox view / CRM owner / volunteers page).
 */
export interface MyAreaMetric {
  label: string
  count: number
  href: string
}

/** A team the viewer belongs to, with its compact needs-attention metrics. */
export interface MyAreaCard {
  key: string
  title: string
  metrics: MyAreaMetric[]
}

/**
 * The viewer's team areas. `areas` is empty when the viewer is on no team (the
 * widget then renders its inert empty state). Counts reuse EXISTING sources
 * (message viewCounts, the sponsor list's unassigned filter, the volunteer
 * list) — at most one read per area the viewer actually belongs to.
 */
export interface MyAreasData {
  areas: MyAreaCard[]
}
