import type { DomainVerificationRecord } from '@/lib/domain-verification/types'

/**
 * Fixtures for the workshop portal's WorkOS sign-in (#1296).
 *
 * `verifiedHost` is a `domainVerification` record the REAL allowlist policy
 * accepts whenever the test runs (proven yesterday), so a suite that supplies
 * it at the Sanity boundary (`listAllowlistCandidates`) is exercising
 * `isVerifiedRedirectOrigin` and `isAllowlistEligible` themselves.
 *
 * Hostnames must look public: the policy treats `.example`, `.test`,
 * `.localhost` and friends as dev-only and never allowlists them.
 */
export function verifiedHost(
  hostname: string,
  overrides: Partial<DomainVerificationRecord> = {},
): DomainVerificationRecord {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString()
  return {
    _id: `domainVerification.${hostname}`,
    hostname,
    conferenceId: 'conference-1',
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
