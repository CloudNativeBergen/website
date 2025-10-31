import { Conference } from './types'

/**
 * Conference state helper functions to centralize date-based logic
 * and prevent duplication of complex conditions across components.
 */

/**
 * Check if the conference has ended (day after end_date has passed)
 */
export function isConferenceOver(conference: Conference): boolean {
  const endDate = new Date(conference.end_date)
  const dayAfterEnd = new Date(endDate)
  dayAfterEnd.setDate(dayAfterEnd.getDate() + 1)
  return new Date() >= dayAfterEnd
}

/**
 * Check if the Call for Papers is currently open
 */
export function isCfpOpen(conference: Conference): boolean {
  if (!conference.cfp_start_date || !conference.cfp_end_date) {
    return false
  }
  const now = new Date()
  return (
    now >= new Date(conference.cfp_start_date) &&
    now <= new Date(conference.cfp_end_date)
  )
}

/**
 * Check if the program has been published
 */
export function isProgramPublished(conference: Conference): boolean {
  if (!conference.program_date) {
    return false
  }
  return new Date() >= new Date(conference.program_date)
}

/**
 * Check if registration/tickets are available
 * Returns true only if:
 * - Registration is enabled
 * - Registration link exists
 * - Conference has not ended
 */
export function isRegistrationAvailable(conference: Conference): boolean {
  return (
    conference.registration_enabled &&
    !!conference.registration_link &&
    !isConferenceOver(conference)
  )
}

/**
 * Check if workshop registration is currently open
 */
export function isWorkshopRegistrationOpen(conference: Conference): boolean {
  if (
    !conference.workshop_registration_start ||
    !conference.workshop_registration_end
  ) {
    return false
  }
  const now = new Date()
  return (
    now >= new Date(conference.workshop_registration_start) &&
    now <= new Date(conference.workshop_registration_end)
  )
}

/**
 * Check if we should be seeking sponsors (more than 4 weeks before conference)
 */
export function isSeekingSponsors(conference: Conference): boolean {
  if (!conference.start_date) {
    return false
  }
  const timeUntilConference =
    new Date(conference.start_date).getTime() - new Date().getTime()
  const fourWeeks = 4 * 7 * 24 * 60 * 60 * 1000
  return timeUntilConference > fourWeeks
}
