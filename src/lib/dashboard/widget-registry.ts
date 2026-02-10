/**
 * Widget Registry
 *
 * Central registry of all available dashboard widgets with their metadata.
 * Widgets self-register by defining their sizing preferences and constraints.
 */

import { defineWidget, type WidgetMetadata } from './widget-metadata'
import { z } from 'zod'
import type { WidgetConfigSchema } from './types'

/**
 * Quick Actions Widget
 * Essential operations for conference management
 */
export const QUICK_ACTIONS_WIDGET = defineWidget({
  type: 'quick-actions',
  displayName: 'Quick Actions',
  description: 'Common tasks and navigation shortcuts',
  category: 'core',
  icon: 'BoltIcon',
  constraints: {
    minCols: 3,
    maxCols: 6,
    minRows: 2,
    maxRows: 4,
    prefersLandscape: true,
  },
  defaultSize: {
    name: 'small',
    colSpan: 3,
    rowSpan: 2,
    description: 'Compact action grid',
  },
  availableSizes: [
    { name: 'compact', colSpan: 3, rowSpan: 2 },
    { name: 'small', colSpan: 3, rowSpan: 3 },
    { name: 'medium', colSpan: 4, rowSpan: 3 },
    { name: 'wide', colSpan: 6, rowSpan: 3 },
  ],
  tags: ['actions', 'navigation', 'shortcuts'],
  // Phase configuration - this widget is relevant in all phases
  phaseConfig: {
    relevantPhases: [
      'initialization',
      'planning',
      'execution',
      'post-conference',
    ],
    hideInIrrelevantPhases: false,
    isPhaseAdaptive: true,
  },
})

/**
 * Review Progress Widget
 * Shows proposal review completion status
 */
export const REVIEW_PROGRESS_WIDGET = defineWidget({
  type: 'review-progress',
  displayName: 'Review Progress',
  description: 'Track proposal review completion',
  category: 'core',
  icon: 'ChartPieIcon',
  constraints: {
    minCols: 2,
    maxCols: 4,
    minRows: 2,
    maxRows: 4,
  },
  defaultSize: {
    name: 'small',
    colSpan: 3,
    rowSpan: 3,
  },
  availableSizes: [
    { name: 'compact', colSpan: 3, rowSpan: 2 },
    { name: 'small', colSpan: 3, rowSpan: 3 },
    { name: 'medium', colSpan: 4, rowSpan: 3 },
  ],
  tags: ['reviews', 'progress', 'proposals'],
  phaseConfig: {
    relevantPhases: ['planning', 'execution', 'post-conference'],
    hideInIrrelevantPhases: false,
    isPhaseAdaptive: true,
  },
  configSchema: {
    fields: {
      targetReviewsPerDay: {
        type: 'number',
        label: 'Target Reviews Per Day',
        description: 'Goal number of reviews to complete daily',
        defaultValue: 5,
        min: 1,
        max: 50,
        step: 1,
        unit: 'reviews/day',
        schema: z.number().min(1).max(50),
      },
      showAverageScore: {
        type: 'boolean',
        label: 'Show Average Score',
        description: 'Display average review score',
        defaultValue: true,
        schema: z.boolean(),
      },
    },
    schema: z.object({
      targetReviewsPerDay: z.number().min(1).max(50),
      showAverageScore: z.boolean(),
    }),
  } satisfies WidgetConfigSchema,
})

/**
 * Proposal Pipeline Widget
 * Visualizes proposal status distribution
 */
