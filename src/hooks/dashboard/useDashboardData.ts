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
  newSpeakers: number
  returningSpeak: number
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
  type: 'proposal' | 'review' | 'sponsor' | 'workshop' | 'speaker'
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

// Cached data fetching functions with hardcoded mock data

export const getTicketSalesData = cache(async (): Promise<TicketSalesData> => {
  await new Promise((resolve) => setTimeout(resolve, 10))

  return {
    currentSales: 342,
    capacity: 500,
    percentage: 68.4,
    revenue: 85500,
    daysUntilEvent: 45,
    salesVelocity: 7.6,
    salesByDate: [
      { date: '2025-10-01', sales: 45, target: 50 },
      { date: '2025-10-15', sales: 120, target: 100 },
      { date: '2025-11-01', sales: 210, target: 200 },
      { date: '2025-11-15', sales: 280, target: 250 },
      { date: '2025-12-01', sales: 342, target: 300 },
    ],
    milestones: [
      { name: 'Early Bird', target: 100, reached: true },
      { name: 'Break Even', target: 250, reached: true },
      { name: 'Sell Out', target: 500, reached: false },
    ],
  }
})

export const getCFPHealthData = cache(async (): Promise<CFPHealthData> => {
  await new Promise((resolve) => setTimeout(resolve, 10))

  return {
    totalSubmissions: 147,
    submissionGoal: 200,
    daysRemaining: 12,
    averagePerDay: 4.2,
    submissionsPerDay: [
      { date: '2025-11-01', count: 5 },
      { date: '2025-11-02', count: 8 },
      { date: '2025-11-03', count: 12 },
      { date: '2025-11-04', count: 7 },
      { date: '2025-11-05', count: 15 },
      { date: '2025-11-06', count: 22 },
      { date: '2025-11-07', count: 18 },
    ],
    formatDistribution: [
      { format: 'Presentation (20min)', count: 45 },
      { format: 'Presentation (45min)', count: 82 },
      { format: 'Workshop', count: 20 },
    ],
  }
})

export const getProposalPipelineData = cache(
  async (): Promise<ProposalPipelineData> => {
    await new Promise((resolve) => setTimeout(resolve, 10))

    return {
      submitted: 147,
      accepted: 42,
      rejected: 28,
      confirmed: 35,
      total: 147,
      acceptanceRate: 28.6,
      pendingDecisions: 77,
    }
  },
)

export const getReviewProgressData = cache(
  async (): Promise<ReviewProgressData> => {
    await new Promise((resolve) => setTimeout(resolve, 10))

    return {
      reviewedCount: 89,
      totalProposals: 147,
      percentage: 60.5,
      averageScore: 7.2,
      nextUnreviewed: {
        id: 'prop-148',
        title: 'Building Resilient Microservices with Kubernetes',
      },
    }
  },
)

export const getSpeakerEngagementData = cache(
  async (): Promise<SpeakerEngagementData> => {
    await new Promise((resolve) => setTimeout(resolve, 10))

    return {
      totalSpeakers: 112,
      newSpeakers: 78,
      returningSpeak: 34,
      diverseSpeakers: 45,
      localSpeakers: 23,
      awaitingConfirmation: 7,
      averageProposalsPerSpeaker: 1.3,
    }
  },
)

export const getScheduleStatusData = cache(
  async (): Promise<ScheduleStatusData> => {
    await new Promise((resolve) => setTimeout(resolve, 10))

    return {
      totalSlots: 48,
      filledSlots: 32,
      percentage: 66.7,
      byDay: [
        { day: 'Day 1', filled: 18, total: 24 },
        { day: 'Day 2', filled: 14, total: 24 },
      ],
      unassignedConfirmedTalks: 3,
      placeholderSlots: 8,
    }
  },
)

