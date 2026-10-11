import type { DomainVerificationRecord } from '@/lib/domain-verification/types'

/** A public host with DNS proof that the real policy accepts (proven yesterday). */
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
