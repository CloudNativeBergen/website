/** Re-checking a tenant's claimed host returns the updated proof. */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DomainVerificationRecord } from '@/lib/domain-verification/types'

const HOST = '2026.cloudnativedays.no'

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: async () => [HOST] },
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => ({
    conference: { _id: 'conference-1', organization: { _ref: 'org-A' } },
    error: null,
  }),
}))

let record: DomainVerificationRecord | null
/** What the re-check finds; the record comes back with it written in. */
let found: Partial<DomainVerificationRecord>
const recheckDomainRecord = vi.fn(
  async (current: DomainVerificationRecord) => ({
    record: { ...current, ...found },
    outcome: { kind: 'verified' as const },
    delisted: false,
  }),
)
vi.mock('@/lib/domain-verification', () => ({
  getDomainVerification: async () => record,
  recheckDomainRecord: (current: DomainVerificationRecord) =>
    recheckDomainRecord(current),
  toDomainVerificationView: (
    hostname: string,
    current: DomainVerificationRecord,
  ) => ({ hostname, status: current.status, method: current.method }),
  listDomainVerificationViews: vi.fn(),
  syncDomainVerifications: vi.fn(),
}))

import { domainVerificationRouter } from './domainVerification'
import type { Context } from '../trpc'

function caller() {
  const speaker = { _id: 'admin-1', organizerOrgIds: ['org-A'] }
  const session = { speaker, user: { email: 'admin@x.test' } }
  return domainVerificationRouter.createCaller({
    session,
    speaker,
    user: session.user,
  } as unknown as Context)
}

beforeEach(() => {
  vi.clearAllMocks()
  // The proof resolves: the host goes from unproven to on the allowlist.
  found = { status: 'verified', lastSuccessAt: new Date().toISOString() }
  record = {
    _id: `domainVerification.${HOST}`,
    hostname: HOST,
    conferenceId: 'conference-1',
    token: 'tok',
    status: 'pending',
    method: 'dns-txt',
    graceUntil: null,
    verifiedAt: null,
    lastSuccessAt: null,
    lastCheckedAt: null,
    firstFailureAt: null,
    consecutiveFailures: 0,
    consecutiveSoftFailures: 0,
    lastError: null,
  }
})

describe('domainVerification.recheck', () => {
  it('returns the updated verification value for the tenant’s host', async () => {
    await expect(caller().recheck({ hostname: HOST })).resolves.toEqual({
      domain: { hostname: HOST, status: 'verified', method: 'dns-txt' },
    })
    expect(recheckDomainRecord).toHaveBeenCalledTimes(1)
  })

  it('refuses another conference’s record before rechecking it', async () => {
    record = { ...record!, conferenceId: 'conference-2' }
    await expect(caller().recheck({ hostname: HOST })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(recheckDomainRecord).not.toHaveBeenCalled()
  })
})
