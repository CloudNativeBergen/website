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
import { isOrganizerForOrg } from '@/lib/authz/organizer'

/**
 * The minimum speaker shape the travel-support authz needs: identity plus the
 * ORG-SCOPED organizer capability (`organizerOrgIds`, with `isOrganizer` kept
 * only for the legacy-token bridge inside {@link isOrganizerForOrg}). Callers pass
 * `ctx.speaker` (the session speaker). B3 (#642): the organizer grant is decided
 * against the REQUEST'S OWN org (the travel support's conference org), never the
 * deprecated global flag — so a cross-tenant organizer cannot reach another
 * tenant's banking PII.
 */
export interface TravelSupportAuthSpeaker {
  _id: string
  name?: string
  isOrganizer?: boolean
  organizerOrgIds?: string[]
}

export async function checkSpeakerEligibility(speakerId: string): Promise<{
  isEligible: boolean
  error?: Error
}> {
  try {
    const { speaker, err } = await getSpeaker(speakerId)

    if (err || !speaker) {
      return { isEligible: false, error: err || new Error('Speaker not found') }
    }

    if (AppEnvironment.isTestMode) {
      return { isEligible: true }
    }

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

export function canModifyTravelSupport(status: TravelSupportStatus): boolean {
  return status === 'draft' || status === 'submitted'
}

export function canAddExpenses(status: TravelSupportStatus): boolean {
  return status === 'draft'
}

export async function verifyTravelSupportOwnership(
  travelSupportId: string,
  speaker: TravelSupportAuthSpeaker,
): Promise<{
  travelSupport:
    (TravelSupportWithSpeaker & { expenses: TravelExpense[] }) | null
  hasAccess: boolean
  /**
   * The ORG-SCOPED organizer decision for THIS request (the caller organizes the
   * travel support's own org). Surfaced so callers (e.g. the `approve` gate) reuse
   * the same resource-scoped grant rather than the deprecated global flag.
   */
  isOrganizer: boolean
  error?: Error
}> {
  try {
    const { travelSupport, error } = await getTravelSupportById(travelSupportId)

    if (error || !travelSupport) {
      return {
        travelSupport: null,
        hasAccess: false,
        isOrganizer: false,
        error: error || new Error('Travel support request not found'),
      }
    }

    // ORG-SCOPE the organizer grant to the request's OWN org (B3, #642): an
    // organizer of another tenant is not an organizer HERE and falls back to the
    // owner check, so cross-tenant banking PII stays inaccessible.
    const isOrganizer = isOrganizerForOrg(
      speaker,
      travelSupport.conferenceOrgId ?? null,
    )
    const hasAccess = isOrganizer || travelSupport.speaker._id === speaker._id

    return { travelSupport, hasAccess, isOrganizer }
  } catch (error) {
    return {
      travelSupport: null,
      hasAccess: false,
      isOrganizer: false,
      error: error as Error,
    }
  }
}

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

  if (process.env.NODE_ENV === 'development') {
    console.log(`[AUDIT ${severity.toUpperCase()}]:`, logEntry)
    return
  }

  // TODO: Replace with your production logging service

  try {
    console.log(
      JSON.stringify({
        type: 'audit_log',
        ...logEntry,
      }),
    )
  } catch (error) {
    console.error(
      'Failed to write audit log:',
      error,
      'Original log entry:',
      logEntry,
    )
  }
}

export async function authorizeTravelSupportOperation(
  travelSupportId: string,
  speaker: TravelSupportAuthSpeaker,
  operation: 'read' | 'modify' | 'submit' | 'approve',
): Promise<{
  authorized: boolean
  travelSupport?: TravelSupportWithSpeaker & { expenses: TravelExpense[] }
  error?: TRPCError
}> {
  try {
    const { travelSupport, hasAccess, isOrganizer, error } =
      await verifyTravelSupportOwnership(travelSupportId, speaker)

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

    switch (operation) {
      case 'read':
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

        if (travelSupport.speaker._id === speaker._id) {
          return {
            authorized: false,
            error: createAuthError(
              'FORBIDDEN',
              'Admins cannot approve their own travel support requests',
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
