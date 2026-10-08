/**
 * @vitest-environment node
 *
 * The workshop feature gate (#689, #1295) — the ONE resolver the portal, the
 * admin surfaces and (critically) the ticket-sold email all consult.
 *
 * Since #1295 `workshops` is a plain registry feature (`ga`, `minPlan: 'pro'`)
 * with one extra condition: the org's ticketing must be enabled AND able to
 * read ticket data, because workshop access is decided from tickets. There is
 * no implicit grant to the platform org any more — it qualifies by plan like
 * everyone else (its ticketing credentials are the platform env account).
 *
 * Two boundaries carry the inputs; both are real env/document reads:
 *
 *  - `@/lib/organization/sanity` — the CACHED org document (`plan` +
 *    `featureOverrides`), plus the tenant→env-slug map the per-org secret
 *    store needs. Real entitlement resolution runs on top of it.
 *  - `TENANT_SECRETS_JSON` — the per-org secret store, read through the REAL
 *    store so "has ticketing credentials" cannot drift from what
 *    `resolveTicketingCredentials` would resolve.
 *
 * The `@/lib/sanity/client` mock is a TRIPWIRE: platform standing is a pure
 * `PLATFORM_ORG_ID` comparison and must read nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { stubOwnTicketingSecret } from '../../../__tests__/helpers/ticketingSecrets'
import type { Organization } from '@/lib/organization/types'

const getOrganizationById = vi.fn()
const getOrganizationRefForCurrentConference = vi.fn()
const secretEnvSlugs = vi.fn(async () => [
  { _id: 'org-A', secretEnvSlug: 'TENANT_A' },
])

vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: (...args: unknown[]) => getOrganizationById(...args),
  getOrganizationRefForCurrentConference: () =>
    getOrganizationRefForCurrentConference(),
  getOrganizationSecretEnvSlugs: () => secretEnvSlugs(),
  readOrganizationSecretEnvSlugs: () => secretEnvSlugs(),
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
  resolveWorkshopsForConference,
} from './workshops'

/** The configured platform org's document id — distinct from the default
 * tenant `org-A`, so ordinary-tenant tests are never accidentally platform. */
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
  vi.stubEnv('TENANT_SECRETS_JSON', '')
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

  it('is DISABLED on the free community plan, even with ticketing credentials', async () => {
    stubOwnTicketingSecret('org-A')
    getOrganizationById.mockResolvedValue(org({ plan: 'community' }))
    await expect(isWorkshopsEnabledForOrg('org-A')).resolves.toBe(false)
  })

  it('is DISABLED for an org with no plan at all (absent → community)', async () => {
    stubOwnTicketingSecret('org-A')
    getOrganizationById.mockResolvedValue(org())
    await expect(isWorkshopsEnabledForOrg('org-A')).resolves.toBe(false)
  })
})

/**
 * THE TIER (#1295). `workshops` is `ga` with `minPlan: 'pro'`, but the plan
 * alone is not enough: the portal decides access from ticket data, so an org
 * whose ticketing cannot read any is sold nothing it can use.
 */
