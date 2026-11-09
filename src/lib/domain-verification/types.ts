/** Shared shapes for domain ownership verification (#683). */

import type { ConferenceTenant } from '@/lib/features/platform-default'
import type { ConferenceTicketingBinding } from '@/lib/tickets/provider'

export type {
  DomainCheckOutcome,
  DomainVerificationMethod,
  DomainVerificationPatch,
  DomainVerificationRecord,
  DomainVerificationStatus,
} from '../../../packages/tenancy/src/verification'
import type { DomainVerificationRecord } from '../../../packages/tenancy/src/verification'

/**
 * The conference that claims a host, as the destination check reads it WITH
 * the record: who it is, what it still claims, and the owner and ticketing
 * vendor a caller needs to decide a feature for it without a second read.
 */
export type ClaimingConference = ConferenceTenant &
  Pick<ConferenceTicketingBinding, 'ticketingProvider'> & {
    _id: string
    domains?: string[] | null
  }

/** One host's record and the conference it points at; `null` when that is gone. */
export interface DomainClaim {
  record: DomainVerificationRecord
  conference: ClaimingConference | null
}
