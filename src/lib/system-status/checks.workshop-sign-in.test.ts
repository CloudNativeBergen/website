/**
 * System status: where each claimed host stands for the workshop portal's
 * sign-in (#1298), for a conference with workshops. The feature gate and the
 * Sanity reads are supplied; the standing and its wording are real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { signInHost } from '../../../__tests__/helpers/workshopSignIn'
import type { RedirectUriSyncRow } from '@/lib/domain-verification/types'
import type { SystemCheck } from './types'

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: vi.fn(async () => 0) },
}))

const workshopsEnabled = vi.fn(async () => true)
vi.mock('@/lib/features/workshops', () => ({
  isWorkshopsEnabledForConference: () => workshopsEnabled(),
}))

const rows: RedirectUriSyncRow[] = []
vi.mock('@/lib/domain-verification/sanity', () => ({
  listRedirectUriSyncRowsForConference: vi.fn(async () => rows),
  listDomainVerificationsForConference: vi.fn(async () =>
    rows.map((row) => row.record),
  ),
}))

import { buildSystemChecks } from './checks'

const PLATFORM_ORG = 'org-platform'

const CONFERENCE = {
  _id: 'conf-1',
  organization: { _ref: PLATFORM_ORG },
  domains: [
    'ready.example.org',
    'pending.example.org',
    'failed.example.org',
    'unclaimed-record.example.org',
  ],
}

function signInChecks(checks: SystemCheck[]): SystemCheck[] {
  return checks.filter((check) => check.id.startsWith('auth.workshopSignIn'))
}

function owned(row: RedirectUriSyncRow): RedirectUriSyncRow {
  return { ...row, conference: { organization: { _ref: PLATFORM_ORG } } }
}

beforeEach(() => {
  rows.length = 0
  rows.push(
    owned(signInHost('ready.example.org')),
    owned(signInHost('pending.example.org', {}, { status: null, id: null })),
    owned(
      signInHost(
        'failed.example.org',
        {},
        { status: null, id: null, error: 'WorkOS 422: invalid redirect URI' },
      ),
    ),
  )
  workshopsEnabled.mockResolvedValue(true)
  vi.stubEnv('PLATFORM_ORG_ID', PLATFORM_ORG)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('buildSystemChecks — workshop sign-in per host', () => {
  it('reports each claimed host with its reason', async () => {
    const checks = signInChecks(await buildSystemChecks(CONFERENCE))

    expect(
      checks.map(({ id, group, status, value }) => ({
        id,
        group,
        status,
        value,
      })),
    ).toEqual([
      {
        id: 'auth.workshopSignIn.ready.example.org',
        group: 'auth',
        status: 'ok',
        value: 'available',
      },
      {
        id: 'auth.workshopSignIn.pending.example.org',
        group: 'auth',
        status: 'warn',
        value: 'registration pending',
      },
      {
        id: 'auth.workshopSignIn.failed.example.org',
        group: 'auth',
        status: 'error',
        value: 'registration failed',
      },
      {
        id: 'auth.workshopSignIn.unclaimed-record.example.org',
        group: 'auth',
        status: 'warn',
        value: 'domain not verified',
      },
    ])
  })

  it('carries the recorded error in the failed host’s detail', async () => {
    const failed = signInChecks(await buildSystemChecks(CONFERENCE)).find(
      (check) => check.id === 'auth.workshopSignIn.failed.example.org',
    )
    expect(failed?.detail).toContain('WorkOS 422: invalid redirect URI')
  })

  it('reports nothing for a conference without workshops', async () => {
    workshopsEnabled.mockResolvedValue(false)
    expect(signInChecks(await buildSystemChecks(CONFERENCE))).toEqual([])
  })

  it('warns, without throwing, when the hosts cannot be read', async () => {
    const { listRedirectUriSyncRowsForConference } =
      await import('@/lib/domain-verification/sanity')
    vi.mocked(listRedirectUriSyncRowsForConference).mockRejectedValueOnce(
      new Error('sanity unavailable'),
    )
    const checks = signInChecks(await buildSystemChecks(CONFERENCE))
    expect(checks).toEqual([
      expect.objectContaining({
        id: 'auth.workshopSignIn',
        status: 'warn',
        value: 'unknown',
      }),
    ])
  })
})