export const getSponsorPipelineData = cache(
  async (): Promise<SponsorPipelineData> => {
    await new Promise((resolve) => setTimeout(resolve, 10))

    return {
      totalValue: 125000,
      wonDeals: 8,
      lostDeals: 3,
      revenueGoal: 150000,
      stages: [
        { name: 'Prospect', count: 12, value: 45000 },
        { name: 'Contacted', count: 6, value: 28000 },
        { name: 'Negotiating', count: 4, value: 32000 },
        { name: 'Closed Won', count: 8, value: 125000 },
      ],
      recentActivity: [
        {
          id: '1',
          sponsor: 'TechCorp',
          activity: 'Contract signed - Gold tier',
          timestamp: '2 hours ago',
        },
        {
          id: '2',
          sponsor: 'CloudVendor',
          activity: 'Invoice sent',
          timestamp: '5 hours ago',
        },
        {
          id: '3',
          sponsor: 'DevTools Inc',
          activity: 'Moved to negotiating',
          timestamp: '1 day ago',
        },
        {
          id: '4',
          sponsor: 'DataPlatform',
          activity: 'Initial contact made',
          timestamp: '2 days ago',
        },
        {
          id: '5',
          sponsor: 'AIStartup',
          activity: 'Added as prospect',
          timestamp: '3 days ago',
        },
      ],
    }
  },
)

export const getWorkshopCapacityData = cache(
  async (): Promise<WorkshopCapacityData> => {
    await new Promise((resolve) => setTimeout(resolve, 10))

    return {
      averageFillRate: 78.5,
      atCapacity: 2,
      totalWaitlist: 23,
      workshops: [
        {
          id: 'ws-1',
          title: 'Kubernetes Deep Dive',
          capacity: 30,
          confirmed: 30,
          waitlist: 12,
          fillRate: 100,
        },
        {
          id: 'ws-2',
          title: 'GitOps with ArgoCD',
          capacity: 25,
          confirmed: 25,
          waitlist: 8,
          fillRate: 100,
        },
        {
          id: 'ws-3',
          title: 'Service Mesh Patterns',
          capacity: 20,
          confirmed: 16,
          waitlist: 3,
          fillRate: 80,
        },
        {
          id: 'ws-4',
          title: 'Cloud Security Fundamentals',
          capacity: 30,
          confirmed: 18,
          waitlist: 0,
          fillRate: 60,
        },
        {
          id: 'ws-5',
          title: 'Observability Stack Setup',
          capacity: 25,
          confirmed: 15,
          waitlist: 0,
          fillRate: 60,
        },
      ],
    }
  },
)

export const getTravelSupportData = cache(
  async (): Promise<TravelSupportData> => {
    await new Promise((resolve) => setTimeout(resolve, 10))

    return {
      pendingApprovals: 4,
      totalRequested: 28500,
      totalApproved: 18000,
      budgetAllocated: 25000,
      averageRequest: 1425,
      requests: [
        {
          id: 'ts-1',
          speaker: 'Sarah Chen',
          amount: 1200,
          status: 'pending',
          submittedAt: '2 days ago',
        },
        {
          id: 'ts-2',
          speaker: 'Alex Kumar',
          amount: 2400,
          status: 'pending',
          submittedAt: '3 days ago',
        },
        {
          id: 'ts-3',
          speaker: 'Maria Garcia',
          amount: 800,
          status: 'pending',
          submittedAt: '5 days ago',
        },
        {
          id: 'ts-4',
          speaker: 'James Wilson',
          amount: 1500,
          status: 'pending',
          submittedAt: '1 week ago',
        },
      ],
    }
  },
)

export const getUpcomingDeadlines = cache(async (): Promise<DeadlineData[]> => {
  await new Promise((resolve) => setTimeout(resolve, 10))

  return [
    {
      name: 'CFP Closes',
      date: '2025-12-11',
      daysRemaining: 12,
      urgency: 'high',
      phase: 'CFP Open',
      action: 'Promote CFP',
      actionLink: '/admin/settings',
    },
    {
      name: 'Notify Speakers',
      date: '2025-12-20',
      daysRemaining: 21,
      urgency: 'medium',
      phase: 'CFP Review',
      action: 'Review Proposals',
      actionLink: '/admin/proposals',
    },
    {
      name: 'Publish Program',
      date: '2026-01-10',
      daysRemaining: 42,
      urgency: 'low',
      phase: 'Program Building',
      action: 'Build Schedule',
      actionLink: '/admin/schedule',
    },
  ]
})