describe('isWorkshopsEnabledForOrg — pro plan AND working ticketing', () => {
  it('is ENABLED on the entry paid plan for an org with its own ticketing credentials', async () => {
    stubOwnTicketingSecret('org-A')
    getOrganizationById.mockResolvedValue(org({ plan: 'pro' }))
    await expect(isWorkshopsEnabledForOrg('org-A')).resolves.toBe(true)
  })

  it('is ENABLED on every plan above the entry paid one', async () => {
    stubOwnTicketingSecret('org-A')
    getOrganizationById.mockResolvedValue(org({ plan: 'enterprise' }))
    await expect(isWorkshopsEnabledForOrg('org-A')).resolves.toBe(true)
  })

  /** THE #1295 CASE: a paid plan with nothing to read tickets from. */
  it('is DISABLED for a pro org with NO ticketing credentials', async () => {
    getOrganizationById.mockResolvedValue(org({ plan: 'pro' }))
    await expect(isWorkshopsEnabledForOrg('org-A')).resolves.toBe(false)
  })

  it('is DISABLED for a pro org whose ticketing an operator has switched OFF', async () => {
    stubOwnTicketingSecret('org-A')
    getOrganizationById.mockResolvedValue(
      org({
        plan: 'pro',
        featureOverrides: [{ feature: 'ticketing', enabled: false }],
      }),
    )
    await expect(isWorkshopsEnabledForOrg('org-A')).resolves.toBe(false)
  })

  it('is DISABLED — not thrown — when the per-org secret store cannot resolve the tenant', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Some tenant holds a COMPLETE set of discrete env credentials, so the env
    // store must know whose they are — and the slug map it needs is down.
    vi.stubEnv('TENANT_SOMEONE_CHECKIN_API_KEY', 'k')
    vi.stubEnv('TENANT_SOMEONE_CHECKIN_API_SECRET', 's')
    vi.stubEnv('TENANT_SOMEONE_CHECKIN_WEBHOOK_SECRET', 'w')
    secretEnvSlugs.mockRejectedValue(new Error('slug map unavailable'))
    stubOwnTicketingSecret('org-A')
    getOrganizationById.mockResolvedValue(org({ plan: 'pro' }))

    await expect(isWorkshopsEnabledForOrg('org-A')).resolves.toBe(false)
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })

  /**
   * The legal disclosure's view of the same decision: a refused lookup is
   * "could not find out" (`null`), never a "no" — but only where the lookup is
   * what decided. A healthy miss and an operator's deny are real answers.
   */
  it('reports a refused secret lookup as UNKNOWN to the disclosure, and every real answer as itself', async () => {
    const owner = { organization: { _ref: 'org-A' } }
    getOrganizationById.mockResolvedValue(org({ plan: 'pro' }))
    await expect(resolveWorkshopsForConference(owner)).resolves.toBe(false)
    stubOwnTicketingSecret('org-A')
    await expect(resolveWorkshopsForConference(owner)).resolves.toBe(true)

    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('TENANT_SOMEONE_CHECKIN_API_KEY', 'k')
    vi.stubEnv('TENANT_SOMEONE_CHECKIN_API_SECRET', 's')
    vi.stubEnv('TENANT_SOMEONE_CHECKIN_WEBHOOK_SECRET', 'w')
    secretEnvSlugs.mockRejectedValue(new Error('slug map unavailable'))
    await expect(resolveWorkshopsForConference(owner)).resolves.toBeNull()

    // The store is still down, but it is not what decides these two.
    getOrganizationById.mockResolvedValue(
      org({
        plan: 'pro',
        featureOverrides: [{ feature: 'workshops', enabled: false }],
      }),
    )
    await expect(resolveWorkshopsForConference(owner)).resolves.toBe(false)
    getOrganizationById.mockResolvedValue(
      org({
        plan: 'community',
        featureOverrides: [{ feature: 'workshops', enabled: true }],
      }),
    )
    await expect(resolveWorkshopsForConference(owner)).resolves.toBe(true)
    logged.mockRestore()
  })
})

describe('isWorkshopsEnabledForOrg — overrides win in both directions', () => {
  it('is ENABLED by an explicit grant, regardless of plan and ticketing', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        plan: 'community',
        featureOverrides: [{ feature: 'workshops', enabled: true }],
      }),
    )
    await expect(isWorkshopsEnabledForOrg('org-A')).resolves.toBe(true)
  })

  it('is DISABLED by an explicit deny on an org the plan and ticketing would grant', async () => {
    stubOwnTicketingSecret('org-A')
    getOrganizationById.mockResolvedValue(
      org({
        plan: 'pro',
        featureOverrides: [{ feature: 'workshops', enabled: false }],
      }),
    )
    await expect(isWorkshopsEnabledForOrg('org-A')).resolves.toBe(false)
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

  it('ignores an EXPIRED deny and falls back to plan + ticketing', async () => {
    stubOwnTicketingSecret('org-A')
    getOrganizationById.mockResolvedValue(
      org({
        plan: 'pro',
        featureOverrides: [
          { feature: 'workshops', enabled: false, expiresAt: PAST },
        ],
      }),
    )
    await expect(isWorkshopsEnabledForOrg('org-A')).resolves.toBe(true)
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

/**
 * NO PLATFORM-ORG RULE (#1295). The platform org used to keep workshops
 * implicitly because it owned the one WorkOS client. It now qualifies by plan
 * like any other org; what it still has by right is TICKETING (the platform
 * env account), which is the second half of the rule.
 */
describe('isWorkshopsEnabledForOrg — the platform org gets it by plan, not by identity', () => {
  it('is DISABLED for the platform org on the community plan', async () => {
    getOrganizationById.mockResolvedValue(
      org({ _id: PLATFORM_ORG_ID, plan: 'community' }),
    )
    await expect(isWorkshopsEnabledForOrg(PLATFORM_ORG_ID)).resolves.toBe(false)
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it('is ENABLED for the platform org on pro — its ticketing is the env account, no per-org secret needed', async () => {
    getOrganizationById.mockResolvedValue(
      org({ _id: PLATFORM_ORG_ID, plan: 'pro' }),
    )
    await expect(isWorkshopsEnabledForOrg(PLATFORM_ORG_ID)).resolves.toBe(true)
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it('lets an explicit DENY override revoke it from the platform org', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        _id: PLATFORM_ORG_ID,
        plan: 'pro',
        featureOverrides: [{ feature: 'workshops', enabled: false }],
      }),
    )
    await expect(isWorkshopsEnabledForOrg(PLATFORM_ORG_ID)).resolves.toBe(false)
  })
})

describe('isWorkshopsEnabledForConference', () => {
  it('keys on the conference OWNER, not the request host', async () => {
    getOrganizationById.mockResolvedValue(
      org({ _id: PLATFORM_ORG_ID, plan: 'pro' }),
    )
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
