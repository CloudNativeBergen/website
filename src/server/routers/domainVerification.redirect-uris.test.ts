/**
 * @vitest-environment node
 *
 * `domainVerification.recheck` and the WorkOS redirect URIs (#1297): a proof
 * that just resolved, or just stopped, changes whether the host may sign in to
 * the workshop portal, so a re-check that RAN queues a reconcile — and one that
 * was refused does not. The router and its tenancy checks run for real; the
 * boundaries are the Sanity client, the verification module and the queue.
 */
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
const recheckDomainRecord = vi.fn(
  async (current: DomainVerificationRecord) => ({
    record: { ...current, status: 'verified' as const },
    outcome: { kind: 'verified' as const },
    delisted: false,
  }),
)
vi.mock('@/lib/domain-verification', () => ({
  getDomainVerification: async () => record,
  recheckDomainRecord: (current: DomainVerificationRecord) =>
    recheckDomainRecord(current),
  toDomainVerificationView: (hostname: string) => ({ hostname }),
  listDomainVerificationViews: vi.fn(),
  syncDomainVerifications: vi.fn(),
}))

const scheduleRedirectUriReconcile = vi.fn()
vi.mock('@/lib/workshop/redirect-uris', () => ({
  scheduleRedirectUriReconcile: () => scheduleRedirectUriReconcile(),
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
  it('queues a redirect-URI reconcile after the re-check has written its result', async () => {
    await caller().recheck({ hostname: HOST })

    expect(recheckDomainRecord).toHaveBeenCalledTimes(1)
    expect(scheduleRedirectUriReconcile).toHaveBeenCalledTimes(1)
    expect(recheckDomainRecord.mock.invocationCallOrder[0]).toBeLessThan(
      scheduleRedirectUriReconcile.mock.invocationCallOrder[0],
    )
  })

  it('queues nothing for a re-check it refused', async () => {
    record = { ...record!, conferenceId: 'conference-2' }

    await expect(caller().recheck({ hostname: HOST })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(recheckDomainRecord).not.toHaveBeenCalled()
    expect(scheduleRedirectUriReconcile).not.toHaveBeenCalled()
  })
})
