/**
 * @vitest-environment node
 *
 * `platform` router — the cross-tenant management surface. The critical
 * property is the SERVER-SIDE platform gate: an ordinary tenant organizer
 * (admin of a non-platform org) gets FORBIDDEN on every procedure, because the
 * client hiding the card is presentation, not security. The gate runs FOR REAL
 * here — `PLATFORM_ORG_SLUG` env, resolved LIVE to an org id and compared
 * against the request's org, drives `isPlatformOrganization` (see
 * RunKonf/platform#36: it must not read through a cache another application can
 * change but not invalidate); only the external boundaries (the Sanity client,
 * Next's cache API, the domain-conference resolution) are mocked. Also covers
 * the updateEntitlements write path: keyed overrides, empty-optional
 * stripping, and the `organizationTag` revalidation that busts the cached
 * entitlements read.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

// The Sanity CLIENT is the external boundary: reads (org documents) and writes
// (the entitlements patch) are stubbed here, and everything above it —
// `getOrganizationById` / `getAllOrganizations`, `isPlatformOrganization`, the
// platform middleware — runs for real.
const ORG_DOCS: Record<
  string,
  { _id: string; name: string; slug: string; plan?: string }
> = {
  'org-A': {
    _id: 'org-A',
    name: 'Platform Org',
    slug: 'platform',
    plan: 'enterprise',
  },
  'org-B': { _id: 'org-B', name: 'Tenant Org', slug: 'tenant' },
}

const fetchMock = vi.fn(
  async (_query: string, params?: Record<string, unknown>) => {
    if (params && typeof params.orgId === 'string') {
      return ORG_DOCS[params.orgId] ?? null
    }
    // The UNCACHED slug→id resolution behind `PLATFORM_ORG_SLUG`
    // (`getPlatformOrgId`). This — not the org document's cached `slug` — is
    // what the gate compares against; see RunKonf/platform#36.
    if (params && typeof params.slug === 'string') {
      const slug = params.slug
      return (
        Object.values(ORG_DOCS).find((org) => org.slug === slug)?._id ?? null
      )
    }
    return Object.values(ORG_DOCS)
  },
)

const commitMock = vi.fn()
const setMock = vi.fn<
  (patch: Record<string, unknown>) => { commit: typeof commitMock }
>(() => ({ commit: commitMock }))
const patchMock = vi.fn<(id: string) => { set: typeof setMock }>(() => ({
  set: setMock,
}))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: (query: string, params?: Record<string, unknown>) =>
      fetchMock(query, params),
  },
  clientWrite: { patch: (id: string) => patchMock(id) },
}))

const getConferenceMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    getConferenceMock(...args),
}))

import { revalidateTag } from 'next/cache'
import { platformRouter } from './platform'
import type { Context } from '../trpc'

function callerFor(orgIds: string[]) {
  const speaker = { _id: 'admin-1', organizerOrgIds: orgIds }
  const session = { speaker, user: { email: 'admin@x.test' } }
  return platformRouter.createCaller({
    session,
    speaker,
    user: session.user,
  } as unknown as Context)
}

/** Point the request's domain-resolved conference at `orgId`'s organization. */
function requestResolvesToOrg(orgId: string) {
  getConferenceMock.mockResolvedValue({
    conference: { _id: 'conf-1', organization: { _ref: orgId } },
    error: null,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  // The env contract: org-A ("platform" slug) IS the platform org.
  vi.stubEnv('PLATFORM_ORG_SLUG', 'platform')
  requestResolvesToOrg('org-A')
  commitMock.mockResolvedValue({})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('platform gate', () => {
  it('FORBIDDEN for an organizer whose request org is not the platform org', async () => {
    // A real tenant organizer on the tenant's own domain: the request resolves
    // to org-B, whose stored slug ("tenant") does not match the contract.
    requestResolvesToOrg('org-B')
    const caller = callerFor(['org-B'])
    await expect(caller.listOrganizations()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('fails closed for everyone when PLATFORM_ORG_SLUG is unset', async () => {
    vi.stubEnv('PLATFORM_ORG_SLUG', '')
    const caller = callerFor(['org-A'])
    await expect(caller.listOrganizations()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('lists every organization for the platform org', async () => {
    const caller = callerFor(['org-A'])
    const orgs = await caller.listOrganizations()
    expect(orgs).toHaveLength(2)
    // The gate resolved `PLATFORM_ORG_SLUG` LIVE and compared ids — never a
    // cached document's slug, and never client input.
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('slug.current == $slug'),
      { slug: 'platform' },
    )
  })

  it('REVOKES the moment the slug moves, without waiting for a cached read', async () => {
    // Another application renamed the platform org's slug: the live resolution
    // no longer finds it, so operator standing is gone on the next request —
    // no cache entry stands between the edit and the denial.
    ORG_DOCS['org-A'].slug = 'renamed'
    try {
      const caller = callerFor(['org-A'])
      await expect(caller.listOrganizations()).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    } finally {
      ORG_DOCS['org-A'].slug = 'platform'
    }
  })
})

describe('updateEntitlements', () => {
  it('is gated exactly like the list (no cross-tenant write for tenants)', async () => {
    requestResolvesToOrg('org-B')
    const caller = callerFor(['org-B'])
    await expect(
      caller.updateEntitlements({
        organizationId: 'org-B',
        plan: 'pro',
        overrides: [],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(patchMock).not.toHaveBeenCalled()
  })

  it('NOT_FOUND for an unknown target organization', async () => {
    const caller = callerFor(['org-A'])
    await expect(
      caller.updateEntitlements({
        organizationId: 'org-missing',
        plan: 'pro',
        overrides: [],
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(patchMock).not.toHaveBeenCalled()
  })

  it('rejects an override for a feature outside the closed registry', async () => {
    const caller = callerFor(['org-A'])
    await expect(
      caller.updateEntitlements({
        organizationId: 'org-B',
        plan: 'pro',
        overrides: [
          // @ts-expect-error — deliberately outside the FeatureId union
          { feature: 'no-such-feature', enabled: true },
        ],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('patches plan + keyed overrides and revalidates the org tag', async () => {
    const caller = callerFor(['org-A'])
    const res = await caller.updateEntitlements({
      organizationId: 'org-B',
      plan: 'pro',
      overrides: [
        { _key: 'k1', feature: 'graphql-api', enabled: true, note: 'pilot' },
        { feature: 'slack-mirror', enabled: false },
      ],
    })
    expect(res).toEqual({ success: true })
    expect(patchMock).toHaveBeenCalledWith('org-B')

    const patched = setMock.mock.calls[0][0] as unknown as {
      plan: string
      featureOverrides: Array<Record<string, unknown>>
    }
    expect(patched.plan).toBe('pro')
    expect(patched.featureOverrides).toHaveLength(2)
    // The supplied key survives; the missing one is backfilled; optionals that
    // were not provided are absent, not null/empty.
    expect(patched.featureOverrides[0]).toMatchObject({
      _key: 'k1',
      _type: 'featureOverride',
      feature: 'graphql-api',
      enabled: true,
      note: 'pilot',
    })
    expect(patched.featureOverrides[0]).not.toHaveProperty('expiresAt')
    expect(typeof patched.featureOverrides[1]._key).toBe('string')
    expect(patched.featureOverrides[1]._key).toBeTruthy()

    expect(revalidateTag).toHaveBeenCalledWith(
      'sanity:organization-org-B',
      'default',
    )
  })
})