export const PROPOSAL_PIPELINE_WIDGET = defineWidget({
  type: 'proposal-pipeline',
  displayName: 'Proposal Pipeline',
  description: 'Status breakdown of all proposals',
  category: 'analytics',
  icon: 'ChartBarIcon',
  constraints: {
    minCols: 4,
    maxCols: 8,
    minRows: 3,
    maxRows: 6,
    prefersLandscape: true,
  },
  defaultSize: {
    name: 'medium',
    colSpan: 6,
    rowSpan: 4,
  },
  availableSizes: [
    { name: 'small', colSpan: 4, rowSpan: 3 },
    { name: 'medium', colSpan: 6, rowSpan: 4 },
    { name: 'large', colSpan: 8, rowSpan: 5 },
  ],
  tags: ['proposals', 'pipeline', 'analytics', 'chart'],
  phaseConfig: {
    relevantPhases: [
      'initialization',
      'planning',
      'execution',
      'post-conference',
    ],
    hideInIrrelevantPhases: false,
    isPhaseAdaptive: true,
  },
  configSchema: {
    fields: {
      targetAcceptanceRate: {
        type: 'number',
        label: 'Target Acceptance Rate',
        description: 'Goal acceptance rate percentage',
        defaultValue: 30,
        min: 1,
        max: 100,
        step: 5,
        unit: '%',
        schema: z.number().min(1).max(100),
      },
      showPercentages: {
        type: 'boolean',
        label: 'Show Percentages',
        description: 'Display percentages on pipeline bars',
        defaultValue: true,
        schema: z.boolean(),
      },
    },
    schema: z.object({
      targetAcceptanceRate: z.number().min(1).max(100),
      showPercentages: z.boolean(),
    }),
  } satisfies WidgetConfigSchema,
})

/**
 * Upcoming Deadlines Widget
 * Shows critical dates and timelines
 */
export const UPCOMING_DEADLINES_WIDGET = defineWidget({
  type: 'upcoming-deadlines',
  displayName: 'Upcoming Deadlines',
  description: 'Important dates and countdowns',
  category: 'core',
  icon: 'ClockIcon',
  constraints: {
    minCols: 3,
    maxCols: 12,
    minRows: 2,
    maxRows: 4,
  },
  defaultSize: {
    name: 'compact',
    colSpan: 3,
    rowSpan: 2,
  },
  availableSizes: [
    { name: 'compact', colSpan: 3, rowSpan: 2 },
    { name: 'narrow', colSpan: 3, rowSpan: 3 },
    { name: 'small', colSpan: 4, rowSpan: 3 },
    { name: 'medium', colSpan: 6, rowSpan: 3 },
    { name: 'wide', colSpan: 12, rowSpan: 3 },
  ],
  tags: ['deadlines', 'calendar', 'timeline'],
  phaseConfig: {
    relevantPhases: [
      'initialization',
      'planning',
      'execution',
      'post-conference',
    ],
    hideInIrrelevantPhases: false,
    isPhaseAdaptive: true,
  },
  configSchema: {
    fields: {
      urgentThreshold: {
        type: 'number',
        label: 'Urgent Threshold',
        description: 'Days before deadline to show as urgent',
        defaultValue: 7,
        min: 1,
        max: 30,
        step: 1,
        unit: 'days',
        schema: z.number().min(1).max(30),
      },
      maxDeadlines: {
        type: 'number',
        label: 'Maximum Deadlines',
        description: 'Number of deadlines to display',
        defaultValue: 5,
        min: 3,
        max: 10,
        step: 1,
        unit: 'items',
        schema: z.number().min(3).max(10),
      },
    },
    schema: z.object({
      urgentThreshold: z.number().min(1).max(30),
      maxDeadlines: z.number().min(3).max(10),
    }),
  } satisfies WidgetConfigSchema,
})

/**
 * CFP Health Widget
 * Monitors Call for Papers health metrics
 */
