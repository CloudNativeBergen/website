/**
 * @vitest-environment node
 *
 * The BADGE feature gate — the front door in front of the badge issuance
 * tripwire (RunKonf/platform#46). Without it `/admin/speakers/badge` rendered
 * for every tenant and surfaced the tripwire's refusal, which names an internal
 * issue tracker, once PER SPEAKER.
 *
 * One boundary carries the entitlement inputs (`@/lib/organization/sanity`, the
 * cached org document); platform standing is pure env, so the
 * `@/lib/sanity/client` mock is a TRIPWIRE — a reintroduced slug lookup would
 * call it and trip the no-fetch guards.
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

import { isBadgesEnabledForOrg, isBadgesEnabledForConference } from './badges'

const PLATFORM_ORG_ID = 'org-platform'
const PAST = '2020-01-01T00:00:00.000Z'
const FUTURE = '2999-01-01T00:00:00.000Z'

function org(overrides: Partial<Organization> = {}): Organization {
  return { _id: 'org-A', name: 'Tenant A', slug: 'tenant-a', ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PLATFORM_ORG_ID', PLATFORM_ORG_ID)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isBadgesEnabledForOrg — fail closed', () => {
  it('is DISABLED and reads nothing when the org cannot be resolved', async () => {
    await expect(isBadgesEnabledForOrg(null)).resolves.toBe(false)
    await expect(isBadgesEnabledForOrg(undefined)).resolves.toBe(false)
    await expect(isBadgesEnabledForOrg('')).resolves.toBe(false)
    expect(getOrganizationById).not.toHaveBeenCalled()
  })

  it('is DISABLED for an unknown organization document', async () => {
    getOrganizationById.mockResolvedValue(null)
    await expect(isBadgesEnabledForOrg('org-missing')).resolves.toBe(false)
  })

  it('is DISABLED — not thrown — when the organization read REJECTS', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    getOrganizationById.mockRejectedValue(new Error('sanity unavailable'))
    await expect(isBadgesEnabledForOrg('org-A')).resolves.toBe(false)
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })

  it('is DISABLED for an ordinary tenant on EVERY plan — no tier sells badges', async () => {
    for (const plan of ['community', 'pro', 'enterprise'] as const) {
      getOrganizationById.mockResolvedValue(org({ plan }))
      await expect(isBadgesEnabledForOrg('org-A')).resolves.toBe(false)
    }
  })
})

describe('isBadgesEnabledForOrg — overrides and the platform default', () => {
  it('is ENABLED by an explicit grant, regardless of plan', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        plan: 'community',
        featureOverrides: [{ feature: 'badges', enabled: true }],
      }),
    )
    await expect(isBadgesEnabledForOrg('org-A')).resolves.toBe(true)
  })

  it('ignores an EXPIRED grant', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        featureOverrides: [
          { feature: 'badges', enabled: true, expiresAt: PAST },
        ],
      }),
    )
    await expect(isBadgesEnabledForOrg('org-A')).resolves.toBe(false)
  })

  it('honours a grant that has not expired yet', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        featureOverrides: [
          { feature: 'badges', enabled: true, expiresAt: FUTURE },
        ],
      }),
    )
    await expect(isBadgesEnabledForOrg('org-A')).resolves.toBe(true)
  })

  it('ignores an override for a different feature', async () => {
    getOrganizationById.mockResolvedValue(
      org({ featureOverrides: [{ feature: 'workshops', enabled: true }] }),
    )
    await expect(isBadgesEnabledForOrg('org-A')).resolves.toBe(false)
  })

  it('is ENABLED for the org whose id is PLATFORM_ORG_ID, with no Sanity read for the identity', async () => {
    getOrganizationById.mockResolvedValue(org({ _id: PLATFORM_ORG_ID }))
    await expect(isBadgesEnabledForOrg(PLATFORM_ORG_ID)).resolves.toBe(true)
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it('lets an explicit DENY revoke it from the platform org', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        _id: PLATFORM_ORG_ID,
        featureOverrides: [{ feature: 'badges', enabled: false }],
      }),
    )
    await expect(isBadgesEnabledForOrg(PLATFORM_ORG_ID)).resolves.toBe(false)
  })

  it('DENIES an org whose slug merely LOOKS like the platform org', async () => {
    getOrganizationById.mockResolvedValue(
      org({ _id: 'org-A', slug: 'platform-org' }),
    )
    await expect(isBadgesEnabledForOrg('org-A')).resolves.toBe(false)
    expect(h.fetch).not.toHaveBeenCalled()
  })
})

describe('isBadgesEnabledForConference', () => {
  it('keys on the conference OWNER, not the request host', async () => {
    getOrganizationById.mockResolvedValue(org({ _id: PLATFORM_ORG_ID }))
    await expect(
      isBadgesEnabledForConference({
        organization: { _ref: PLATFORM_ORG_ID, _type: 'reference' },
      }),
    ).resolves.toBe(true)
    expect(getOrganizationById).toHaveBeenCalledWith(PLATFORM_ORG_ID)
  })

  it('is DISABLED for a conference with no organization (fail closed)', async () => {
    await expect(isBadgesEnabledForConference({})).resolves.toBe(false)
    await expect(isBadgesEnabledForConference(null)).resolves.toBe(false)
    expect(getOrganizationById).not.toHaveBeenCalled()
  })
})
