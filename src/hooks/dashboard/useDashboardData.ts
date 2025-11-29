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

export interface QuickAction {
  label: string
  shortLabel?: string // Compact label for tight spaces
  icon: string
  link: string
  badge?: number
  variant: 'primary' | 'secondary' | 'success' | 'warning'
}

// Cached data fetching functions with hardcoded mock data

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

export const getQuickActions = cache(async (): Promise<QuickAction[]> => {
  await new Promise((resolve) => setTimeout(resolve, 10))

  // Phase-aware quick actions (hardcoded for CFP Review phase)
  return [
    {
      label: 'Review Proposals',
      shortLabel: 'Proposals',
      icon: 'ClipboardDocumentCheckIcon',
      link: '/admin/proposals',
      badge: 58,
      variant: 'primary',
    },
    {
      label: 'Manage Speakers',
      shortLabel: 'Speakers',
      icon: 'UserGroupIcon',
      link: '/admin/speakers',
      badge: 7,
      variant: 'secondary',
    },
    {
      label: 'Sponsor Pipeline',
      shortLabel: 'Sponsors',
      icon: 'CurrencyDollarIcon',
      link: '/admin/sponsors/crm',
      badge: 4,
      variant: 'success',
    },
    {
      label: 'Travel Support',
      shortLabel: 'Travel',
      icon: 'GlobeAltIcon',
      link: '/admin/travel-support',
      badge: 4,
      variant: 'warning',
    },
    {
      label: 'Build Schedule',
      shortLabel: 'Schedule',
      icon: 'CalendarIcon',
      link: '/admin/schedule',
      variant: 'secondary',
    },
    {
      label: 'Settings',
      shortLabel: 'Settings',
      icon: 'Cog6ToothIcon',
      link: '/admin/settings',
      variant: 'secondary',
    },
  ]
})
