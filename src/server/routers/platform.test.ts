/**
 * @vitest-environment node
 *
 * `platform` router — the cross-tenant management surface. The critical
 * property is the SERVER-SIDE platform gate: an ordinary tenant organizer
 * (admin of a non-platform org) gets FORBIDDEN on every procedure, because the
 * client hiding the card is presentation, not security. Also covers the
 * updateEntitlements write path: keyed overrides, empty-optional stripping,
 * and the `organizationTag` revalidation that busts the cached entitlements
 * read.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

const isPlatformOrganizationMock = vi.fn()
vi.mock('@/lib/features/platform', () => ({
  isPlatformOrganization: (...args: unknown[]) =>
    isPlatformOrganizationMock(...args),
}))

const getAllOrganizationsMock = vi.fn()
const getOrganizationByIdMock = vi.fn()
vi.mock('@/lib/organization/sanity', () => ({
  getAllOrganizations: (...args: unknown[]) => getAllOrganizationsMock(...args),
  getOrganizationById: (...args: unknown[]) => getOrganizationByIdMock(...args),
  // Imported by the authz waist's module graph; not exercised here.
  getOrganizationRefForCurrentConference: vi.fn(),
  getOrganizationRefViaParentConference: vi.fn(),
  organizationField: vi.fn(() => ({})),
  organizationReference: vi.fn(),
}))

const commitMock = vi.fn()
const setMock = vi.fn<
  (patch: Record<string, unknown>) => { commit: typeof commitMock }
>(() => ({ commit: commitMock }))
const patchMock = vi.fn<(id: string) => { set: typeof setMock }>(() => ({
  set: setMock,
}))
vi.mock('@/lib/sanity/client', () => ({
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

beforeEach(() => {
  vi.clearAllMocks()
  getConferenceMock.mockResolvedValue({
    conference: { _id: 'conf-A', organization: { _ref: 'org-A' } },
    error: null,
  })
  getAllOrganizationsMock.mockResolvedValue([
    {
      _id: 'org-A',
      name: 'Platform Org',
      slug: 'platform',
      plan: 'enterprise',
    },
    { _id: 'org-B', name: 'Tenant Org', slug: 'tenant', plan: 'community' },
  ])
  getOrganizationByIdMock.mockResolvedValue({
    _id: 'org-B',
    name: 'Tenant Org',
    slug: 'tenant',
  })
  commitMock.mockResolvedValue({})
})

describe('platform gate', () => {
  it('FORBIDDEN for an organizer whose request org is not the platform org', async () => {
    isPlatformOrganizationMock.mockResolvedValue(false)
    const caller = callerFor(['org-A'])
    await expect(caller.listOrganizations()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(getAllOrganizationsMock).not.toHaveBeenCalled()
  })

  it('lists every organization for the platform org', async () => {
    isPlatformOrganizationMock.mockResolvedValue(true)
    const caller = callerFor(['org-A'])
    const orgs = await caller.listOrganizations()
    expect(orgs).toHaveLength(2)
    expect(isPlatformOrganizationMock).toHaveBeenCalledWith('org-A')
  })
})

describe('updateEntitlements', () => {
  it('is gated exactly like the list (no cross-tenant write for tenants)', async () => {
    isPlatformOrganizationMock.mockResolvedValue(false)
    const caller = callerFor(['org-A'])
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
    isPlatformOrganizationMock.mockResolvedValue(true)
    getOrganizationByIdMock.mockResolvedValue(null)
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
    isPlatformOrganizationMock.mockResolvedValue(true)
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
    isPlatformOrganizationMock.mockResolvedValue(true)
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
