import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  FAKE_WORKOS_API_KEY,
  installFakeWorkOSRedirectUris,
  type FakeWorkOSRedirectUris,
} from '../../../__tests__/helpers/fakeWorkOSRedirectUris'
import type { RedirectUriState, RedirectUriSyncRow } from './types'

/**
 * A domain mutation and the WorkOS redirect URIs (#1297): the mutation never
 * waits on WorkOS and cannot be failed by it. The reconcile itself is covered
 * in `@/lib/workshop/redirect-uris/reconcile.test.ts`; this pins the hand-off.
 */

const HOST = 'kontainerkonf.konf.run'
const ID = `domainVerification.${HOST}`

let row: RedirectUriSyncRow
/** What the record store reports it did for a claim / a release. */
let claimWrites = false
let releaseWrites = false

vi.mock('./sanity', () => ({
  ensureDomainVerification: async () => claimWrites,
  revokeDomainVerification: async () => releaseWrites,
  getDomainVerification: async () => null,
  listDomainVerificationsForConference: async () => [],
  listRedirectUriSyncRows: async () => [structuredClone(row)],
  patchRedirectUriState: async (
    _id: string,
    _rev: string,
    patch: Partial<RedirectUriState>,
  ) => {
    row.redirectUri = { ...row.redirectUri, ...patch }
    return row.rev
  },
}))

vi.mock('@/lib/features/workshops', () => ({
  resolveWorkshopsForConference: async () => true,
}))

vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: async (orgId: string) => ({ _id: orgId }),
}))

/** Work handed to `runAfterResponse`, held until the test runs it. */
const afterResponse: (() => Promise<void>)[] = []
vi.mock('@/server/runAfterResponse', () => ({
  runAfterResponse: (task: () => Promise<void>) => {
    afterResponse.push(task)
  },
}))

const { syncDomainVerifications } = await import('./sync')

let workos: FakeWorkOSRedirectUris

beforeEach(() => {
  afterResponse.length = 0
  claimWrites = false
  releaseWrites = false
  row = {
    record: {
      _id: ID,
      hostname: HOST,
      conferenceId: 'conference-1',
      token: 'tok',
      status: 'verified',
      method: 'platform-owned',
      graceUntil: null,
      verifiedAt: null,
      lastSuccessAt: null,
      lastCheckedAt: null,
      firstFailureAt: null,
      consecutiveFailures: 0,
      consecutiveSoftFailures: 0,
      lastError: null,
    },
    rev: 'rev-1',
    redirectUri: { status: null, id: null, error: null },
    conference: { organization: { _ref: 'org-tenant' } },
  }
  vi.stubEnv('WORKOS_API_KEY', FAKE_WORKOS_API_KEY)
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.run')
  workos = installFakeWorkOSRedirectUris()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(async () => {
  // A queued reconcile that never starts would swallow the next test's.
  for (const task of afterResponse) await task()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('syncDomainVerifications and the WorkOS redirect URIs', () => {
  it('registers a newly allocated host after the response, not before', async () => {
    claimWrites = true

    await syncDomainVerifications('conference-1', [HOST], [], {
      allocatePlatformHosts: true,
    })

    expect(workos.requests).toEqual([])
    expect(afterResponse).toHaveLength(1)

    await afterResponse[0]()

    expect(workos.uris.map((u) => u.uri)).toEqual([
      `https://${HOST}/api/auth/callback`,
    ])
  })

  it('removes the URI of a released host after the response', async () => {
    const registered = workos.seed(`https://${HOST}/api/auth/callback`)
    row.redirectUri = {
      ...row.redirectUri,
      status: 'registered',
      id: registered.id,
    }
    row.record.status = 'revoked'
    releaseWrites = true

    await syncDomainVerifications('conference-1', [], [HOST])
    await afterResponse[0]()

    expect(workos.uris).toEqual([])
  })

  it('does not reconcile when no record was written', async () => {
    await syncDomainVerifications('conference-1', [HOST], ['gone.example.org'])

    expect(afterResponse).toEqual([])
    expect(workos.requests).toEqual([])
  })

  it('completes, and so does the deferred work, when WorkOS is unreachable', async () => {
    claimWrites = true
    workos.failAll('GET', 'network')

    await expect(
      syncDomainVerifications('conference-1', [HOST]),
    ).resolves.toBeUndefined()
    await expect(afterResponse[0]()).resolves.toBeUndefined()

    expect(workos.requests).toHaveLength(1)
    expect(row.redirectUri.error).toContain('no answer from WorkOS')
  })

  it('queues one reconcile for a mutation that writes twice', async () => {
    claimWrites = true

    await syncDomainVerifications('conference-1', ['first.example.org'])
    await syncDomainVerifications('conference-1', [HOST], [], {
      allocatePlatformHosts: true,
    })

    expect(afterResponse).toHaveLength(1)

    await afterResponse[0]()
    await syncDomainVerifications('conference-1', [HOST])

    expect(afterResponse).toHaveLength(2)
  })
})
