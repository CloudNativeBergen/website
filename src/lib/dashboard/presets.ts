import type { Widget } from './types'

export interface PresetConfig {
  name: string
  description: string
  widgets: Widget[]
}

export const PRESET_CONFIGS: Record<string, PresetConfig> = {
  planning: {
    name: 'Planning Focus',
    description:
      'Sponsor pipeline, CFP preparation, speaker outreach, and early bird tickets',
    widgets: [
      {
        id: 'quick-actions',
        type: 'quick-actions',
        title: 'Quick Actions',
        position: { row: 0, col: 0, rowSpan: 2, colSpan: 3 },
      },
      {
        id: 'sponsor-pipeline',
        type: 'sponsor-pipeline',
        title: 'Sponsor Pipeline',
        position: { row: 0, col: 3, rowSpan: 4, colSpan: 5 },
      },
      {
        id: 'upcoming-deadlines',
        type: 'upcoming-deadlines',
        title: 'Upcoming Deadlines',
        position: { row: 0, col: 8, rowSpan: 3, colSpan: 4 },
      },
      {
        id: 'cfp-health',
        type: 'cfp-health',
        title: 'CFP Health',
        position: { row: 2, col: 0, rowSpan: 3, colSpan: 3 },
      },
      {
        id: 'recent-activity',
        type: 'recent-activity',
        title: 'Recent Activity',
        position: { row: 3, col: 8, rowSpan: 4, colSpan: 4 },
      },
      {
        id: 'ticket-sales',
        type: 'ticket-sales',
        title: 'Ticket Sales',
        position: { row: 4, col: 3, rowSpan: 3, colSpan: 5 },
      },
      {
        id: 'speaker-engagement',
        type: 'speaker-engagement',
        title: 'Speaker Engagement',
        position: { row: 5, col: 0, rowSpan: 2, colSpan: 3 },
      },
    ],
  },
  execution: {
    name: 'Execution Focus',
    description: 'Event operations, tickets, workshops, and schedule',
    widgets: [
      {
        id: 'quick-actions',
        type: 'quick-actions',
        title: 'Quick Actions',
        position: { row: 0, col: 0, rowSpan: 2, colSpan: 3 },
      },
      {
        id: 'ticket-sales',
        type: 'ticket-sales',
        title: 'Ticket Sales',
        position: { row: 0, col: 3, rowSpan: 4, colSpan: 6 },
      },
      {
        id: 'upcoming-deadlines',
        type: 'upcoming-deadlines',
        title: 'Upcoming Deadlines',
        position: { row: 0, col: 9, rowSpan: 2, colSpan: 3 },
      },
      {
        id: 'schedule-builder',
        type: 'schedule-builder',
        title: 'Schedule Builder',
        position: { row: 2, col: 0, rowSpan: 3, colSpan: 3 },
      },
      {
        id: 'workshop-capacity',
        type: 'workshop-capacity',
        title: 'Workshop Capacity',
        position: { row: 2, col: 9, rowSpan: 3, colSpan: 3 },
      },
      {
        id: 'recent-activity',
        type: 'recent-activity',
        title: 'Recent Activity',
        position: { row: 5, col: 0, rowSpan: 3, colSpan: 12 },
      },
    ],
  },
  financial: {
    name: 'Financial Focus',
    description: 'Sponsors, ticket revenue, and travel budgets',
    widgets: [
      {
        id: 'quick-actions',
        type: 'quick-actions',
        title: 'Quick Actions',
        position: { row: 0, col: 0, rowSpan: 2, colSpan: 3 },
      },
      {
        id: 'sponsor-pipeline',
        type: 'sponsor-pipeline',
        title: 'Sponsor Pipeline',
        position: { row: 0, col: 3, rowSpan: 4, colSpan: 6 },
      },
      {
        id: 'ticket-sales',
        type: 'ticket-sales',
        title: 'Ticket Sales',
        position: { row: 0, col: 9, rowSpan: 4, colSpan: 3 },
      },
      {
        id: 'travel-support',
        type: 'travel-support',
        title: 'Travel Support',
        position: { row: 2, col: 0, rowSpan: 3, colSpan: 3 },
      },
      {
        id: 'upcoming-deadlines',
        type: 'upcoming-deadlines',
        title: 'Upcoming Deadlines',
        position: { row: 4, col: 3, rowSpan: 2, colSpan: 6 },
      },
      {
        id: 'recent-activity',
        type: 'recent-activity',
        title: 'Recent Activity',
        position: { row: 6, col: 0, rowSpan: 3, colSpan: 12 },
      },
    ],
  },
  comprehensive: {
    name: 'Comprehensive',
    description: 'Balanced view across all conference domains',
    widgets: [
      {
        id: 'quick-actions',
        type: 'quick-actions',
        title: 'Quick Actions',
        position: { row: 0, col: 0, rowSpan: 2, colSpan: 3 },
      },
      {
        id: 'review-progress',
        type: 'review-progress',
        title: 'Review Progress',
        position: { row: 0, col: 3, rowSpan: 2, colSpan: 3 },
      },
      {
        id: 'upcoming-deadlines',
        type: 'upcoming-deadlines',
        title: 'Upcoming Deadlines',
        position: { row: 0, col: 6, rowSpan: 2, colSpan: 6 },
      },
      {
        id: 'proposal-pipeline',
        type: 'proposal-pipeline',
        title: 'Proposal Pipeline',
        position: { row: 2, col: 0, rowSpan: 3, colSpan: 6 },
      },
      {
        id: 'cfp-health',
        type: 'cfp-health',
        title: 'CFP Health',
        position: { row: 2, col: 6, rowSpan: 3, colSpan: 6 },
      },
      {
        id: 'speaker-engagement',
        type: 'speaker-engagement',
        title: 'Speaker Engagement',
        position: { row: 5, col: 0, rowSpan: 3, colSpan: 4 },
      },
      {
        id: 'workshop-capacity',
        type: 'workshop-capacity',
        title: 'Workshop Capacity',
        position: { row: 5, col: 4, rowSpan: 3, colSpan: 4 },
      },
      {
        id: 'travel-support',
        type: 'travel-support',
        title: 'Travel Support',
        position: { row: 5, col: 8, rowSpan: 3, colSpan: 4 },
      },
      {
        id: 'sponsor-pipeline',
        type: 'sponsor-pipeline',
        title: 'Sponsor Pipeline',
        position: { row: 8, col: 0, rowSpan: 4, colSpan: 8 },
      },
      {
        id: 'schedule-builder',
        type: 'schedule-builder',
        title: 'Schedule Builder',
        position: { row: 8, col: 8, rowSpan: 4, colSpan: 4 },
      },
      {
        id: 'ticket-sales',
        type: 'ticket-sales',
        title: 'Ticket Sales',
        position: { row: 12, col: 0, rowSpan: 4, colSpan: 6 },
      },
      {
        id: 'recent-activity',
        type: 'recent-activity',
        title: 'Recent Activity',
        position: { row: 12, col: 6, rowSpan: 4, colSpan: 6 },
      },
    ],
  },
}

export const EMPTY_PRESET: PresetConfig = {
  name: 'Empty',
  description: 'Start from scratch and add your own widgets',
  widgets: [],
}

export const ALL_PRESETS: Record<string, PresetConfig> = {
  planning: PRESET_CONFIGS.planning,
  execution: PRESET_CONFIGS.execution,
  financial: PRESET_CONFIGS.financial,
  comprehensive: PRESET_CONFIGS.comprehensive,
  empty: EMPTY_PRESET,
}

export const PRESET_KEYS = Object.keys(ALL_PRESETS)
