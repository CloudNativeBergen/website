/**
 * Dashboard data hooks with hardcoded mock data
 *
 * This file contains data fetching hooks for all dashboard widgets.
 * Currently returns hardcoded mock data for UX validation.
 *
 * Future: Replace mock data with real Sanity/tRPC queries
 */

import { cache } from 'react'

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

export interface SponsorPipelineData {
  stages: {
    name: string
    count: number
    value: number
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

export interface WorkshopCapacityData {
  workshops: {
    id: string
    title: string
    capacity: number
    confirmed: number
    waitlist: number
    fillRate: number
  }[]
  averageFillRate: number
  atCapacity: number
  totalWaitlist: number
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

export interface GalleryManagementData {
  totalPhotos: number
  publishedPhotos: number
  pendingReview: number
  contributors: number
  recentUploads: {
    id: string
    count: number
    timestamp: string
  }[]
}

export interface ContentCalendarData {
  upcomingDeadlines: {
    id: string
    title: string
    date: string
    type: 'blog' | 'social' | 'newsletter' | 'announcement'
    status: 'draft' | 'scheduled' | 'published'
    daysRemaining: number
  }[]
  monthlyStats: {
    published: number
    scheduled: number
    drafts: number
  }
  contentTypes: {
    type: string
    count: number
  }[]
}

export interface TeamStatusData {
  totalOrganizers: number
  activeOrganizers: number
  teamMembers: {
    id: string
    name: string
    role: string
    tasksCompleted: number
    tasksTotal: number
    lastActive: string
  }[]
  recentActivity: {
    member: string
    action: string
    timestamp: string
  }[]
}

export interface VolunteerShiftsData {
  totalShifts: number
  filledShifts: number
  openShifts: number
  totalVolunteers: number
  shifts: {
    id: string
    name: string
    time: string
    volunteers: number
    needed: number
    fillRate: number
  }[]
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

// Phase 3 widgets: mock data (to be migrated in future phases)

/**
 * Gallery Management Data
 */
export const getGalleryManagementData = cache(
  async (): Promise<GalleryManagementData> => {
    return {
      totalPhotos: 247,
      publishedPhotos: 189,
      pendingReview: 12,
      contributors: 23,
      recentUploads: [
        {
          id: '1',
          count: 15,
          timestamp: '2 hours ago',
        },
        {
          id: '2',
          count: 8,
          timestamp: '5 hours ago',
        },
        {
          id: '3',
          count: 22,
          timestamp: 'Yesterday',
        },
      ],
    }
  },
)

/**
 * Content Calendar Data
 */
export const getContentCalendarData = cache(
  async (): Promise<ContentCalendarData> => {
    const now = new Date()
    return {
      upcomingDeadlines: [
        {
          id: '1',
          title: 'Speaker Announcement Blog Post',
          date: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          type: 'blog' as const,
          status: 'draft' as const,
          daysRemaining: 2,
        },
        {
          id: '2',
          title: 'Social Media Campaign - Week 1',
          date: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          type: 'social' as const,
          status: 'scheduled' as const,
          daysRemaining: 5,
        },
        {
          id: '3',
          title: 'Monthly Newsletter',
          date: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          type: 'newsletter' as const,
          status: 'draft' as const,
          daysRemaining: 7,
        },
        {
          id: '4',
          title: 'Workshop Details Announcement',
          date: new Date(
            now.getTime() + 10 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          type: 'announcement' as const,
          status: 'draft' as const,
          daysRemaining: 10,
        },
      ],
      monthlyStats: {
        published: 12,
        scheduled: 5,
        drafts: 8,
      },
      contentTypes: [
        { type: 'Blog Posts', count: 8 },
        { type: 'Social Media', count: 15 },
        { type: 'Newsletters', count: 4 },
        { type: 'Announcements', count: 6 },
      ],
    }
  },
)

/**
 * Team Status Data
 */
export const getTeamStatusData = cache(async (): Promise<TeamStatusData> => {
  return {
    totalOrganizers: 12,
    activeOrganizers: 10,
    teamMembers: [
      {
        id: '1',
        name: 'Hans Kristian Flaatten',
        role: 'Lead Organizer',
        tasksCompleted: 24,
        tasksTotal: 30,
        lastActive: '2 hours ago',
      },
      {
        id: '2',
        name: 'Jane Smith',
        role: 'Program Chair',
        tasksCompleted: 18,
        tasksTotal: 20,
        lastActive: '4 hours ago',
      },
      {
        id: '3',
        name: 'Alex Johnson',
        role: 'Logistics',
        tasksCompleted: 12,
        tasksTotal: 25,
        lastActive: '1 day ago',
      },
      {
        id: '4',
        name: 'Sara Lee',
        role: 'Marketing',
        tasksCompleted: 15,
        tasksTotal: 18,
        lastActive: '3 hours ago',
      },
    ],
    recentActivity: [
      {
        member: 'Hans K.',
        action: 'Approved 3 proposals',
        timestamp: '2h ago',
      },
      {
        member: 'Jane S.',
        action: 'Updated schedule',
        timestamp: '4h ago',
      },
      {
        member: 'Sara L.',
        action: 'Published blog post',
        timestamp: '6h ago',
      },
    ],
  }
})

/**
 * Volunteer Shifts Data
 */
export const getVolunteerShiftsData = cache(
  async (): Promise<VolunteerShiftsData> => {
    return {
      totalShifts: 24,
      filledShifts: 18,
      openShifts: 6,
      totalVolunteers: 32,
      shifts: [
        {
          id: '1',
          name: 'Registration Desk',
          time: 'Day 1 - 08:00-10:00',
          volunteers: 3,
          needed: 4,
          fillRate: 75,
        },
        {
          id: '2',
          name: 'Session Room A',
          time: 'Day 1 - 10:00-12:00',
          volunteers: 2,
          needed: 2,
          fillRate: 100,
        },
        {
          id: '3',
          name: 'Lunch Service',
          time: 'Day 1 - 12:00-13:30',
          volunteers: 4,
          needed: 6,
          fillRate: 67,
        },
        {
          id: '4',
          name: 'Workshop Support',
          time: 'Day 1 - 14:00-17:00',
          volunteers: 2,
          needed: 3,
          fillRate: 67,
        },
        {
          id: '5',
          name: 'Social Event',
          time: 'Day 1 - 18:00-21:00',
          volunteers: 3,
          needed: 4,
          fillRate: 75,
        },
      ],
    }
  },
)
