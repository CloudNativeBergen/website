/**
 * Where one host stands for workshop sign-in. Availability follows the same
 * proof rule as the central sign-in destination check.
 */

import { isProven } from './destination'
import type { DomainVerificationRecord } from './types'

export type WorkshopSignInStanding =
  { state: 'available' } | { state: 'unverified' }

export function workshopSignInStanding(
  record: DomainVerificationRecord | null,
  now: Date,
): WorkshopSignInStanding {
  return record && isProven(record, now)
    ? { state: 'available' }
    : { state: 'unverified' }
}