export const CFP_HEALTH_WIDGET = defineWidget({
  type: 'cfp-health',
  displayName: 'CFP Health',
  description: 'Call for Papers submission tracking',
  category: 'analytics',
  icon: 'DocumentTextIcon',
  constraints: {
    minCols: 3,
    maxCols: 8,
    minRows: 3,
    maxRows: 7,
  },
  defaultSize: {
    name: 'narrow',
    colSpan: 3,
    rowSpan: 6,
  },
  availableSizes: [
    { name: 'narrow', colSpan: 3, rowSpan: 6 },
    { name: 'small', colSpan: 4, rowSpan: 4 },
    { name: 'medium', colSpan: 6, rowSpan: 4 },
    { name: 'large', colSpan: 8, rowSpan: 5 },
  ],
  tags: ['cfp', 'submissions', 'analytics', 'chart'],
  phaseConfig: {
    relevantPhases: [
      'initialization',
      'planning',
      'execution',
      'post-conference',
    ],
    hideInIrrelevantPhases: false,
    isPhaseAdaptive: true,
  },
  configSchema: {
    fields: {
      submissionTarget: {
        type: 'number',
        label: 'Submission Target',
        description: 'Goal number of submissions for this CFP',
        defaultValue: 100,
        min: 1,
        max: 1000,
        step: 10,
        unit: 'submissions',
        schema: z.number().min(1).max(1000),
      },
      showTrend: {
        type: 'boolean',
        label: 'Show Trend Chart',
        description: 'Display submission trend over time',
        defaultValue: true,
        schema: z.boolean(),
      },
      showFormatBreakdown: {
        type: 'boolean',
        label: 'Show Format Breakdown',
        description: 'Display breakdown by talk format',
        defaultValue: true,
        schema: z.boolean(),
      },
    },
    schema: z.object({
      submissionTarget: z.number().min(1).max(1000),
      showTrend: z.boolean(),
      showFormatBreakdown: z.boolean(),
    }),
  } satisfies WidgetConfigSchema,
})

/**
 * Schedule Builder Status Widget
 * Tracks schedule creation progress
 */
export const SCHEDULE_BUILDER_WIDGET = defineWidget({
  type: 'schedule-builder',
  displayName: 'Schedule Builder',
  description: 'Schedule creation and slot allocation',
  category: 'operations',
  icon: 'CalendarIcon',
  constraints: {
    minCols: 4,
    maxCols: 6,
    minRows: 3,
    maxRows: 5,
  },
  defaultSize: {
    name: 'medium',
    colSpan: 6,
    rowSpan: 4,
  },
  availableSizes: [
    { name: 'small', colSpan: 4, rowSpan: 3 },
    { name: 'medium', colSpan: 6, rowSpan: 4 },
  ],
  tags: ['schedule', 'program', 'slots'],
  phaseConfig: {
    relevantPhases: [
      'initialization',
      'planning',
      'execution',
      'post-conference',
    ],
    hideInIrrelevantPhases: false,
    isPhaseAdaptive: true,
  },
})

/**
 * Ticket Sales Dashboard Widget
 * Monitors ticket sales and revenue
 */
export const TICKET_SALES_WIDGET = defineWidget({
  type: 'ticket-sales',
  displayName: 'Ticket Sales',
  description: 'Revenue and ticket sales tracking',
  category: 'analytics',
  icon: 'TicketIcon',
  constraints: {
    minCols: 4,
    maxCols: 8,
    minRows: 3,
    maxRows: 6,
  },
  defaultSize: {
    name: 'compact',
    colSpan: 6,
    rowSpan: 3,
  },
  availableSizes: [
    { name: 'compact', colSpan: 6, rowSpan: 3 },
    { name: 'small', colSpan: 4, rowSpan: 3 },
    { name: 'medium', colSpan: 6, rowSpan: 4 },
    { name: 'tall', colSpan: 6, rowSpan: 5 },
    { name: 'large', colSpan: 8, rowSpan: 5 },
  ],
  tags: ['tickets', 'revenue', 'sales', 'chart'],
  phaseConfig: {
    relevantPhases: [
      'initialization',
      'planning',
      'execution',
      'post-conference',
    ],
    hideInIrrelevantPhases: false,
    isPhaseAdaptive: true,
  },
  configSchema: {
    fields: {
      capacityTarget: {
        type: 'number',
        label: 'Capacity Target',
        description: 'Total ticket capacity for the event',
        defaultValue: 500,
        min: 50,
        max: 10000,
        step: 50,
        unit: 'tickets',
        schema: z.number().min(50).max(10000),
      },
      revenueTarget: {
        type: 'number',
        label: 'Revenue Target',
        description: 'Target revenue in local currency',
        defaultValue: 100000,
        min: 1000,
        max: 10000000,
        step: 1000,
        unit: 'NOK',
        schema: z.number().min(1000).max(10000000),
      },
      showTrend: {
        type: 'boolean',
        label: 'Show Sales Trend',
        description: 'Display sales trend chart',
        defaultValue: true,
        schema: z.boolean(),
      },
    },
    schema: z.object({
      capacityTarget: z.number().min(50).max(10000),
      revenueTarget: z.number().min(1000).max(10000000),
      showTrend: z.boolean(),
    }),
  } satisfies WidgetConfigSchema,
})

