import type {
  DomainClaim,
  DomainVerificationRecord,
} from '@/lib/domain-verification/types'

/** The conference every {@link provenClaim} points at unless told otherwise. */
export const CLAIMING_CONFERENCE_ID = 'conference-1'

/**
 * A host as the destination check reads it (`getDomainClaim`), in a state the
 * REAL policy admits whenever the test runs: its DNS proof resolved yesterday
 * and its conference still claims it. Override the record, or the domains the
 * conference claims, to make it one that is refused.
 *
 * Hostnames must look public: the policy treats `.example`, `.test`,
 * `.localhost` and friends as dev-only and never admits them.
 */
export function provenClaim(
  hostname: string,
  record: Partial<DomainVerificationRecord> = {},
  conference: Partial<NonNullable<DomainClaim['conference']>> = {},
): DomainClaim {
  return {
    record: verifiedHost(hostname, record),
    conference: {
      _id: CLAIMING_CONFERENCE_ID,
      organization: { _ref: 'org-1' },
      ticketingProvider: 'tito',
      domains: [hostname],
      ...conference,
    },
  }
}

/** The record of {@link provenClaim} on its own: DNS proof that resolved yesterday. */
export function verifiedHost(
  hostname: string,
  overrides: Partial<DomainVerificationRecord> = {},
): DomainVerificationRecord {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString()
  return {
    _id: `domainVerification.${hostname}`,
    hostname,
    conferenceId: CLAIMING_CONFERENCE_ID,
    token: 'tok',
    status: 'verified',
    method: 'dns-txt',
    graceUntil: null,
    verifiedAt: yesterday,
    lastSuccessAt: yesterday,
    lastCheckedAt: yesterday,
    firstFailureAt: null,
    consecutiveFailures: 0,
    consecutiveSoftFailures: 0,
    lastError: null,
    ...overrides,
  }
}

/** A `getDomainClaim` stand-in that knows exactly these claims, by record id. */
export function claimsById(
  ...claims: DomainClaim[]
): (id: string) => Promise<DomainClaim | null> {
  return async (id) => claims.find((claim) => claim.record._id === id) ?? null
}