export const getRecentActivity = cache(async (): Promise<ActivityItem[]> => {
  await new Promise((resolve) => setTimeout(resolve, 10))

  return [
    {
      id: 'act-1',
      type: 'proposal',
      description: 'New proposal: "Service Mesh Security Patterns"',
      user: 'Emma Thompson',
      timestamp: '5 minutes ago',
      link: '/admin/proposals/prop-148',
    },
    {
      id: 'act-2',
      type: 'review',
      description: 'Review added for "Building Resilient Microservices"',
      user: 'John Organizer',
      timestamp: '23 minutes ago',
      link: '/admin/proposals/prop-147',
    },
    {
      id: 'act-3',
      type: 'sponsor',
      description: 'TechCorp contract signed - Gold tier',
      user: 'System',
      timestamp: '2 hours ago',
      link: '/admin/sponsors/crm',
    },
    {
      id: 'act-4',
      type: 'workshop',
      description: 'Kubernetes Deep Dive reached capacity',
      user: 'System',
      timestamp: '3 hours ago',
      link: '/admin/workshops',
    },
    {
      id: 'act-5',
      type: 'proposal',
      description: 'Proposal accepted: "GitOps Best Practices"',
      user: 'Sarah Organizer',
      timestamp: '5 hours ago',
      link: '/admin/proposals/prop-142',
    },
    {
      id: 'act-6',
      type: 'speaker',
      description: 'New speaker registered: Alex Kumar',
      user: 'Alex Kumar',
      timestamp: '6 hours ago',
      link: '/admin/speakers',
    },
    {
      id: 'act-7',
      type: 'review',
      description: 'Review added for "Cloud Native Observability"',
      user: 'Mike Organizer',
      timestamp: '8 hours ago',
      link: '/admin/proposals/prop-145',
    },
    {
      id: 'act-8',
      type: 'sponsor',
      description: 'CloudVendor invoice sent',
      user: 'System',
      timestamp: '1 day ago',
      link: '/admin/sponsors/crm',
    },
    {
      id: 'act-9',
      type: 'proposal',
      description: 'New proposal: "Platform Engineering 101"',
      user: 'Chris Developer',
      timestamp: '1 day ago',
      link: '/admin/proposals/prop-146',
    },
    {
      id: 'act-10',
      type: 'workshop',
      description: 'GitOps with ArgoCD waitlist: 8 people',
      user: 'System',
      timestamp: '2 days ago',
      link: '/admin/workshops',
    },
  ]
})

