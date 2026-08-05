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
  isTicketingDeniedForOrg,
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

  /** THE DEMO-ORG CASE: a brand-new tenant on the free plan, no credentials. */
  it('is DISABLED for a community tenant that has neither bought it nor got credentials', async () => {
    getOrganizationById.mockResolvedValue(org({ plan: 'community' }))
    await expect(isTicketingEnabledForOrg('org-A')).resolves.toBe(false)
  })
})

/**
 * THE TIER (owner decision, 2026-08-06). Ticketing is sold at the entry PAID
 * tier — `readiness: 'ga'` + `minPlan: 'pro'` — because the tenant brings its
 * own Checkin/Tito account, so the integration costs the platform nothing per
 * tenant. The free community tier does not include it.
 */
describe('isTicketingEnabledForOrg — the entry paid tier buys it', () => {
  it('is DISABLED on the free community plan', async () => {
    getOrganizationById.mockResolvedValue(org({ plan: 'community' }))
    await expect(isTicketingEnabledForOrg('org-A')).resolves.toBe(false)
  })

  it('is DISABLED for an org with no plan at all (absent → community)', async () => {
    getOrganizationById.mockResolvedValue(org())
    await expect(isTicketingEnabledForOrg('org-A')).resolves.toBe(false)
  })

  it('is ENABLED on the entry paid plan, with nothing else configured', async () => {
    getOrganizationById.mockResolvedValue(org({ plan: 'pro' }))
    await expect(isTicketingEnabledForOrg('org-A')).resolves.toBe(true)
  })

  it('is ENABLED on every plan ABOVE the entry paid one', async () => {
    getOrganizationById.mockResolvedValue(org({ plan: 'enterprise' }))
    await expect(isTicketingEnabledForOrg('org-A')).resolves.toBe(true)
  })

  /** The plan sells it; an operator can still take it away. */
  it('is DISABLED on a paid plan when an operator denies it', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        plan: 'pro',
        featureOverrides: [{ feature: 'ticketing', enabled: false }],
      }),
    )
    await expect(isTicketingEnabledForOrg('org-A')).resolves.toBe(false)
  })

  /**
   * THE PLATFORM ORG IS A TENANT TOO and its own document may carry any plan
   * (this deployment's carries none). The tier decision must not touch it.
   */
  it('is ENABLED for the platform org on EVERY plan, including the free one', async () => {
    for (const plan of ['community', 'pro', 'enterprise'] as const) {
      getOrganizationById.mockResolvedValue(org({ _id: PLATFORM_ORG_ID, plan }))
      await expect(isTicketingEnabledForOrg(PLATFORM_ORG_ID)).resolves.toBe(
        true,
      )
    }
    getOrganizationById.mockResolvedValue(org({ _id: PLATFORM_ORG_ID }))
    await expect(isTicketingEnabledForOrg(PLATFORM_ORG_ID)).resolves.toBe(true)
  })
})

/**
 * THE KILL SWITCH (owner decision, 2026-08-06). `isTicketingDeniedForOrg` is
 * deliberately NARROW: only an operator's own `enabled: false` counts. Widen it
 * to "not enabled" and a transient Sanity failure would blank a working
 * ticketing page — the hazard #828's provider-first order exists to prevent.
 */
describe('isTicketingDeniedForOrg', () => {
  it('is TRUE for an active explicit deny — even with own credentials', async () => {
    stubOwnTicketingSecret('org-A')
    getOrganizationById.mockResolvedValue(
      org({ featureOverrides: [{ feature: 'ticketing', enabled: false }] }),
    )
    await expect(isTicketingDeniedForOrg('org-A')).resolves.toBe(true)
  })

  it('is TRUE for the platform org when an operator denies it', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        _id: PLATFORM_ORG_ID,
        featureOverrides: [{ feature: 'ticketing', enabled: false }],
      }),
    )
    await expect(isTicketingDeniedForOrg(PLATFORM_ORG_ID)).resolves.toBe(true)
  })

  it('is FALSE for an EXPIRED deny (the override is ignored entirely)', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        featureOverrides: [
          {
            feature: 'ticketing',
            enabled: false,
            expiresAt: '2020-01-01T00:00:00.000Z',
          },
        ],
      }),
    )
    await expect(isTicketingDeniedForOrg('org-A')).resolves.toBe(false)
  })

  it('is FALSE for a deny aimed at a DIFFERENT feature', async () => {
    getOrganizationById.mockResolvedValue(
      org({ featureOverrides: [{ feature: 'badges', enabled: false }] }),
    )
    await expect(isTicketingDeniedForOrg('org-A')).resolves.toBe(false)
  })

  it('is FALSE for an org that simply never had ticketing', async () => {
    getOrganizationById.mockResolvedValue(org({ plan: 'community' }))
    await expect(isTicketingDeniedForOrg('org-A')).resolves.toBe(false)
  })

  /**
   * NOT-A-DENY, three ways. A deny is an operator DECISION; an unresolvable
   * tenant is an accident, and must not be able to kill a page.
   */
  it('is FALSE for a nullish org id, an unknown document and a REJECTED read', async () => {
    await expect(isTicketingDeniedForOrg(null)).resolves.toBe(false)
    await expect(isTicketingDeniedForOrg(undefined)).resolves.toBe(false)
    await expect(isTicketingDeniedForOrg('')).resolves.toBe(false)
    expect(getOrganizationById).not.toHaveBeenCalled()

    getOrganizationById.mockResolvedValue(null)
    await expect(isTicketingDeniedForOrg('org-missing')).resolves.toBe(false)

    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    getOrganizationById.mockRejectedValue(new Error('sanity unavailable'))
    await expect(isTicketingDeniedForOrg('org-A')).resolves.toBe(false)
    logged.mockRestore()
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
