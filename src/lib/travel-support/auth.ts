/**
 * Authentication and Authorization helpers for Travel Support
 */

import { TRPCError } from '@trpc/server'
import { getSpeaker } from '@/lib/speaker/sanity'
import { Flags } from '@/lib/speaker/types'
import { getTravelSupportById } from './sanity'
import {
  TravelSupportStatus,
  TravelSupportWithSpeaker,
  TravelExpense,
} from './types'
import { AppEnvironment } from '@/lib/environment/config'

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
  travelSupport:
    | (TravelSupportWithSpeaker & { expenses: TravelExpense[] })
    | null
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

    const hasAccess = isOrganizer || travelSupport.speaker._id === speakerId

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
 * Audit logging interface for production-ready logging
 */
interface AuditLogEntry {
  operation: string
  adminId: string
  adminName: string
  details: Record<string, unknown>
  timestamp: string
  severity: 'info' | 'warning' | 'error'
  sessionId?: string
  ipAddress?: string
}

/**
 * Production-ready audit logging function
 * In development: logs to console
 * In production: should integrate with your logging service (e.g., DataDog, CloudWatch, etc.)
 */
export function auditLog(
  operation: string,
  adminId: string,
  adminName: string,
  details: Record<string, unknown>,
  severity: 'info' | 'warning' | 'error' = 'info',
): void {
  const logEntry: AuditLogEntry = {
    operation,
    adminId,
    adminName,
    details,
    timestamp: new Date().toISOString(),
    severity,
  }

  // Development: log to console with structured format
  if (process.env.NODE_ENV === 'development') {
    console.log(`[AUDIT ${severity.toUpperCase()}]:`, logEntry)
    return
  }

  // Production: integrate with your logging service
  // TODO: Replace with your production logging service
  // Examples:
  // - send to DataDog: datadogLogger.log(logEntry)
  // - send to CloudWatch: cloudWatchLogger.log(logEntry)
  // - send to Sentry: Sentry.addBreadcrumb(logEntry)
  // - write to database: auditLogRepository.create(logEntry)

  try {
    // For now, use structured console logging even in production
    // This should be replaced with proper logging service integration
    console.log(
      JSON.stringify({
        type: 'audit_log',
        ...logEntry,
      }),
    )
  } catch (error) {
    // Fallback: if logging fails, don't throw error to avoid breaking application
    console.error(
      'Failed to write audit log:',
      error,
      'Original log entry:',
      logEntry,
    )
  }
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
  travelSupport?: TravelSupportWithSpeaker & { expenses: TravelExpense[] }
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
