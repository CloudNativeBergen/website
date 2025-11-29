/**
 * Conference Phase Detection
 *
 * Determines the current operational phase of a conference based on
 * date fields and state helpers. This enables phase-aware dashboard
 * widgets and adaptive UI throughout the admin interface.
 */

import { Conference } from './types'
import { isCfpOpen, isProgramPublished, isConferenceOver } from './state'

export type ConferencePhase =
  | 'initialization' // Before CFP opens
  | 'planning' // CFP open through review/selection
  | 'execution' // Program published through event end
  | 'post-conference' // After event ends

/**
 * Determine current conference phase based on dates and state
 *
 * Phase transitions:
 * 1. Initialization → Planning: CFP opens (cfp_start_date)
 * 2. Planning → Execution: Program published (program_date)
 * 3. Execution → Post-Conference: Day after event ends (end_date + 1)
 */
export function getCurrentPhase(conference: Conference): ConferencePhase {
  // Post-conference: After event ends
  if (isConferenceOver(conference)) {
    return 'post-conference'
  }

  // Execution: Program published until event end
  if (isProgramPublished(conference)) {
    return 'execution'
  }

  // Planning: CFP open until program published
  if (isCfpOpen(conference)) {
    return 'planning'
  }

  // Check if CFP has closed but program not yet published (still planning/review)
  const now = new Date()
  const cfpEnd = conference.cfp_end_date
    ? new Date(conference.cfp_end_date + 'T23:59:59.999Z')
    : null
  const programDate = conference.program_date
    ? new Date(conference.program_date)
    : null

  if (cfpEnd && programDate && now > cfpEnd && now < programDate) {
    return 'planning' // Still in review/selection phase
  }

  // Default: Initialization (before CFP opens)
  return 'initialization'
}

/**
 * Get comprehensive phase context for widgets
 *
 * Provides all phase-related data that widgets might need
 * to adapt their display and behavior.
 */
export function getPhaseContext(conference: Conference) {
  const phase = getCurrentPhase(conference)
  const now = new Date()

  return {
    phase,
    // State flags
    isCfpOpen: isCfpOpen(conference),
    isProgramPublished: isProgramPublished(conference),
    isConferenceOver: isConferenceOver(conference),

    // Countdown timers (in days)
    daysUntilCfpStart: conference.cfp_start_date
      ? Math.ceil(
          (new Date(conference.cfp_start_date).getTime() - now.getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null,

    daysUntilCfpClose: conference.cfp_end_date
      ? Math.ceil(
          (new Date(conference.cfp_end_date).getTime() - now.getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null,

    daysUntilNotification: conference.cfp_notify_date
      ? Math.ceil(
          (new Date(conference.cfp_notify_date).getTime() - now.getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null,

    daysUntilProgramRelease: conference.program_date
      ? Math.ceil(
          (new Date(conference.program_date).getTime() - now.getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null,

    daysUntilConference: conference.start_date
      ? Math.ceil(
          (new Date(conference.start_date).getTime() - now.getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null,

    daysSinceConference: conference.end_date
      ? Math.ceil(
          (now.getTime() - new Date(conference.end_date).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null,
  }
}

/**
 * Get human-readable phase label
 */
export function getPhaseName(phase: ConferencePhase): string {
  const labels: Record<ConferencePhase, string> = {
    initialization: 'Setup & Planning',
    planning: 'CFP & Review',
    execution: 'Pre-Event & Delivery',
    'post-conference': 'Post-Event',
  }
  return labels[phase]
}

/**
 * Get phase-specific color scheme for UI elements
 */
export function getPhaseColor(phase: ConferencePhase): {
  bg: string
  text: string
  border: string
} {
  const colors: Record<
    ConferencePhase,
    { bg: string; text: string; border: string }
  > = {
    initialization: {
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      text: 'text-blue-800 dark:text-blue-300',
      border: 'border-blue-200 dark:border-blue-800',
    },
    planning: {
      bg: 'bg-purple-100 dark:bg-purple-900/30',
      text: 'text-purple-800 dark:text-purple-300',
      border: 'border-purple-200 dark:border-purple-800',
    },
    execution: {
      bg: 'bg-amber-100 dark:bg-amber-900/30',
      text: 'text-amber-800 dark:text-amber-300',
      border: 'border-amber-200 dark:border-amber-800',
    },
    'post-conference': {
      bg: 'bg-green-100 dark:bg-green-900/30',
      text: 'text-green-800 dark:text-green-300',
      border: 'border-green-200 dark:border-green-800',
    },
  }
  return colors[phase]
}
