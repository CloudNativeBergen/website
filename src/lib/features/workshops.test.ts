/**
 * @vitest-environment node
 *
 * The workshop feature gate (#689) — the ONE resolver the portal, the admin
 * surfaces and (critically) the ticket-sold email all consult. The org document
 * read is mocked at the Sanity boundary so the REAL entitlement resolution runs:
 * plan/override semantics, override expiry, and the platform-org default that
 * keeps today's tenant working without a data migration.
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

import {
  isWorkshopsEnabledForOrg,
  isWorkshopsEnabledForConference,
  isWorkshopsEnabledForCurrentOrg,
} from './workshops'

const PLATFORM_SLUG = 'platform-org'

function org(overrides: Partial<Organization> = {}): Organization {
  return {
    _id: 'org-A',
    name: 'Tenant A',
    slug: 'tenant-a',
    ...overrides,
  }
}

const PAST = '2020-01-01T00:00:00.000Z'
const FUTURE = '2999-01-01T00:00:00.000Z'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PLATFORM_ORG_SLUG', PLATFORM_SLUG)
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
  it('is ENABLED for the org named by PLATFORM_ORG_SLUG, with no override', async () => {
    getOrganizationById.mockResolvedValue(org({ slug: PLATFORM_SLUG }))
    await expect(isWorkshopsEnabledForOrg('org-A')).resolves.toBe(true)
  })

  it('is DISABLED for that same org when the contract is unset', async () => {
    vi.stubEnv('PLATFORM_ORG_SLUG', '')
    getOrganizationById.mockResolvedValue(org({ slug: PLATFORM_SLUG }))
    await expect(isWorkshopsEnabledForOrg('org-A')).resolves.toBe(false)
  })

  it('lets an explicit DENY override revoke it from the platform org', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        slug: PLATFORM_SLUG,
        featureOverrides: [{ feature: 'workshops', enabled: false }],
      }),
    )
    await expect(isWorkshopsEnabledForOrg('org-A')).resolves.toBe(false)
  })

  it('ignores an EXPIRED deny override on the platform org', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        slug: PLATFORM_SLUG,
        featureOverrides: [
          { feature: 'workshops', enabled: false, expiresAt: PAST },
        ],
      }),
    )
    await expect(isWorkshopsEnabledForOrg('org-A')).resolves.toBe(true)
  })
})

describe('isWorkshopsEnabledForConference', () => {
  it('keys on the conference OWNER, not the request host', async () => {
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
