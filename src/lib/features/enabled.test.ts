/**
 * @vitest-environment node
 *
 * The EFFECTIVE feature set the admin shell filters its nav and ⌘K destinations
 * by. The admin layout used to hardcode `['workshops'] | []`, which is why no
 * other feature could gate a destination however it was tagged; this composes
 * the registry resolution with each platform-default gate's own answer.
 *
 * Real entitlement resolution runs — only the org document read and the per-org
 * secret env are supplied.
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
  resolveEnabledFeaturesForOrg,
  resolveEnabledFeaturesForConference,
} from './enabled'
import { PLATFORM_DEFAULT_FEATURES } from './platform-default'
import { FEATURES } from './registry'

const PLATFORM_ORG_ID = 'org-platform'

function org(overrides: Partial<Organization> = {}): Organization {
  return { _id: 'org-A', name: 'Tenant A', slug: 'tenant-a', ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PLATFORM_ORG_ID', PLATFORM_ORG_ID)
  vi.stubEnv('TENANT_SECRETS_JSON', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

/**
 * NO PLAN TIER SELLS THESE YET. Which tier eventually sells ticketing, badges
 * or workshops is an open owner decision; encoding a guess would hand a
 * customer a surface that cannot work (one WorkOS client, one provider account,
 * one badge signing key pair). This fails the moment someone adds a `minPlan`.
 */
describe('the platform-default features stay internal and tier-less', () => {
  it.each(PLATFORM_DEFAULT_FEATURES)('%s', (id) => {
    expect(FEATURES[id].readiness).toBe('internal')
    expect(FEATURES[id].minPlan).toBeUndefined()
  })
})

describe('resolveEnabledFeaturesForOrg', () => {
  it('gives a brand-new community tenant NOTHING — the day-one demo org', async () => {
    getOrganizationById.mockResolvedValue(org({ plan: 'community' }))
    await expect(resolveEnabledFeaturesForOrg('org-A')).resolves.toEqual([])
  })

  it('gives the platform org every platform-default feature', async () => {
    getOrganizationById.mockResolvedValue(org({ _id: PLATFORM_ORG_ID }))
    await expect(
      resolveEnabledFeaturesForOrg(PLATFORM_ORG_ID),
    ).resolves.toEqual(['workshops', 'ticketing', 'badges'])
  })

  it('includes plan-granted ga features alongside the platform defaults', async () => {
    // `dedicated-email` is the ga/minPlan-pro registry entry.
    getOrganizationById.mockResolvedValue(org({ plan: 'pro' }))
    await expect(resolveEnabledFeaturesForOrg('org-A')).resolves.toEqual([
      'dedicated-email',
    ])
  })

  it('honours a single override without granting its siblings', async () => {
    getOrganizationById.mockResolvedValue(
      org({ featureOverrides: [{ feature: 'ticketing', enabled: true }] }),
    )
    await expect(resolveEnabledFeaturesForOrg('org-A')).resolves.toEqual([
      'ticketing',
    ])
  })

  it('lets a DENY override revoke a platform-default from the platform org', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        _id: PLATFORM_ORG_ID,
        featureOverrides: [{ feature: 'badges', enabled: false }],
      }),
    )
    await expect(
      resolveEnabledFeaturesForOrg(PLATFORM_ORG_ID),
    ).resolves.toEqual(['workshops', 'ticketing'])
  })

  it('is EMPTY for an unresolvable org, and reads nothing (fail closed)', async () => {
    await expect(resolveEnabledFeaturesForOrg(null)).resolves.toEqual([])
    await expect(resolveEnabledFeaturesForOrg(undefined)).resolves.toEqual([])
    expect(getOrganizationById).not.toHaveBeenCalled()
  })

  it('is EMPTY — not thrown — when the org read REJECTS', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    getOrganizationById.mockRejectedValue(new Error('sanity unavailable'))
    await expect(resolveEnabledFeaturesForOrg('org-A')).resolves.toEqual([])
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })

  it('returns registry declaration order, whatever grants it', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        plan: 'pro',
        featureOverrides: [
          { feature: 'ticketing', enabled: true },
          { feature: 'graphql-api', enabled: true },
        ],
      }),
    )
    await expect(resolveEnabledFeaturesForOrg('org-A')).resolves.toEqual([
      'graphql-api',
      'dedicated-email',
      'ticketing',
    ])
  })

  /**
   * The badge gate is the one that cannot be opened by an override — its
   * capability is a single global key pair. The composed set must honour that,
   * or the nav would offer a page the gate itself 404s.
   */
  it('does not grant badges to a non-platform org by override', async () => {
    getOrganizationById.mockResolvedValue(
      org({ featureOverrides: [{ feature: 'badges', enabled: true }] }),
    )
    await expect(resolveEnabledFeaturesForOrg('org-A')).resolves.toEqual([])
  })
})

describe('resolveEnabledFeaturesForConference', () => {
  it('keys on the conference OWNER', async () => {
    getOrganizationById.mockResolvedValue(org({ _id: PLATFORM_ORG_ID }))
    await expect(
      resolveEnabledFeaturesForConference({
        organization: { _ref: PLATFORM_ORG_ID, _type: 'reference' },
      }),
    ).resolves.toContain('ticketing')
  })

  it('is EMPTY for a conference with no organization', async () => {
    await expect(resolveEnabledFeaturesForConference({})).resolves.toEqual([])
    await expect(resolveEnabledFeaturesForConference(null)).resolves.toEqual([])
  })
})