/**
 * Speaker Engagement Widget
 * Shows speaker statistics and diversity metrics
 */
export const SPEAKER_ENGAGEMENT_WIDGET = defineWidget({
  type: 'speaker-engagement',
  displayName: 'Speaker Engagement',
  description: 'Speaker statistics and diversity metrics',
  category: 'engagement',
  icon: 'UserGroupIcon',
  constraints: {
    minCols: 3,
    maxCols: 6,
    minRows: 2,
    maxRows: 5,
  },
  defaultSize: {
    name: 'small',
    colSpan: 3,
    rowSpan: 4,
  },
  availableSizes: [
    { name: 'narrow', colSpan: 3, rowSpan: 3 },
    { name: 'small', colSpan: 3, rowSpan: 4 },
    { name: 'medium', colSpan: 4, rowSpan: 3 },
    { name: 'wide', colSpan: 6, rowSpan: 3 },
  ],
  tags: ['speakers', 'diversity', 'engagement'],
  phaseConfig: {
    relevantPhases: [
      'initialization',
      'planning',
      'execution',
      'post-conference',
    ],
    hideInIrrelevantPhases: false,
    isPhaseAdaptive: true,
  },
  configSchema: {
    fields: {
      showDiversityMetrics: {
        type: 'boolean',
        label: 'Show Diversity Metrics',
        description: 'Display diversity statistics',
        defaultValue: true,
        schema: z.boolean(),
      },
      showGeography: {
        type: 'boolean',
        label: 'Show Geographic Distribution',
        description: 'Display speaker locations',
        defaultValue: true,
        schema: z.boolean(),
      },
      showFirstTimers: {
        type: 'boolean',
        label: 'Show First-Time Speakers',
        description: 'Highlight first-time speakers',
        defaultValue: true,
        schema: z.boolean(),
      },
    },
    schema: z.object({
      showDiversityMetrics: z.boolean(),
      showGeography: z.boolean(),
      showFirstTimers: z.boolean(),
    }),
  } satisfies WidgetConfigSchema,
})

/**
 * Sponsor Pipeline Widget
 * Tracks sponsor relationships and revenue
 */
export const SPONSOR_PIPELINE_WIDGET = defineWidget({
  type: 'sponsor-pipeline',
  displayName: 'Sponsor Pipeline',
  description: 'Sponsorship deals and revenue tracking',
  category: 'operations',
  icon: 'CurrencyDollarIcon',
  constraints: {
    minCols: 6,
    maxCols: 12,
    minRows: 4,
    maxRows: 10,
    prefersLandscape: true,
  },
  defaultSize: {
    name: 'tall',
    colSpan: 6,
    rowSpan: 9,
  },
  availableSizes: [
    { name: 'medium', colSpan: 6, rowSpan: 5 },
    { name: 'tall', colSpan: 6, rowSpan: 9 },
    { name: 'large', colSpan: 8, rowSpan: 5 },
    { name: 'full', colSpan: 12, rowSpan: 5 },
  ],
  tags: ['sponsors', 'revenue', 'pipeline', 'crm'],
  phaseConfig: {
    relevantPhases: [
      'initialization',
      'planning',
      'execution',
      'post-conference',
    ],
    hideInIrrelevantPhases: false,
    isPhaseAdaptive: true,
  },
  configSchema: {
    fields: {
      revenueTarget: {
        type: 'number',
        label: 'Sponsorship Revenue Target',
        description: 'Target sponsorship revenue',
        defaultValue: 500000,
        min: 10000,
        max: 10000000,
        step: 10000,
        unit: 'NOK',
        schema: z.number().min(10000).max(10000000),
      },
      showPipeline: {
        type: 'boolean',
        label: 'Show Pipeline Stages',
        description: 'Display deals by pipeline stage',
        defaultValue: true,
        schema: z.boolean(),
      },
      showContractStatus: {
        type: 'boolean',
        label: 'Show Contract Status',
        description: 'Display contract signing status',
        defaultValue: true,
        schema: z.boolean(),
      },
    },
    schema: z.object({
      revenueTarget: z.number().min(10000).max(10000000),
      showPipeline: z.boolean(),
      showContractStatus: z.boolean(),
    }),
  } satisfies WidgetConfigSchema,
})

