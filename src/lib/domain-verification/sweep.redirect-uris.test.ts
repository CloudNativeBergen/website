import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  FAKE_WORKOS_API_KEY,
  installFakeWorkOSRedirectUris,
  type FakeWorkOSRedirectUris,
} from '../../../__tests__/helpers/fakeWorkOSRedirectUris'
import type {
  DomainCheckOutcome,
  DomainVerificationPatch,
  RedirectUriState,
  RedirectUriSyncRow,
} from './types'

/**
 * The daily sweep and the WorkOS redirect URIs (#1297): the reconcile runs
 * AFTER the re-checks, on what they wrote, and cannot stop the sweep. Real
 * policy, real host rule, real client; DNS, Sanity and WorkOS are the fakes.
 */

const HOST = '2026.cloudnativedays.no'
const ID = `domainVerification.${HOST}`
const NOW = new Date('2026-10-09T05:00:00.000Z')

let row: RedirectUriSyncRow
let dnsAnswer: DomainCheckOutcome

vi.mock('./dns', () => ({
  checkDomainChallenge: async () => dnsAnswer,
}))

vi.mock('./sanity', () => ({
  listAllDomainVerifications: async () => [structuredClone(row.record)],
  patchDomainVerification: async (
    _id: string,
    patch: DomainVerificationPatch,
  ) => {
    row.record = { ...row.record, ...patch }
    row.rev += '+'
  },
  getConferenceAlertTargets: async () => [],
  listRedirectUriSyncRows: async () => [structuredClone(row)],
  patchRedirectUriState: async (
    _id: string,
    ifRevisionId: string,
    patch: Partial<RedirectUriState>,
  ) => {
    if (row.rev !== ifRevisionId) throw new Error('revision mismatch')
    row.redirectUri = { ...row.redirectUri, ...patch }
    row.rev += '+'
    return row.rev
  },
}))

vi.mock('@/lib/notification/sanity', () => ({
  createNotifications: async () => 0,
}))

vi.mock('@/lib/features/workshops', () => ({
  resolveWorkshopsForConference: async () => true,
}))

vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: async (orgId: string) => ({ _id: orgId }),
}))

const { runDomainVerificationSweep } = await import('./sweep')

let workos: FakeWorkOSRedirectUris

beforeEach(() => {
  dnsAnswer = { kind: 'verified' }
  row = {
    record: {
      _id: ID,
      hostname: HOST,
      conferenceId: 'conference-1',
      token: 'tok',
      status: 'verified',
      method: 'dns-txt',
      graceUntil: null,
      verifiedAt: '2026-09-01T00:00:00.000Z',
      lastSuccessAt: '2026-10-08T05:00:00.000Z',
      lastCheckedAt: '2026-10-08T05:00:00.000Z',
      firstFailureAt: null,
      consecutiveFailures: 0,
      consecutiveSoftFailures: 0,
      lastError: null,
    },
    rev: 'rev-1',
    redirectUri: { status: null, id: null, error: null },
    conference: { organization: { _ref: 'org-platform' } },
  }
  vi.stubEnv('WORKOS_API_KEY', FAKE_WORKOS_API_KEY)
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('PLATFORM_ORG_ID', 'org-platform')
  workos = installFakeWorkOSRedirectUris()
  workos.now = () => NOW
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('runDomainVerificationSweep and the WorkOS redirect URIs', () => {
  it('registers a verified host and reports it', async () => {
    const summary = await runDomainVerificationSweep(NOW)

    expect(workos.uris.map((u) => u.uri)).toEqual([
      `https://${HOST}/api/auth/callback`,
    ])
    expect(summary.redirectUris.registered).toEqual([HOST])
  })

  it('removes the URI of a host in the same sweep that delists it', async () => {
    await runDomainVerificationSweep(NOW)
    expect(workos.uris).toHaveLength(1)
    dnsAnswer = { kind: 'hard-failure', reason: 'The TXT record is gone.' }

    const summary = await runDomainVerificationSweep(NOW)

    expect(summary.delisted).toEqual([HOST])
    expect(workos.uris).toEqual([])
    expect(summary.redirectUris.removed).toEqual([HOST])
  })

  it('retries a registration an earlier run could not make', async () => {
    workos.failNext('POST', { status: 500 })
    const first = await runDomainVerificationSweep(NOW)
    expect(first.redirectUris.errored).toEqual([HOST])
    expect(workos.uris).toEqual([])

    const second = await runDomainVerificationSweep(NOW)

    expect(second.redirectUris.registered).toEqual([HOST])
  })

  it('completes the re-checks and reports the failure when WorkOS is unreachable', async () => {
    workos.failAll('GET', 'network')

    const summary = await runDomainVerificationSweep(NOW)

    expect(summary.checked).toBe(1)
    expect(summary.verified).toBe(1)
    expect(summary.errored).toEqual([])
    expect(summary.redirectUris.error).toContain('no answer from WorkOS')
  })
})
