/**
 * Authentication and Authorization helpers for Travel Support
 */

import { TRPCError } from '@trpc/server'
import { getSpeaker } from '@/lib/speaker/sanity'
import { Flags } from '@/lib/speaker/types'
import { getTravelSupportById } from './sanity'
import { TravelSupportStatus } from './types'
import { AppEnvironment } from '@/lib/environment/config'
import { TravelSupport } from './types'

/**
 * Check if a speaker is eligible for travel funding
 */
export async function checkSpeakerEligibility(speakerId: string): Promise<{
  isEligible: boolean
  error?: Error
}> {
  try {
    const { speaker, err } = await getSpeaker(speakerId)

    if (err || !speaker) {
      return { isEligible: false, error: err || new Error('Speaker not found') }
    }

    // In test mode, all speakers are eligible for travel funding
    if (AppEnvironment.isTestMode) {
      return { isEligible: true }
    }

    // Check if speaker requires travel funding
    if (!speaker.flags?.includes(Flags.requiresTravelFunding)) {
      return {
        isEligible: false,
        error: new Error('Speaker is not eligible for travel funding'),
      }
    }

    return { isEligible: true }
  } catch (error) {
    return { isEligible: false, error: error as Error }
  }
}

/**
 * Check if travel support can be modified based on its current status
 */
export function canModifyTravelSupport(status: TravelSupportStatus): boolean {
  return status === 'draft' || status === 'submitted'
}

/**
 * Check if expenses can be added/deleted based on travel support status
 */
export function canAddExpenses(status: TravelSupportStatus): boolean {
  return status === 'draft'
}

/**
 * Verify travel support ownership and access permissions
 */
export async function verifyTravelSupportOwnership(
  travelSupportId: string,
  speakerId: string,
  isOrganizer: boolean = false,
): Promise<{
  travelSupport: TravelSupport | null
  hasAccess: boolean
  error?: Error
}> {
  try {
    const { travelSupport, error } = await getTravelSupportById(travelSupportId)

    if (error || !travelSupport) {
      return {
        travelSupport: null,
        hasAccess: false,
        error: error || new Error('Travel support request not found'),
      }
    }

    const hasAccess = isOrganizer || travelSupport.speaker._ref === speakerId

    return { travelSupport, hasAccess }
  } catch (error) {
    return { travelSupport: null, hasAccess: false, error: error as Error }
  }
}

/**
 * Create a standardized authorization error
 */
export function createAuthError(
  code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND',
  message: string,
  cause?: Error,
): TRPCError {
  return new TRPCError({
    code,
    message,
    cause,
  })
}

/**
 * Audit log helper for sensitive operations
 * TODO: Replace this with persistent audit logging to a secure database or logging service.
 */
export function auditLog(
  operation: string,
  adminId: string,
  adminName: string,
  details: Record<string, unknown>,
): void {
  // TODO: Implement persistent audit logging for compliance and security monitoring.
  // Example: send to external logging service or write to secure database.
  // This is a placeholder for development only.
  // throw new Error('Persistent audit logging not implemented');
}

/**
 * Enhanced authorization middleware for travel support operations
 */
export async function authorizeTravelSupportOperation(
  travelSupportId: string,
  speakerId: string,
  isOrganizer: boolean,
  operation: 'read' | 'modify' | 'submit' | 'approve',
): Promise<{
  authorized: boolean
  travelSupport?: TravelSupport
  error?: TRPCError
}> {
  try {
    // Verify travel support exists and check ownership
    const { travelSupport, hasAccess, error } =
      await verifyTravelSupportOwnership(
        travelSupportId,
        speakerId,
        isOrganizer,
      )

    if (error || !travelSupport) {
      return {
        authorized: false,
        error: createAuthError(
          'NOT_FOUND',
          'Travel support request not found',
          error,
        ),
      }
    }

    if (!hasAccess) {
      return {
        authorized: false,
        error: createAuthError(
          'FORBIDDEN',
          'Access denied to this travel support request',
        ),
      }
    }

    // Operation-specific checks
    switch (operation) {
      case 'read':
        // Any authorized user can read
        break

      case 'modify':
        if (!canModifyTravelSupport(travelSupport.status)) {
          return {
            authorized: false,
            error: createAuthError(
              'FORBIDDEN',
              `Cannot modify travel support when status is ${travelSupport.status}`,
            ),
          }
        }
        break

      case 'submit':
        if (isOrganizer) {
          return {
            authorized: false,
            error: createAuthError(
              'FORBIDDEN',
              'Admins cannot submit travel support requests',
            ),
          }
        }
        if (travelSupport.status !== 'draft') {
          return {
            authorized: false,
            error: createAuthError(
              'FORBIDDEN',
              `Cannot submit request when status is ${travelSupport.status}`,
            ),
          }
        }
        break

      case 'approve':
        if (!isOrganizer) {
          return {
            authorized: false,
            error: createAuthError(
              'FORBIDDEN',
              'Only admins can approve travel support requests',
            ),
          }
        }
        break

      default:
        return {
          authorized: false,
          error: createAuthError('FORBIDDEN', 'Unknown operation'),
        }
    }

    return {
      authorized: true,
      travelSupport,
    }
  } catch (error) {
    return {
      authorized: false,
      error: createAuthError(
        'UNAUTHORIZED',
        'Authorization check failed',
        error as Error,
      ),
    }
  }
}
