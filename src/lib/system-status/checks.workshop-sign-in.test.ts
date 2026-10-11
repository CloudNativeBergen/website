/**
 * System status: where each claimed host stands for the workshop portal's
 * sign-in, for a conference with workshops. The feature gate and the Sanity
 * reads are supplied; the standing and its wording are real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { verifiedHost } from '../../../__tests__/helpers/domainClaims'
import type { DomainVerificationRecord } from '@/lib/domain-verification/types'
import type { SystemCheck } from './types'

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: vi.fn(async () => 0) },
}))

const workshopsEnabled = vi.fn(async () => true)
vi.mock('@/lib/features/workshops', () => ({
  isWorkshopsEnabledForConference: () => workshopsEnabled(),
}))

const records: DomainVerificationRecord[] = []
vi.mock('@/lib/domain-verification/sanity', () => ({
  listDomainVerificationsForConference: vi.fn(async () => records),
}))

import { buildSystemChecks } from './checks'
import { workshopSignInLabel } from '@/lib/domain-verification/sign-in-labels'

const CONFERENCE = {
  _id: 'conference-1',
  organization: { _ref: 'org-tenant' },
  domains: [
    'ready.example.org',
    'allocated.konf.run',
    'grace.example.org',
    'failed.example.org',
    'missing-record.example.org',
    // Real production data carries these; they never sign in, so no row.
    'localhost:3000',
    '*.example.org',
  ],
}

function signInChecks(checks: SystemCheck[]): SystemCheck[] {
  return checks.filter((check) => check.id.startsWith('auth.workshopSignIn'))
}

beforeEach(() => {
  vi.clearAllMocks()
  records.length = 0
  records.push(
    verifiedHost('ready.example.org'),
    verifiedHost('allocated.konf.run', {
      method: 'platform-owned',
      lastSuccessAt: null,
    }),
    verifiedHost('grace.example.org', {
      method: 'grandfathered',
      graceUntil: new Date(Date.now() + 86_400_000).toISOString(),
    }),
    verifiedHost('failed.example.org', {
      status: 'failing',
      lastError: 'TXT record no longer matches',
    }),
  )
  workshopsEnabled.mockResolvedValue(true)
  vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.run')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('buildSystemChecks — workshop sign-in per host', () => {
  it('reports proven DNS and allocated hosts as available, and every unproven host as not verified', async () => {
    const checks = signInChecks(await buildSystemChecks(CONFERENCE))

    expect(
      checks.map(({ id, group, label, status, value }) => ({
        id,
        group,
        label,
        status,
        value,
      })),
    ).toEqual([
      {
        id: 'auth.workshopSignIn.ready.example.org',
        group: 'auth',
        label: 'Workshop sign-in: ready.example.org',
        status: 'ok',
        value: 'available',
      },
      {
        id: 'auth.workshopSignIn.allocated.konf.run',
        group: 'auth',
        label: 'Workshop sign-in: allocated.konf.run',
        status: 'ok',
        value: 'available',
      },
      {
        id: 'auth.workshopSignIn.grace.example.org',
        group: 'auth',
        label: 'Workshop sign-in: grace.example.org',
        status: 'warn',
        value: 'domain not verified',
      },
      {
        id: 'auth.workshopSignIn.failed.example.org',
        group: 'auth',
        label: 'Workshop sign-in: failed.example.org',
        status: 'warn',
        value: 'domain not verified',
      },
      {
        id: 'auth.workshopSignIn.missing-record.example.org',
        group: 'auth',
        label: 'Workshop sign-in: missing-record.example.org',
        status: 'warn',
        value: 'domain not verified',
      },
    ])
  })

  it('reports a proven host as switched off while WORKSHOP_AUTH_ORIGIN cannot be used', async () => {
    vi.stubEnv('WORKSHOP_AUTH_ORIGIN', 'https://auth.example.org/path')

    const checks = signInChecks(await buildSystemChecks(CONFERENCE))

    expect(
      checks.find(({ id }) => id === 'auth.workshopSignIn.ready.example.org'),
    ).toEqual({
      id: 'auth.workshopSignIn.ready.example.org',
      group: 'auth',
      label: 'Workshop sign-in: ready.example.org',
      status: 'error',
      value: 'switched off on every host',
      detail: workshopSignInLabel({ state: 'blocked', by: 'origin-unusable' })
        .detail,
    })
  })

  it('reports a new domain without a proof as not verified for any owner', async () => {
    const checks = signInChecks(
      await buildSystemChecks({
        _id: 'conf-2',
        organization: { _ref: 'org-other-tenant' },
        domains: ['new.tenant.example.org'],
      }),
    )
    // The whole row: where it shows, what it is called and what it advises.
    expect(checks).toEqual([
      {
        id: 'auth.workshopSignIn.new.tenant.example.org',
        group: 'auth',
        label: 'Workshop sign-in: new.tenant.example.org',
        status: 'warn',
        value: 'domain not verified',
        detail: workshopSignInLabel({ state: 'unverified' }).detail,
      },
    ])
  })

  it('reports nothing, and reads no host, for a conference without workshops', async () => {
    workshopsEnabled.mockResolvedValue(false)
    const sanity = await import('@/lib/domain-verification/sanity')
    // Even a failing read must not put a row in front of a tenant that has
    // no workshops: it must not be made at all.
    vi.mocked(
      sanity.listDomainVerificationsForConference,
    ).mockRejectedValueOnce(new Error('sanity unavailable'))

    expect(signInChecks(await buildSystemChecks(CONFERENCE))).toEqual([])
    expect(sanity.listDomainVerificationsForConference).not.toHaveBeenCalled()
  })

  it('warns, without throwing, when the hosts cannot be read', async () => {
    const { listDomainVerificationsForConference } =
      await import('@/lib/domain-verification/sanity')
    vi.mocked(listDomainVerificationsForConference).mockRejectedValueOnce(
      new Error('sanity unavailable'),
    )
    const checks = signInChecks(await buildSystemChecks(CONFERENCE))
    expect(checks).toEqual([
      expect.objectContaining({
        id: 'auth.workshopSignIn',
        status: 'warn',
        value: 'unknown',
        detail: expect.stringContaining('sanity unavailable'),
      }),
    ])
  })
})
