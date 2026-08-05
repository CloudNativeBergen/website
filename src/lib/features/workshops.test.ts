/**
 * @vitest-environment node
 *
 * The workshop feature gate (#689) — the ONE resolver the portal, the admin
 * surfaces and (critically) the ticket-sold email all consult.
 *
 * ONE boundary carries the entitlement inputs; the platform-org identity is
 * pure env (RunKonf/platform#43):
 *
 *  - `@/lib/organization/sanity` — the CACHED org document, carrying `plan` and
 *    `featureOverrides`. The real entitlement resolution runs on top of it.
 *  - Rule 3's platform-org identity is `isPlatformOrganization`, a pure id
 *    comparison against the configured `PLATFORM_ORG_ID`. No Sanity read is
 *    involved, so the `@/lib/sanity/client` mock below is a TRIPWIRE: if a slug
 *    (or any other) lookup is reintroduced it will call `h.fetch`, and the
 *    `not.toHaveBeenCalled()` guards will fail. The grant keys on the immutable
 *    id, never the document's customer-writable `slug`.
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

// TRIPWIRE only — the platform-org check must read NO Sanity. A reintroduced
// slug→id lookup would call this and trip the no-fetch guards below.
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

/** The configured platform org's document id — distinct from the default
 * tenant `org-A`, so ordinary-tenant tests are never accidentally platform. */
const PLATFORM_ORG_ID = 'org-platform'

/** A slug a pre-#43 slug-based gate would have matched — used to prove the
 * grant now ignores the document's slug entirely. */
const FORMER_PLATFORM_SLUG = 'platform-org'

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
  it('is ENABLED for the org whose id is PLATFORM_ORG_ID, with no override', async () => {
    getOrganizationById.mockResolvedValue(org({ _id: PLATFORM_ORG_ID }))
    await expect(isWorkshopsEnabledForOrg(PLATFORM_ORG_ID)).resolves.toBe(true)
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it('is DISABLED for that same org when the contract is unset', async () => {
    vi.stubEnv('PLATFORM_ORG_ID', '')
    getOrganizationById.mockResolvedValue(org({ _id: PLATFORM_ORG_ID }))
    await expect(isWorkshopsEnabledForOrg(PLATFORM_ORG_ID)).resolves.toBe(false)
  })

  it('lets an explicit DENY override revoke it from the platform org', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        _id: PLATFORM_ORG_ID,
        featureOverrides: [{ feature: 'workshops', enabled: false }],
      }),
    )
    await expect(isWorkshopsEnabledForOrg(PLATFORM_ORG_ID)).resolves.toBe(false)
  })

  it('ignores an EXPIRED deny override on the platform org', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        _id: PLATFORM_ORG_ID,
        featureOverrides: [
          { feature: 'workshops', enabled: false, expiresAt: PAST },
        ],
      }),
    )
    await expect(isWorkshopsEnabledForOrg(PLATFORM_ORG_ID)).resolves.toBe(true)
  })
})

/**
 * THE SLUG-INDEPENDENCE NET (RunKonf/platform#43).
 *
 * The grant used to be decided by `org.slug` — a customer-writable field. It now
 * keys on the immutable document id (`PLATFORM_ORG_ID`). These tests make the
 * cached document's slug LIE about platform standing, in both directions, and
 * pin the gate to the id. Restoring a slug comparison flips both. No Sanity read
 * happens either way.
 */
describe('isWorkshopsEnabledForOrg — the grant follows PLATFORM_ORG_ID, not the slug', () => {
  it('DENIES an org whose cached slug looks like the platform but whose id is not PLATFORM_ORG_ID', async () => {
    getOrganizationById.mockResolvedValue(
      org({ _id: 'org-A', slug: FORMER_PLATFORM_SLUG }),
    )
    await expect(isWorkshopsEnabledForOrg('org-A')).resolves.toBe(false)
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it('GRANTS the org whose id IS PLATFORM_ORG_ID even when its cached slug is something else', async () => {
    getOrganizationById.mockResolvedValue(
      org({ _id: PLATFORM_ORG_ID, slug: 'stale-old-slug' }),
    )
    await expect(isWorkshopsEnabledForOrg(PLATFORM_ORG_ID)).resolves.toBe(true)
    expect(h.fetch).not.toHaveBeenCalled()
  })
})

describe('isWorkshopsEnabledForConference', () => {
  it('keys on the conference OWNER, not the request host', async () => {
    getOrganizationById.mockResolvedValue(org({ _id: PLATFORM_ORG_ID }))
    await expect(
      isWorkshopsEnabledForConference({
        organization: { _ref: PLATFORM_ORG_ID, _type: 'reference' },
      }),
    ).resolves.toBe(true)
    expect(getOrganizationById).toHaveBeenCalledWith(PLATFORM_ORG_ID)
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
