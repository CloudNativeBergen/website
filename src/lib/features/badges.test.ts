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

/**
 * THE GATE CANNOT BE LOOSER THAN THE CAPABILITY.
 *
 * Badge signing is ONE global key pair and `issueBadgeForSpeaker` refuses every
 * non-platform org. A `badges` grant that opened the page anyway would hand an
 * organizer the full management UI for something structurally broken — every
 * Issue, Rebake and bulk run failing with the tripwire's message, which is the
 * dead end this gate exists to remove, recreated by an operator's own override.
 * So the override may REVOKE but never GRANT, until platform#46 ships per-tenant
 * keys and the capability check relaxes with it.
 */
describe('isBadgesEnabledForOrg — a grant cannot open a broken surface', () => {
  it('is DISABLED for a non-platform org even with an ACTIVE grant', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        plan: 'community',
        featureOverrides: [{ feature: 'badges', enabled: true }],
      }),
    )
    await expect(isBadgesEnabledForOrg('org-A')).resolves.toBe(false)
  })

  it('is DISABLED for a non-platform org with an unexpired grant', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        featureOverrides: [
          { feature: 'badges', enabled: true, expiresAt: FUTURE },
        ],
      }),
    )
    await expect(isBadgesEnabledForOrg('org-A')).resolves.toBe(false)
  })

  it('is DISABLED for a non-platform org with an EXPIRED grant', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        featureOverrides: [
          { feature: 'badges', enabled: true, expiresAt: PAST },
        ],
      }),
    )
    await expect(isBadgesEnabledForOrg('org-A')).resolves.toBe(false)
  })

  it('a grant does NOT reach past the capability on ANY plan', async () => {
    for (const plan of ['community', 'pro', 'enterprise'] as const) {
      getOrganizationById.mockResolvedValue(
        org({ plan, featureOverrides: [{ feature: 'badges', enabled: true }] }),
      )
      await expect(isBadgesEnabledForOrg('org-A')).resolves.toBe(false)
    }
  })
})

describe('isBadgesEnabledForOrg — the platform default and its revocation', () => {
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

  it('ignores an EXPIRED deny on the platform org', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        _id: PLATFORM_ORG_ID,
        featureOverrides: [
          { feature: 'badges', enabled: false, expiresAt: PAST },
        ],
      }),
    )
    await expect(isBadgesEnabledForOrg(PLATFORM_ORG_ID)).resolves.toBe(true)
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
