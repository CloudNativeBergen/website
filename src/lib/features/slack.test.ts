/**
 * @vitest-environment node
 *
 * The `slack-mirror` feature gate — the ONE resolver deciding whether an
 * organization may send with the PLATFORM's Slack bot token.
 *
 * Same two boundaries as the workshops gate it mirrors:
 *
 *  - `@/lib/organization/sanity` — the CACHED org document, carrying `plan` and
 *    `featureOverrides`; the real entitlement resolution runs on top of it.
 *  - The platform-org identity is `isPlatformOrganization`, a pure id comparison
 *    against `PLATFORM_ORG_ID`. No Sanity read is involved, so the
 *    `@/lib/sanity/client` mock is a TRIPWIRE: a reintroduced slug (or any
 *    other) lookup would call `h.fetch` and trip the no-fetch guards.
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

// TRIPWIRE only — the platform-org check must read NO Sanity.
const h = vi.hoisted(() => ({
  fetch: vi.fn<(query: string, params?: unknown) => Promise<unknown>>(),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
}))

import {
  isSlackMirrorEnabledForOrg,
  isSlackMirrorEnabledForConference,
  isSlackMirrorEnabledForCurrentOrg,
} from './slack'

/** The configured platform org's document id — deliberately distinct from the
 * default tenant `org-A`, so ordinary-tenant cases are never accidentally
 * platform. */
const PLATFORM_ORG_ID = 'org-platform'

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
  vi.stubEnv('PLATFORM_ORG_ID', PLATFORM_ORG_ID)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isSlackMirrorEnabledForOrg — fail closed', () => {
  it('is DISABLED and reads nothing when the org cannot be resolved', async () => {
    await expect(isSlackMirrorEnabledForOrg(null)).resolves.toBe(false)
    await expect(isSlackMirrorEnabledForOrg(undefined)).resolves.toBe(false)
    await expect(isSlackMirrorEnabledForOrg('')).resolves.toBe(false)
    expect(getOrganizationById).not.toHaveBeenCalled()
  })

  it('is DISABLED for an unknown organization document', async () => {
    getOrganizationById.mockResolvedValue(null)
    await expect(isSlackMirrorEnabledForOrg('org-missing')).resolves.toBe(false)
  })

  it('is DISABLED — not thrown — when the organization read REJECTS', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    getOrganizationById.mockRejectedValue(new Error('sanity unavailable'))

    await expect(isSlackMirrorEnabledForOrg('org-A')).resolves.toBe(false)
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })

  it('is DISABLED for an ordinary tenant on every plan', async () => {
    for (const plan of ['community', 'pro', 'enterprise'] as const) {
      getOrganizationById.mockResolvedValue(org({ plan }))
      await expect(isSlackMirrorEnabledForOrg('org-A')).resolves.toBe(false)
    }
  })
})

describe('isSlackMirrorEnabledForOrg — overrides', () => {
  it('is ENABLED by an explicit grant, regardless of plan', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        plan: 'community',
        featureOverrides: [{ feature: 'slack-mirror', enabled: true }],
      }),
    )
    await expect(isSlackMirrorEnabledForOrg('org-A')).resolves.toBe(true)
  })

  it('ignores an EXPIRED grant', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        featureOverrides: [
          { feature: 'slack-mirror', enabled: true, expiresAt: PAST },
        ],
      }),
    )
    await expect(isSlackMirrorEnabledForOrg('org-A')).resolves.toBe(false)
  })

  it('honours a grant that has not expired yet', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        featureOverrides: [
          { feature: 'slack-mirror', enabled: true, expiresAt: FUTURE },
        ],
      }),
    )
    await expect(isSlackMirrorEnabledForOrg('org-A')).resolves.toBe(true)
  })

  it('ignores an override for a different feature', async () => {
    getOrganizationById.mockResolvedValue(
      org({ featureOverrides: [{ feature: 'workshops', enabled: true }] }),
    )
    await expect(isSlackMirrorEnabledForOrg('org-A')).resolves.toBe(false)
  })
})

describe('isSlackMirrorEnabledForOrg — the platform org keeps working', () => {
  it('is ENABLED for the org whose id is PLATFORM_ORG_ID, with no override', async () => {
    getOrganizationById.mockResolvedValue(org({ _id: PLATFORM_ORG_ID }))
    await expect(isSlackMirrorEnabledForOrg(PLATFORM_ORG_ID)).resolves.toBe(
      true,
    )
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it('is DISABLED for that same org when the contract is unset', async () => {
    vi.stubEnv('PLATFORM_ORG_ID', '')
    getOrganizationById.mockResolvedValue(org({ _id: PLATFORM_ORG_ID }))
    await expect(isSlackMirrorEnabledForOrg(PLATFORM_ORG_ID)).resolves.toBe(
      false,
    )
  })

  it('lets an explicit DENY override revoke it from the platform org', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        _id: PLATFORM_ORG_ID,
        featureOverrides: [{ feature: 'slack-mirror', enabled: false }],
      }),
    )
    await expect(isSlackMirrorEnabledForOrg(PLATFORM_ORG_ID)).resolves.toBe(
      false,
    )
  })

  it('ignores an EXPIRED deny override on the platform org', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        _id: PLATFORM_ORG_ID,
        featureOverrides: [
          { feature: 'slack-mirror', enabled: false, expiresAt: PAST },
        ],
      }),
    )
    await expect(isSlackMirrorEnabledForOrg(PLATFORM_ORG_ID)).resolves.toBe(
      true,
    )
  })

  it('DENIES an org whose cached slug looks like the platform but whose id is not PLATFORM_ORG_ID', async () => {
    getOrganizationById.mockResolvedValue(
      org({ _id: 'org-A', slug: 'platform-org' }),
    )
    await expect(isSlackMirrorEnabledForOrg('org-A')).resolves.toBe(false)
    expect(h.fetch).not.toHaveBeenCalled()
  })
})

describe('isSlackMirrorEnabledForConference', () => {
  it('keys on the conference OWNER, not the request host', async () => {
    getOrganizationById.mockResolvedValue(org({ _id: PLATFORM_ORG_ID }))
    await expect(
      isSlackMirrorEnabledForConference({
        organization: { _ref: PLATFORM_ORG_ID, _type: 'reference' },
      }),
    ).resolves.toBe(true)
    expect(getOrganizationById).toHaveBeenCalledWith(PLATFORM_ORG_ID)
  })

  it('is DISABLED for a conference with no organization (fail closed)', async () => {
    await expect(isSlackMirrorEnabledForConference({})).resolves.toBe(false)
    await expect(isSlackMirrorEnabledForConference(null)).resolves.toBe(false)
    expect(getOrganizationById).not.toHaveBeenCalled()
  })
})

describe('isSlackMirrorEnabledForCurrentOrg', () => {
  it('resolves the org from the request domain', async () => {
    getOrganizationRefForCurrentConference.mockResolvedValue('org-A')
    getOrganizationById.mockResolvedValue(
      org({ featureOverrides: [{ feature: 'slack-mirror', enabled: true }] }),
    )
    await expect(isSlackMirrorEnabledForCurrentOrg()).resolves.toBe(true)
  })

  it('is DISABLED when the request domain resolves to no org', async () => {
    getOrganizationRefForCurrentConference.mockResolvedValue(null)
    await expect(isSlackMirrorEnabledForCurrentOrg()).resolves.toBe(false)
    expect(getOrganizationById).not.toHaveBeenCalled()
  })
})
