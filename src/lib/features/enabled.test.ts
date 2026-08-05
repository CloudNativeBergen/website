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
import { ORGANIZATION_PLANS } from '@/lib/organization/types'

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
 * A TIER IS ATTACHED ONLY WHEN THE CAPABILITY IS PER-TENANT.
 *
 * #828 shipped this as a blanket "no platform-default feature may have a
 * `minPlan`", because no tier had been decided for any of them. The owner
 * decided ticketing's tier on 2026-08-06 — a tenant brings its OWN Checkin/Tito
 * account, so the integration works for whoever buys it and costs the platform
 * nothing per tenant — so the guard is narrowed to what it was actually
 * protecting: `workshops` and `badges`, whose single global credential (one
 * WorkOS client, one badge signing key pair) still cannot serve a second
 * tenant. Attaching a tier to either would sell a surface that cannot work.
 */
describe('platform-default feature tiers track the capability', () => {
  it('sells ticketing at the ENTRY PAID tier', () => {
    expect(FEATURES.ticketing.readiness).toBe('ga')
    expect(FEATURES.ticketing.minPlan).toBe('pro')
    // "Entry PAID": the ladder's first rung is the free/comped community tier,
    // so the lowest tier a customer can BUY is the second one.
    expect(ORGANIZATION_PLANS[0]).toBe('community')
    expect(FEATURES.ticketing.minPlan).toBe(ORGANIZATION_PLANS[1])
  })

  const tierless = PLATFORM_DEFAULT_FEATURES.filter((id) => id !== 'ticketing')

  it.each(tierless)('%s stays internal and tier-less', (id) => {
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

  /**
   * The entry paid tier now BUYS ticketing (owner decision, 2026-08-06), so the
   * nav offers it to a pro tenant that has bought nothing else and configured
   * nothing yet — the pages then walk it through connecting its own provider
   * account. `dedicated-email` is the other ga/minPlan-pro registry entry.
   */
  it('includes plan-granted ga features alongside the platform defaults', async () => {
    getOrganizationById.mockResolvedValue(org({ plan: 'pro' }))
    await expect(resolveEnabledFeaturesForOrg('org-A')).resolves.toEqual([
      'dedicated-email',
      'ticketing',
    ])
  })

  it('does NOT give ticketing to a community tenant that has not bought it', async () => {
    getOrganizationById.mockResolvedValue(org({ plan: 'community' }))
    await expect(resolveEnabledFeaturesForOrg('org-A')).resolves.not.toContain(
      'ticketing',
    )
  })

  /**
   * The platform org is a TENANT too, and its own organization document may
   * carry any plan (this deployment's carries none at all). Its implicit grant
   * must survive the tier decision.
   */
  it('keeps ticketing for the platform org on the free community plan', async () => {
    getOrganizationById.mockResolvedValue(
      org({ _id: PLATFORM_ORG_ID, plan: 'community' }),
    )
    await expect(
      resolveEnabledFeaturesForOrg(PLATFORM_ORG_ID),
    ).resolves.toEqual(['workshops', 'ticketing', 'badges'])
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
