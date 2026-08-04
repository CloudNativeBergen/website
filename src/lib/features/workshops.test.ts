/**
 * @vitest-environment node
 *
 * The workshop feature gate (#689) — the ONE resolver the portal, the admin
 * surfaces and (critically) the ticket-sold email all consult.
 *
 * TWO boundaries are mocked, and the distinction is the point (see
 * RunKonf/platform#36):
 *
 *  - `@/lib/organization/sanity` — the CACHED org document, carrying `plan` and
 *    `featureOverrides`. The real entitlement resolution runs on top of it.
 *  - `@/lib/sanity/client` — the UNCACHED read `getPlatformOrgId()` uses to turn
 *    `PLATFORM_ORG_SLUG` into an org id. The real `isPlatformOrganization` runs
 *    on top of THAT.
 *
 * Because the two are mocked independently, a test can make the cached document
 * disagree with the live slug→id resolution — which is exactly the production
 * situation this gate got wrong, and what pins it now.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Organization } from '@/lib/organization/types'

const getOrganizationById = vi.fn()
const getOrganizationRefForCurrentConference = vi.fn()

vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: (...args: unknown[]) => getOrganizationById(...args),
  getOrganizationRefForCurrentConference: () =>
    getOrganizationRefForCurrentConference(),
}))

const h = vi.hoisted(() => ({
  fetch: vi.fn<(query: string, params?: unknown) => Promise<unknown>>(),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
}))

import {
  isWorkshopsEnabledForOrg,
  isWorkshopsEnabledForConference,
  isWorkshopsEnabledForCurrentOrg,
} from './workshops'

const PLATFORM_SLUG = 'platform-org'

/** The id `PLATFORM_ORG_SLUG` resolves to in the live (uncached) read. */
const PLATFORM_ORG_ID = 'org-A'

function org(overrides: Partial<Organization> = {}): Organization {
  return {
    _id: 'org-A',
    name: 'Tenant A',
    slug: 'tenant-a',
    ...overrides,
  }
}

/** Point the LIVE slug→id resolution at an org id (or nothing). */
function platformOrgResolvesTo(orgId: string | null): void {
  h.fetch.mockResolvedValue(orgId)
}

const PAST = '2020-01-01T00:00:00.000Z'
const FUTURE = '2999-01-01T00:00:00.000Z'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PLATFORM_ORG_SLUG', PLATFORM_SLUG)
  // Default: the slug resolves to nobody, so only tests that opt in are
  // platform-org tests.
  platformOrgResolvesTo(null)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isWorkshopsEnabledForOrg — fail closed', () => {
  it('is DISABLED and reads nothing when the org cannot be resolved', async () => {
    await expect(isWorkshopsEnabledForOrg(null)).resolves.toBe(false)
    await expect(isWorkshopsEnabledForOrg(undefined)).resolves.toBe(false)
    await expect(isWorkshopsEnabledForOrg('')).resolves.toBe(false)
    expect(getOrganizationById).not.toHaveBeenCalled()
  })

  it('is DISABLED for an unknown organization document', async () => {
    getOrganizationById.mockResolvedValue(null)
    await expect(isWorkshopsEnabledForOrg('org-missing')).resolves.toBe(false)
  })

  it('is DISABLED — not thrown — when the organization read REJECTS', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    getOrganizationById.mockRejectedValue(new Error('sanity unavailable'))

    await expect(isWorkshopsEnabledForOrg('org-A')).resolves.toBe(false)
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })

  it('is DISABLED for an ordinary tenant on every plan', async () => {
    for (const plan of ['community', 'pro', 'enterprise'] as const) {
      getOrganizationById.mockResolvedValue(org({ plan }))
      await expect(isWorkshopsEnabledForOrg('org-A')).resolves.toBe(false)
    }
  })
})

describe('isWorkshopsEnabledForOrg — overrides', () => {
  it('is ENABLED by an explicit grant, regardless of plan', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        plan: 'community',
        featureOverrides: [{ feature: 'workshops', enabled: true }],
      }),
    )
    await expect(isWorkshopsEnabledForOrg('org-A')).resolves.toBe(true)
  })

  it('ignores an EXPIRED grant', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        featureOverrides: [
          { feature: 'workshops', enabled: true, expiresAt: PAST },
        ],
      }),
    )
    await expect(isWorkshopsEnabledForOrg('org-A')).resolves.toBe(false)
  })

  it('honours a grant that has not expired yet', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        featureOverrides: [
          { feature: 'workshops', enabled: true, expiresAt: FUTURE },
        ],
      }),
    )
    await expect(isWorkshopsEnabledForOrg('org-A')).resolves.toBe(true)
  })

  it('ignores an override for a different feature', async () => {
    getOrganizationById.mockResolvedValue(
      org({ featureOverrides: [{ feature: 'graphql-api', enabled: true }] }),
    )
    await expect(isWorkshopsEnabledForOrg('org-A')).resolves.toBe(false)
  })
})

