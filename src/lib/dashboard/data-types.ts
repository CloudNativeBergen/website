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
  newSpeakers: number
  returningSpeakers: number
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
}
