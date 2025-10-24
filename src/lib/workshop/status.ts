/**
 * Workshop signup status utilities
 *
 * These functions provide reusable logic for managing workshop signup states,
 * user enrollment checks, and status display logic.
 *
 * Currently used in:
 * - WorkshopCard (public): getUserWorkshopSignup, hasConfirmedSignup, isUserOnWaitlist,
 *   shouldShowAsFull, getSignupButtonText
 * - WorkshopList (public): hasConfirmedSignup
 */

import type { ProposalWithWorkshopData, WorkshopSignupExisting } from './types'
import { WorkshopSignupStatus as SignupStatus } from './types'

/**
 * Check if user has a confirmed signup for a workshop
 * Note: This excludes waitlist status. Use getUserWorkshopSignup() to check for any signup.
 * Currently used in: WorkshopCard, WorkshopList
 */
export function hasConfirmedSignup(
  workshopId: string,
  userSignups: WorkshopSignupExisting[],
): boolean {
  return userSignups.some(
    (signup) =>
      (signup.workshop._id === workshopId ||
        signup.workshop._ref === workshopId) &&
      signup.status !== SignupStatus.WAITLIST,
  )
}

/**
 * Check if user is on waitlist for a workshop
 */
export function isUserOnWaitlist(
  workshopId: string,
  userSignups: WorkshopSignupExisting[],
): boolean {
  return userSignups.some(
    (signup) =>
      (signup.workshop._id === workshopId ||
        signup.workshop._ref === workshopId) &&
      signup.status === SignupStatus.WAITLIST,
  )
}

/**
 * Get user's signup for a specific workshop
 */
export function getUserWorkshopSignup(
  workshopId: string,
  userSignups: WorkshopSignupExisting[],
): WorkshopSignupExisting | undefined {
  return userSignups.find(
    (signup) =>
      signup.workshop._id === workshopId || signup.workshop._ref === workshopId,
  )
}

/**
 * Determine if workshop should show as full to users
 * (considers both capacity and waitlist)
 */
export function shouldShowAsFull(workshop: ProposalWithWorkshopData): boolean {
  return workshop.available <= 0
}

/**
 * Get appropriate button text based on workshop state
 */
export function getSignupButtonText(
  workshop: ProposalWithWorkshopData,
  isSignedUp: boolean,
  isOnWaitlist: boolean,
  hasTimeConflict: boolean,
): string {
  if (isSignedUp) {
    return 'Signed Up'
  }

  if (isOnWaitlist) {
    return 'On Waitlist'
  }

  if (hasTimeConflict) {
    return 'Time Conflict'
  }

  if (shouldShowAsFull(workshop)) {
    return 'Workshop Full'
  }

  return 'Sign Up'
}