/**
 * Workshop Capacity Widget
 * Monitors workshop registration and capacity
 */
export const WORKSHOP_CAPACITY_WIDGET = defineWidget({
  type: 'workshop-capacity',
  displayName: 'Workshop Capacity',
  description: 'Workshop registration and waitlists',
  category: 'operations',
  icon: 'AcademicCapIcon',
  constraints: {
    minCols: 3,
    maxCols: 6,
    minRows: 2,
    maxRows: 4,
  },
  defaultSize: {
    name: 'small',
    colSpan: 4,
    rowSpan: 2,
  },
  availableSizes: [
    { name: 'compact', colSpan: 3, rowSpan: 2 },
    { name: 'small', colSpan: 4, rowSpan: 2 },
    { name: 'medium', colSpan: 4, rowSpan: 3 },
    { name: 'wide', colSpan: 6, rowSpan: 3 },
  ],
  tags: ['workshops', 'capacity', 'registration'],
  phaseConfig: {
    relevantPhases: [
      'initialization',
      'planning',
      'execution',
      'post-conference',
    ],
    hideInIrrelevantPhases: false,
    isPhaseAdaptive: true,
  },
})

/**
 * Travel Support Queue Widget
 * Manages travel support requests and budget
 */
export const TRAVEL_SUPPORT_WIDGET = defineWidget({
  type: 'travel-support',
  displayName: 'Travel Support',
  description: 'Travel support requests and budget tracking',
  category: 'operations',
  icon: 'GlobeAltIcon',
  constraints: {
    minCols: 3,
    maxCols: 4,
    minRows: 3,
    maxRows: 5,
    prefersPortrait: true,
  },
  defaultSize: {
    name: 'small',
    colSpan: 3,
    rowSpan: 4,
  },
  availableSizes: [
    { name: 'small', colSpan: 3, rowSpan: 3 },
    { name: 'medium', colSpan: 3, rowSpan: 4 },
    { name: 'large', colSpan: 4, rowSpan: 5 },
  ],
  tags: ['travel', 'support', 'budget', 'expenses'],
  phaseConfig: {
    relevantPhases: [
      'initialization',
      'planning',
      'execution',
      'post-conference',
    ],
    hideInIrrelevantPhases: false,
    isPhaseAdaptive: true,
  },
  configSchema: {
    fields: {
      totalBudget: {
        type: 'number',
        label: 'Total Travel Budget',
        description: 'Total budget allocated for travel support',
        defaultValue: 100000,
        min: 1000,
        max: 1000000,
        step: 1000,
        unit: 'NOK',
        schema: z.number().min(1000).max(1000000),
      },
      showPendingRequests: {
        type: 'boolean',
        label: 'Show Pending Requests',
        description: 'Display pending approval requests',
        defaultValue: true,
        schema: z.boolean(),
      },
      showBudgetUtilization: {
        type: 'boolean',
        label: 'Show Budget Utilization',
        description: 'Display budget usage percentage',
        defaultValue: true,
        schema: z.boolean(),
      },
    },
    schema: z.object({
      totalBudget: z.number().min(1000).max(1000000),
      showPendingRequests: z.boolean(),
      showBudgetUtilization: z.boolean(),
    }),
  } satisfies WidgetConfigSchema,
})

