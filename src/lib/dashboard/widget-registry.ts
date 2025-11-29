/**
 * Widget Registry
 *
 * Central registry of all available dashboard widgets with their metadata.
 * Widgets self-register by defining their sizing preferences and constraints.
 */

import { defineWidget, type WidgetMetadata } from './widget-metadata'

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
    minCols: 4,
    maxCols: 12,
    minRows: 2,
    maxRows: 4,
    prefersLandscape: true,
  },
  defaultSize: {
    name: 'medium',
    colSpan: 6,
    rowSpan: 3,
  },
  availableSizes: [
    { name: 'small', colSpan: 4, rowSpan: 3 },
    { name: 'medium', colSpan: 6, rowSpan: 3 },
    { name: 'wide', colSpan: 12, rowSpan: 3 },
  ],
  tags: ['deadlines', 'calendar', 'timeline'],
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
    minCols: 4,
    maxCols: 8,
    minRows: 4,
    maxRows: 6,
  },
  defaultSize: {
    name: 'medium',
    colSpan: 6,
    rowSpan: 4,
  },
  availableSizes: [
    { name: 'small', colSpan: 4, rowSpan: 4 },
    { name: 'medium', colSpan: 6, rowSpan: 4 },
    { name: 'large', colSpan: 8, rowSpan: 5 },
  ],
  tags: ['cfp', 'submissions', 'analytics', 'chart'],
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
    name: 'medium',
    colSpan: 6,
    rowSpan: 4,
  },
  availableSizes: [
    { name: 'small', colSpan: 4, rowSpan: 3 },
    { name: 'medium', colSpan: 6, rowSpan: 4 },
    { name: 'large', colSpan: 8, rowSpan: 5 },
  ],
  tags: ['tickets', 'revenue', 'sales', 'chart'],
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
    maxRows: 4,
  },
  defaultSize: {
    name: 'medium',
    colSpan: 4,
    rowSpan: 3,
  },
  availableSizes: [
    { name: 'small', colSpan: 3, rowSpan: 2 },
    { name: 'medium', colSpan: 4, rowSpan: 3 },
    { name: 'wide', colSpan: 6, rowSpan: 3 },
  ],
  tags: ['speakers', 'diversity', 'engagement'],
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
    maxRows: 6,
    prefersLandscape: true,
  },
  defaultSize: {
    name: 'large',
    colSpan: 8,
    rowSpan: 5,
  },
  availableSizes: [
    { name: 'medium', colSpan: 6, rowSpan: 4 },
    { name: 'large', colSpan: 8, rowSpan: 5 },
    { name: 'full', colSpan: 12, rowSpan: 5 },
  ],
  tags: ['sponsors', 'revenue', 'pipeline', 'crm'],
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
    minCols: 4,
    maxCols: 12,
    minRows: 3,
    maxRows: 6,
    prefersLandscape: true,
  },
  defaultSize: {
    name: 'wide',
    colSpan: 12,
    rowSpan: 4,
  },
  availableSizes: [
    { name: 'medium', colSpan: 6, rowSpan: 4 },
    { name: 'large', colSpan: 8, rowSpan: 4 },
    { name: 'wide', colSpan: 12, rowSpan: 4 },
    { name: 'full', colSpan: 12, rowSpan: 6 },
  ],
  tags: ['activity', 'feed', 'timeline', 'updates'],
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
