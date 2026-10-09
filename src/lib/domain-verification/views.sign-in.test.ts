/**
 * The organizer's per-host view of the workshop portal's sign-in (#1298):
 * `listDomainVerificationViews` with workshops on carries each claimed host's
 * standing, from the records as stored. Only the Sanity read is supplied; the
 * allowlist policy, the platform-controlled rule and the standing are real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { signInHost } from '../../../__tests__/helpers/workshopSignIn'
import type { RedirectUriSyncRow } from './types'

const rows: RedirectUriSyncRow[] = []
const listRedirectUriSyncRowsForConference = vi.fn(async () => rows)
const listDomainVerificationsForConference = vi.fn(async () =>
  rows.map((row) => row.record),
)

vi.mock('./sanity', () => ({
  listRedirectUriSyncRowsForConference: () =>
    listRedirectUriSyncRowsForConference(),
  listDomainVerificationsForConference: () =>
    listDomainVerificationsForConference(),
}))

const { listDomainVerificationViews } = await import('./sync')

const PLATFORM_ORG = 'org-platform'

function owned(row: RedirectUriSyncRow, orgId = PLATFORM_ORG) {
  return { ...row, conference: { organization: { _ref: orgId } } }
}

beforeEach(() => {
  rows.length = 0
  vi.clearAllMocks()
  vi.stubEnv('PLATFORM_ORG_ID', PLATFORM_ORG)
  vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.run')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

async function signInOf(hostname: string, domains: string[]) {
  const views = await listDomainVerificationViews('conference-1', domains, {
    workshops: true,
  })
  return views.find((view) => view.hostname === hostname)?.workshopSignIn
}

describe('listDomainVerificationViews — workshop sign-in per host', () => {
  it('is ready for a verified host WorkOS has registered', async () => {
    rows.push(owned(signInHost('conf.example.org')))
    await expect(
      signInOf('conf.example.org', ['conf.example.org']),
    ).resolves.toEqual({ state: 'ready' })
  })

  it('is pending for a platform-controlled host the sync has not registered yet', async () => {
    rows.push(
      owned(signInHost('conf.example.org', {}, { status: null, id: null })),
    )
    await expect(
      signInOf('conf.example.org', ['conf.example.org']),
    ).resolves.toEqual({ state: 'pending' })
  })

  it('is failed, with the error the sync recorded', async () => {
    rows.push(
      owned(
        signInHost(
          'conf.example.org',
          {},
          { status: null, id: null, error: 'WorkOS 422: redirect URI invalid' },
        ),
      ),
    )
    await expect(
      signInOf('conf.example.org', ['conf.example.org']),
    ).resolves.toEqual({
      state: 'failed',
      error: 'WorkOS 422: redirect URI invalid',
    })
  })

  it('is unverified for a claim whose proof has not resolved, and for a claim with no record', async () => {
    rows.push(
      owned(
        signInHost(
          'conf.example.org',
          { status: 'pending', lastSuccessAt: null },
          { status: null, id: null },
        ),
      ),
    )
    const domains = ['conf.example.org', 'new.example.org']
    await expect(signInOf('conf.example.org', domains)).resolves.toEqual({
      state: 'unverified',
    })
    await expect(signInOf('new.example.org', domains)).resolves.toEqual({
      state: 'unverified',
    })
  })

  it('is not offered on a verified custom domain of a tenant that is not the platform', async () => {
    rows.push(
      owned(
        signInHost('tenant.example.org', {}, { status: null, id: null }),
        'org-tenant',
      ),
    )
    await expect(
      signInOf('tenant.example.org', ['tenant.example.org']),
    ).resolves.toEqual({ state: 'not-offered' })
  })

  it('is pending, not "not offered", for a platform-allocated host of any tenant', async () => {
    rows.push(
      owned(
        signInHost(
          'tenant.konf.run',
          { method: 'platform-owned' },
          { status: null, id: null },
        ),
        'org-tenant',
      ),
    )
    await expect(
      signInOf('tenant.konf.run', ['tenant.konf.run']),
    ).resolves.toEqual({ state: 'pending' })
  })

  it('shows nothing for a local dev entry or a wildcard, which can never sign in', async () => {
    const domains = ['localhost:3000', '*.example.org']
    await expect(signInOf('localhost:3000', domains)).resolves.toBeNull()
    await expect(signInOf('*.example.org', domains)).resolves.toBeNull()
  })
})

describe('listDomainVerificationViews — workshops off', () => {
  it('shows no sign-in state and reads no redirect-URI fields', async () => {
    rows.push(owned(signInHost('conf.example.org')))
    const [view] = await listDomainVerificationViews('conference-1', [
      'conf.example.org',
    ])

    expect(view.workshopSignIn).toBeNull()
    expect(view.status).toBe('verified')
    expect(listRedirectUriSyncRowsForConference).not.toHaveBeenCalled()
  })
})