describe('isWorkshopsEnabledForOrg — the platform org keeps working', () => {
  it('is ENABLED for the org PLATFORM_ORG_SLUG resolves to, with no override', async () => {
    platformOrgResolvesTo(PLATFORM_ORG_ID)
    getOrganizationById.mockResolvedValue(org({ slug: PLATFORM_SLUG }))
    await expect(isWorkshopsEnabledForOrg(PLATFORM_ORG_ID)).resolves.toBe(true)
  })

  it('is DISABLED for that same org when the contract is unset', async () => {
    vi.stubEnv('PLATFORM_ORG_SLUG', '')
    getOrganizationById.mockResolvedValue(org({ slug: PLATFORM_SLUG }))
    await expect(isWorkshopsEnabledForOrg(PLATFORM_ORG_ID)).resolves.toBe(false)
  })

  it('lets an explicit DENY override revoke it from the platform org', async () => {
    platformOrgResolvesTo(PLATFORM_ORG_ID)
    getOrganizationById.mockResolvedValue(
      org({
        slug: PLATFORM_SLUG,
        featureOverrides: [{ feature: 'workshops', enabled: false }],
      }),
    )
    await expect(isWorkshopsEnabledForOrg(PLATFORM_ORG_ID)).resolves.toBe(false)
  })

  it('ignores an EXPIRED deny override on the platform org', async () => {
    platformOrgResolvesTo(PLATFORM_ORG_ID)
    getOrganizationById.mockResolvedValue(
      org({
        slug: PLATFORM_SLUG,
        featureOverrides: [
          { feature: 'workshops', enabled: false, expiresAt: PAST },
        ],
      }),
    )
    await expect(isWorkshopsEnabledForOrg(PLATFORM_ORG_ID)).resolves.toBe(true)
  })
})

/**
 * THE SLUG-SPLIT REGRESSION NET (RunKonf/platform#36).
 *
 * The grant used to be decided by `org.slug` off the CACHED document — up to 24
 * hours stale, and writable from another application that could not invalidate
 * it. These two tests make the cached document and the live resolution
 * disagree, in both directions, and pin the gate to the live one. Restoring the
 * cached-slug comparison flips both.
 */
describe('isWorkshopsEnabledForOrg — the grant follows the LIVE resolution', () => {
  it('REVOKES immediately when the slug moved, even while the cached document still says platform', async () => {
    // Another application renamed the platform org's slug seconds ago: the live
    // read no longer resolves it, but this app's cached copy is unchanged.
    platformOrgResolvesTo(null)
    getOrganizationById.mockResolvedValue(org({ slug: PLATFORM_SLUG }))
    await expect(isWorkshopsEnabledForOrg(PLATFORM_ORG_ID)).resolves.toBe(false)
  })

  it('GRANTS immediately when the slug moved TO this org, while the cached document still says otherwise', async () => {
    platformOrgResolvesTo(PLATFORM_ORG_ID)
    getOrganizationById.mockResolvedValue(org({ slug: 'stale-old-slug' }))
    await expect(isWorkshopsEnabledForOrg(PLATFORM_ORG_ID)).resolves.toBe(true)
  })
})

describe('isWorkshopsEnabledForConference', () => {
  it('keys on the conference OWNER, not the request host', async () => {
    platformOrgResolvesTo('org-owner')
    getOrganizationById.mockResolvedValue(org({ slug: PLATFORM_SLUG }))
    await expect(
      isWorkshopsEnabledForConference({
        organization: { _ref: 'org-owner', _type: 'reference' },
      }),
    ).resolves.toBe(true)
    expect(getOrganizationById).toHaveBeenCalledWith('org-owner')
  })

  it('is DISABLED for a conference with no organization (fail closed)', async () => {
    await expect(isWorkshopsEnabledForConference({})).resolves.toBe(false)
    await expect(isWorkshopsEnabledForConference(null)).resolves.toBe(false)
    expect(getOrganizationById).not.toHaveBeenCalled()
  })
})

describe('isWorkshopsEnabledForCurrentOrg', () => {
  it('resolves the org from the request domain', async () => {
    getOrganizationRefForCurrentConference.mockResolvedValue('org-A')
    getOrganizationById.mockResolvedValue(
      org({ featureOverrides: [{ feature: 'workshops', enabled: true }] }),
    )
    await expect(isWorkshopsEnabledForCurrentOrg()).resolves.toBe(true)
  })

  it('is DISABLED when the request domain resolves to no org', async () => {
    getOrganizationRefForCurrentConference.mockResolvedValue(null)
    await expect(isWorkshopsEnabledForCurrentOrg()).resolves.toBe(false)
    expect(getOrganizationById).not.toHaveBeenCalled()
  })
})
