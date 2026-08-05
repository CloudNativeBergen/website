/**
 * @vitest-environment node
 *
 * The TICKETING feature gate. Two boundaries carry its inputs and both are real
 * env/document reads, not network:
 *
 *  - `@/lib/organization/sanity` — the cached org document (plan + overrides).
 *  - `TENANT_SECRETS_JSON` — the per-org secret store, read through the REAL
 *    `perOrgSecretsStore` so the gate and `resolveTicketingCredentials` cannot
 *    disagree about what "has credentials" means.
 *
 * The `@/lib/sanity/client` mock is a TRIPWIRE: platform standing is a pure id
 * comparison and must read nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Organization } from '@/lib/organization/types'

const getOrganizationById = vi.fn()

vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: (...args: unknown[]) => getOrganizationById(...args),
  getOrganizationRefForCurrentConference: () => null,
}))

const h = vi.hoisted(() => ({
  fetch: vi.fn<(query: string, params?: unknown) => Promise<unknown>>(),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
}))

import {
  isTicketingEnabledForOrg,
  isTicketingEnabledForConference,
} from './ticketing'

const PLATFORM_ORG_ID = 'org-platform'

function org(overrides: Partial<Organization> = {}): Organization {
  return { _id: 'org-A', name: 'Tenant A', slug: 'tenant-a', ...overrides }
}

/** A tenant with its OWN Checkin account in the per-org secret store. */
function stubOwnTicketingSecret(orgId: string) {
  vi.stubEnv(
    'TENANT_SECRETS_JSON',
    JSON.stringify({ [orgId]: { ticketing: { apiKey: 'tenant-key' } } }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PLATFORM_ORG_ID', PLATFORM_ORG_ID)
  vi.stubEnv('TENANT_SECRETS_JSON', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isTicketingEnabledForOrg — fail closed', () => {
  it('is DISABLED and reads nothing when the org cannot be resolved', async () => {
    await expect(isTicketingEnabledForOrg(null)).resolves.toBe(false)
    await expect(isTicketingEnabledForOrg(undefined)).resolves.toBe(false)
    await expect(isTicketingEnabledForOrg('')).resolves.toBe(false)
    expect(getOrganizationById).not.toHaveBeenCalled()
  })

  it('is DISABLED for an unknown organization document', async () => {
    getOrganizationById.mockResolvedValue(null)
    await expect(isTicketingEnabledForOrg('org-missing')).resolves.toBe(false)
  })

  it('is DISABLED — not thrown — when the organization read REJECTS', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    getOrganizationById.mockRejectedValue(new Error('sanity unavailable'))
    await expect(isTicketingEnabledForOrg('org-A')).resolves.toBe(false)
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })

  /** THE DEMO-ORG CASE: a brand-new tenant, any plan, no credentials. */
  it('is DISABLED for an ordinary tenant with no credentials, on every plan', async () => {
    for (const plan of ['community', 'pro', 'enterprise'] as const) {
      getOrganizationById.mockResolvedValue(org({ plan }))
      await expect(isTicketingEnabledForOrg('org-A')).resolves.toBe(false)
    }
  })
})

describe('isTicketingEnabledForOrg — grants', () => {
  it('is ENABLED for the platform org (it owns the env provider account)', async () => {
    getOrganizationById.mockResolvedValue(org({ _id: PLATFORM_ORG_ID }))
    await expect(isTicketingEnabledForOrg(PLATFORM_ORG_ID)).resolves.toBe(true)
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it('is ENABLED by an explicit override grant, regardless of plan', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        plan: 'community',
        featureOverrides: [{ feature: 'ticketing', enabled: true }],
      }),
    )
    await expect(isTicketingEnabledForOrg('org-A')).resolves.toBe(true)
  })

  /**
   * THE NEVER-HIDE-WHAT-WORKS RULE: an org the secret seam can serve has a
   * working integration, so the gate must not be stricter than
   * `resolveTicketingCredentials`.
   */
  it('is ENABLED for a tenant with its OWN per-org ticketing credentials', async () => {
    stubOwnTicketingSecret('org-A')
    getOrganizationById.mockResolvedValue(org({ plan: 'community' }))
    await expect(isTicketingEnabledForOrg('org-A')).resolves.toBe(true)
  })

  it('does not lend one tenant’s credentials to another', async () => {
    stubOwnTicketingSecret('org-B')
    getOrganizationById.mockResolvedValue(org())
    await expect(isTicketingEnabledForOrg('org-A')).resolves.toBe(false)
  })

  it('lets an explicit DENY revoke it from the platform org AND from a credentialed tenant', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        _id: PLATFORM_ORG_ID,
        featureOverrides: [{ feature: 'ticketing', enabled: false }],
      }),
    )
    await expect(isTicketingEnabledForOrg(PLATFORM_ORG_ID)).resolves.toBe(false)

    stubOwnTicketingSecret('org-A')
    getOrganizationById.mockResolvedValue(
      org({ featureOverrides: [{ feature: 'ticketing', enabled: false }] }),
    )
    await expect(isTicketingEnabledForOrg('org-A')).resolves.toBe(false)
  })

  it('ignores a malformed per-org secret entry (never a silent grant)', async () => {
    vi.stubEnv('TENANT_SECRETS_JSON', '{not json')
    getOrganizationById.mockResolvedValue(org())
    await expect(isTicketingEnabledForOrg('org-A')).resolves.toBe(false)
  })
})

describe('isTicketingEnabledForConference', () => {
  it('keys on the conference OWNER, not the request host', async () => {
    getOrganizationById.mockResolvedValue(org({ _id: PLATFORM_ORG_ID }))
    await expect(
      isTicketingEnabledForConference({
        organization: { _ref: PLATFORM_ORG_ID, _type: 'reference' },
      }),
    ).resolves.toBe(true)
    expect(getOrganizationById).toHaveBeenCalledWith(PLATFORM_ORG_ID)
  })

  it('is DISABLED for a conference with no organization (fail closed)', async () => {
    await expect(isTicketingEnabledForConference({})).resolves.toBe(false)
    await expect(isTicketingEnabledForConference(null)).resolves.toBe(false)
    expect(getOrganizationById).not.toHaveBeenCalled()
  })
})
