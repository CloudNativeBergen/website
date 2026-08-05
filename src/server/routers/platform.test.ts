/**
 * @vitest-environment node
 *
 * `platform` router — the cross-tenant management surface. The critical
 * property is the SERVER-SIDE platform gate: an ordinary tenant organizer
 * (admin of a non-platform org) gets FORBIDDEN on every procedure, because the
 * client hiding the card is presentation, not security. The gate runs FOR REAL
 * here — the `PLATFORM_ORG_ID` env is compared, as a document id, against the
 * request's org, driving `isPlatformOrganization` (RunKonf/platform#43: standing
 * keys on the immutable id, never a customer-writable slug, and reads no Sanity
 * at all); only the external boundaries (the Sanity client, Next's cache API,
 * the domain-conference resolution) are mocked. Also covers the
 * updateEntitlements write path: keyed overrides, empty-optional stripping, and
 * the `organizationTag` revalidation that busts the cached entitlements read.
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
    // A working slug→id resolver is deliberately left wired up so the
    // slug-independence test below is a real TRIPWIRE: if the gate ever reverts
    // to slug resolution (pre-#43), it would find this and grant standing off a
    // customer-writable field — which that test forbids.
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
  // The env contract: org-A's document id IS the platform org (#43).
  vi.stubEnv('PLATFORM_ORG_ID', 'org-A')
  requestResolvesToOrg('org-A')
  commitMock.mockResolvedValue({})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('platform gate', () => {
  it('FORBIDDEN for an organizer whose request org is not the platform org', async () => {
    // A real tenant organizer on the tenant's own domain: the request resolves
    // to org-B, whose id ("org-B") is not the configured platform org id.
    requestResolvesToOrg('org-B')
    const caller = callerFor(['org-B'])
    await expect(caller.listOrganizations()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('fails closed for everyone when PLATFORM_ORG_ID is unset', async () => {
    vi.stubEnv('PLATFORM_ORG_ID', '')
    const caller = callerFor(['org-A'])
    await expect(caller.listOrganizations()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('lists every organization for the platform org', async () => {
    const caller = callerFor(['org-A'])
    const orgs = await caller.listOrganizations()
    expect(orgs).toHaveLength(2)
    // The gate resolved the REQUEST org via the domain conference and compared
    // ids — it never did a slug lookup and never trusted client input.
    expect(getConferenceMock).toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('slug.current'),
      expect.anything(),
    )
  })

  it('keys on PLATFORM_ORG_ID, never a slug — a second org holding the slug cannot gain standing (SABOTAGE)', async () => {
    // Adversarial fixture: a STRAY PLATFORM_ORG_SLUG names org-B's slug, and the
    // slug→id resolver is wired up (see fetchMock). A pre-#43 slug-based gate
    // would resolve "tenant" → org-B and grant the org-B organizer on the org-B
    // domain. The id-based gate must still deny: org-B's id is not org-A.
    vi.stubEnv('PLATFORM_ORG_SLUG', 'tenant')
    requestResolvesToOrg('org-B')
    await expect(
      callerFor(['org-B']).listOrganizations(),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    // …and the configured platform org (org-A) is unaffected by the stray slug.
    requestResolvesToOrg('org-A')
    await expect(
      callerFor(['org-A']).listOrganizations(),
    ).resolves.toHaveLength(2)
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('slug.current'),
      expect.anything(),
    )
  })

  it('SURVIVES a slug rename — standing binds to the id, not the slug (#43)', async () => {
    // Another application renames the platform org's slug in kontroll. The
    // pre-#43 slug contract would have silently revoked operator standing here;
    // binding to the immutable id means the rename changes nothing.
    ORG_DOCS['org-A'].slug = 'renamed-by-a-customer'
    try {
      const caller = callerFor(['org-A'])
      await expect(caller.listOrganizations()).resolves.toHaveLength(2)
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