export const getQuickActions = cache(
  async (phase?: string): Promise<QuickAction[]> => {
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Phase-aware quick actions adapt to conference lifecycle
    const baseActions = {
      initialization: [
        {
          label: 'Configure CFP',
          shortLabel: 'CFP Setup',
          icon: 'Cog6ToothIcon',
          link: '/admin/settings',
          variant: 'primary' as const,
        },
        {
          label: 'Invite Reviewers',
          shortLabel: 'Reviewers',
          icon: 'UserGroupIcon',
          link: '/admin/settings',
          variant: 'secondary' as const,
        },
        {
          label: 'Setup Sponsors',
          shortLabel: 'Sponsors',
          icon: 'CurrencyDollarIcon',
          link: '/admin/sponsors',
          variant: 'success' as const,
        },
        {
          label: 'Configure Tickets',
          shortLabel: 'Tickets',
          icon: 'Cog6ToothIcon',
          link: '/admin/tickets',
          variant: 'secondary' as const,
        },
        {
          label: 'Build Schedule',
          shortLabel: 'Schedule',
          icon: 'CalendarIcon',
          link: '/admin/schedule',
          variant: 'secondary' as const,
        },
        {
          label: 'Settings',
          shortLabel: 'Settings',
          icon: 'Cog6ToothIcon',
          link: '/admin/settings',
          variant: 'secondary' as const,
        },
      ],
      planning: [
        {
          label: 'Review Proposals',
          shortLabel: 'Proposals',
          icon: 'ClipboardDocumentCheckIcon',
          link: '/admin/proposals',
          badge: 58,
          variant: 'primary' as const,
        },
        {
          label: 'Manage Speakers',
          shortLabel: 'Speakers',
          icon: 'UserGroupIcon',
          link: '/admin/speakers',
          badge: 7,
          variant: 'secondary' as const,
        },
        {
          label: 'Sponsor Pipeline',
          shortLabel: 'Sponsors',
          icon: 'CurrencyDollarIcon',
          link: '/admin/sponsors/crm',
          badge: 4,
          variant: 'success' as const,
        },
        {
          label: 'Travel Support',
          shortLabel: 'Travel',
          icon: 'GlobeAltIcon',
          link: '/admin/travel-support',
          badge: 4,
          variant: 'warning' as const,
        },
        {
          label: 'Build Schedule',
          shortLabel: 'Schedule',
          icon: 'CalendarIcon',
          link: '/admin/schedule',
          variant: 'secondary' as const,
        },
        {
          label: 'Settings',
          shortLabel: 'Settings',
          icon: 'Cog6ToothIcon',
          link: '/admin/settings',
          variant: 'secondary' as const,
        },
      ],
      execution: [
        {
          label: 'Finalize Schedule',
          shortLabel: 'Schedule',
          icon: 'CalendarIcon',
          link: '/admin/schedule',
          badge: 3,
          variant: 'primary' as const,
        },
        {
          label: 'Speaker Confirmations',
          shortLabel: 'Speakers',
          icon: 'UserGroupIcon',
          link: '/admin/speakers',
          badge: 5,
          variant: 'warning' as const,
        },
        {
          label: 'Ticket Sales',
          shortLabel: 'Tickets',
          icon: 'Cog6ToothIcon',
          link: '/admin/tickets',
          variant: 'success' as const,
        },
        {
          label: 'Workshop Capacity',
          shortLabel: 'Workshops',
          icon: 'GlobeAltIcon',
          link: '/admin/workshops',
          badge: 2,
          variant: 'secondary' as const,
        },
        {
          label: 'Sponsor Activation',
          shortLabel: 'Sponsors',
          icon: 'CurrencyDollarIcon',
          link: '/admin/sponsors',
          variant: 'secondary' as const,
        },
        {
          label: 'Settings',
          shortLabel: 'Settings',
          icon: 'Cog6ToothIcon',
          link: '/admin/settings',
          variant: 'secondary' as const,
        },
      ],
      'post-conference': [
        {
          label: 'Publish Content',
          shortLabel: 'Gallery',
          icon: 'ClipboardDocumentCheckIcon',
          link: '/admin/gallery',
          badge: 12,
          variant: 'primary' as const,
        },
        {
          label: 'Travel Expenses',
          shortLabel: 'Expenses',
          icon: 'GlobeAltIcon',
          link: '/admin/travel-support',
          badge: 8,
          variant: 'warning' as const,
        },
        {
          label: 'Speaker Feedback',
          shortLabel: 'Feedback',
          icon: 'UserGroupIcon',
          link: '/admin/speakers',
          variant: 'secondary' as const,
        },
        {
          label: 'Sponsor Reports',
          shortLabel: 'Sponsors',
          icon: 'CurrencyDollarIcon',
          link: '/admin/sponsors',
          variant: 'secondary' as const,
        },
        {
          label: 'Analytics',
          shortLabel: 'Analytics',
          icon: 'CalendarIcon',
          link: '/admin/proposals',
          variant: 'secondary' as const,
        },
        {
          label: 'Settings',
          shortLabel: 'Settings',
          icon: 'Cog6ToothIcon',
          link: '/admin/settings',
          variant: 'secondary' as const,
        },
      ],
    }

    // Return actions for the specified phase, default to planning
    const selectedPhase = (phase || 'planning') as keyof typeof baseActions
    return baseActions[selectedPhase] || baseActions.planning
  },
)

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
