/**
 * Widget Registry
 *
 * Central registry of all available dashboard widgets with their metadata.
 * Widgets self-register by defining their sizing preferences and constraints.
 */

import { defineWidget, type WidgetMetadata } from './widget-metadata'
import { z } from 'zod'
import type { WidgetConfigSchema } from './types'

/*
 * Size calibration: with GRID_CONFIG (cellSize 96, gap 16) a widget's inner
 * content height is ≈ 112·rowSpan − 36 px (row steps minus border/padding).
 * Defaults below are sized to the measured height of each widget's fullest
 * operational view so newly added widgets neither clip (content scrolls via
 * WidgetBody anyway) nor float in dead space. Stored user layouts keep their
 * persisted spans — defaults only affect newly added widgets.
 */

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
    // Mins match the smallest availableSize (3×2) — the old minCols 2 was
    // below every offered size and only reachable via manual resize.
    minCols: 3,
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
  // 3×6 (≈636px) was sparse for the ~350px operational view → 3×4 (≈412px).
  defaultSize: {
    name: 'narrow',
    colSpan: 3,
    rowSpan: 4,
  },
  availableSizes: [
    { name: 'narrow', colSpan: 3, rowSpan: 4 },
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
    minCols: 3,
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
    { name: 'compact', colSpan: 3, rowSpan: 3 },
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
    minCols: 3,
    maxCols: 8,
    minRows: 3,
    maxRows: 6,
  },
  // The full sales view (stats + gauge + trend + countdown) measures ≈470px;
  // the old 6×3 default (≈300px) forced immediate scrolling → 6×4 (≈412px).
  defaultSize: {
    name: 'medium',
    colSpan: 6,
    rowSpan: 4,
  },
  availableSizes: [
    { name: 'narrow', colSpan: 3, rowSpan: 4 },
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
  // NOTE: capacity and revenue targets deliberately have NO config knobs here —
  // they come from canonical conference settings (ticketCapacity/ticketTargets)
  // via the fetch action. Double-sourcing them in widget config was removed.
  configSchema: {
    fields: {
      showTrend: {
        type: 'boolean',
        label: 'Show Sales Trend',
        description: 'Display sales trend chart',
        defaultValue: true,
        schema: z.boolean(),
      },
    },
    schema: z.object({
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
    minCols: 5,
    maxCols: 12,
    minRows: 4,
    maxRows: 10,
    prefersLandscape: true,
  },
  // The operational view (stats + revenue bar + 4 pipeline stages) measures
  // ≈420px; the old 6×9 default (≈972px) left over 500px of dead space →
  // 6×4 (≈412px). The 6×9 'tall' preset is dropped for the same reason.
  defaultSize: {
    name: 'medium',
    colSpan: 6,
    rowSpan: 4,
  },
  availableSizes: [
    { name: 'compact', colSpan: 5, rowSpan: 4 },
    { name: 'medium', colSpan: 6, rowSpan: 4 },
    { name: 'tall', colSpan: 6, rowSpan: 5 },
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
  // NOTE: the revenue target has NO config knob here — it comes from the
  // canonical conference setting (sponsorRevenueGoal) via the fetch action.
  configSchema: {
    fields: {
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
  // The operational view (3 stat tiles + 3 workshop cards) measures ≈310px;
  // the old 4×2 default (≈188px) clipped its own default content → 4×3
  // (≈300px). 3×2/4×2 stay available — they scroll via WidgetBody.
  defaultSize: {
    name: 'medium',
    colSpan: 4,
    rowSpan: 3,
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
  // NOTE: the travel budget has NO config knob here — it comes from the
  // canonical conference setting (travelSupportBudget) via the fetch action.
  configSchema: {
    fields: {
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
    minRows: 2,
    maxRows: 10,
  },
  // A 10-item page measures ≈600px, so the old 3×10 default (≈1084px) was
  // half-empty; pages also scroll now → 3×4 (≈412px, ~6 items visible).
  // The 3×10 'narrow-tall' preset is dropped for the same reason.
  defaultSize: {
    name: 'small',
    colSpan: 3,
    rowSpan: 4,
  },
  availableSizes: [
    { name: 'compact', colSpan: 3, rowSpan: 2 },
    { name: 'small', colSpan: 3, rowSpan: 4 },
    { name: 'narrow', colSpan: 3, rowSpan: 5 },
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
      // Key kept as `maxActivities` for stored-config compatibility; the
      // widget paginates all fetched activities, so this is a page size.
      maxActivities: {
        type: 'number',
        label: 'Items Per Page',
        description: 'Number of activity items shown per page',
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
 * My Areas Widget (TEAMS-3, L4)
 * Per-team needs-attention counts for the teams the viewer belongs to.
 */
export const MY_AREAS_WIDGET = defineWidget({
  type: 'my-areas',
  displayName: 'My Areas',
  description:
    "Needs-attention counts for the teams you're on, deep-linked to each surface",
  category: 'operations',
  icon: 'UserGroupIcon',
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
    description: 'Compact team areas',
  },
  availableSizes: [
    { name: 'compact', colSpan: 3, rowSpan: 2 },
    { name: 'small', colSpan: 4, rowSpan: 2 },
    { name: 'wide', colSpan: 6, rowSpan: 2 },
  ],
  tags: ['teams', 'triage', 'operations'],
  phaseConfig: {
    relevantPhases: [
      'initialization',
      'planning',
      'execution',
      'post-conference',
    ],
    hideInIrrelevantPhases: false,
    isPhaseAdaptive: false,
  },
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
  'my-areas': MY_AREAS_WIDGET,
}

/**
 * Get metadata for a specific widget type
 */
export function getWidgetMetadata(type: string): WidgetMetadata | undefined {
  return WIDGET_REGISTRY[type]
}