/**
 * Recent Activity Feed Widget
 * Shows recent events and updates
 */
export const RECENT_ACTIVITY_WIDGET = defineWidget({
  type: 'recent-activity',
  displayName: 'Recent Activity',
  description: 'Latest events and updates across the system',
  category: 'engagement',
  icon: 'BellIcon',
  constraints: {
    minCols: 3,
    maxCols: 12,
    minRows: 3,
    maxRows: 10,
  },
  defaultSize: {
    name: 'narrow-tall',
    colSpan: 3,
    rowSpan: 10,
  },
  availableSizes: [
    { name: 'narrow', colSpan: 3, rowSpan: 5 },
    { name: 'narrow-tall', colSpan: 3, rowSpan: 10 },
    { name: 'medium', colSpan: 6, rowSpan: 4 },
    { name: 'large', colSpan: 8, rowSpan: 4 },
    { name: 'wide', colSpan: 12, rowSpan: 4 },
  ],
  tags: ['activity', 'feed', 'timeline', 'updates'],
  phaseConfig: {
    relevantPhases: [
      'initialization',
      'planning',
      'execution',
      'post-conference',
    ],
    hideInIrrelevantPhases: false,
    isPhaseAdaptive: true,
  },
  configSchema: {
    fields: {
      maxActivities: {
        type: 'number',
        label: 'Maximum Activities',
        description: 'Number of activity items to display',
        defaultValue: 10,
        min: 5,
        max: 50,
        step: 5,
        unit: 'items',
        schema: z.number().min(5).max(50),
      },
      activityTypes: {
        type: 'select',
        label: 'Activity Types',
        description: 'Types of activities to show',
        defaultValue: 'all',
        options: [
          { value: 'all', label: 'All Activities' },
          { value: 'proposals', label: 'Proposals Only' },
          { value: 'reviews', label: 'Reviews Only' },
          { value: 'speakers', label: 'Speaker Actions' },
        ],
        schema: z.enum(['all', 'proposals', 'reviews', 'speakers']),
      },
      showTimestamps: {
        type: 'boolean',
        label: 'Show Timestamps',
        description: 'Display relative time for each activity',
        defaultValue: true,
        schema: z.boolean(),
      },
    },
    schema: z.object({
      maxActivities: z.number().min(5).max(50),
      activityTypes: z.enum(['all', 'proposals', 'reviews', 'speakers']),
      showTimestamps: z.boolean(),
    }),
  } satisfies WidgetConfigSchema,
})

/**
 * Widget Registry
 * Maps widget types to their metadata
 */
export const WIDGET_REGISTRY: Record<string, WidgetMetadata> = {
  'quick-actions': QUICK_ACTIONS_WIDGET,
  'review-progress': REVIEW_PROGRESS_WIDGET,
  'proposal-pipeline': PROPOSAL_PIPELINE_WIDGET,
  'upcoming-deadlines': UPCOMING_DEADLINES_WIDGET,
  'cfp-health': CFP_HEALTH_WIDGET,
  'schedule-builder': SCHEDULE_BUILDER_WIDGET,
  'ticket-sales': TICKET_SALES_WIDGET,
  'speaker-engagement': SPEAKER_ENGAGEMENT_WIDGET,
  'sponsor-pipeline': SPONSOR_PIPELINE_WIDGET,
  'workshop-capacity': WORKSHOP_CAPACITY_WIDGET,
  'travel-support': TRAVEL_SUPPORT_WIDGET,
  'recent-activity': RECENT_ACTIVITY_WIDGET,
}

/**
 * Get metadata for a specific widget type
 */
export function getWidgetMetadata(type: string): WidgetMetadata | undefined {
  return WIDGET_REGISTRY[type]
}
