/**
 * @vitest-environment node
 *
 * `requireFeature` — the per-organization feature gate. Composed onto the
 * org-scoped admin waist exactly as consumers will use it
 * (`adminProcedure.use(requireFeature(...))`) and driven through a test router
 * with a fake ctx: an entitled org passes (and keeps `ctx.orgId`), a
 * non-entitled org gets FORBIDDEN naming the feature, and the entitlement read
 * is keyed on the REQUEST-resolved org, never client input.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getEntitlementsMock = vi.fn()
vi.mock('@/lib/features/entitlements', () => ({
  getEntitlementsForOrganization: (...args: unknown[]) =>
    getEntitlementsMock(...args),
}))

const getConferenceMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    getConferenceMock(...args),
}))

import { router, adminProcedure, requireFeature, type Context } from './trpc'

const testRouter = router({
  probe: adminProcedure
    .use(requireFeature('graphql-api'))
    .query(({ ctx }) => ({ orgId: ctx.orgId })),
})

function callerFor(speaker: {
  _id: string
  isOrganizer?: boolean
  organizerOrgIds?: string[]
}) {
  const session = { speaker, user: { email: 'u@x.test' } }
  return testRouter.createCaller({
    session,
    speaker,
    user: session.user,
  } as unknown as Context)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  getConferenceMock.mockResolvedValue({
    conference: { _id: 'conf-A', organization: { _ref: 'org-A' } },
    error: null,
  })
})

describe('requireFeature', () => {
  it('passes when the org is entitled and exposes the resolved orgId', async () => {
    getEntitlementsMock.mockResolvedValue(new Set(['graphql-api']))
    const caller = callerFor({ _id: 'admin', organizerOrgIds: ['org-A'] })
    await expect(caller.probe()).resolves.toEqual({ orgId: 'org-A' })
    expect(getEntitlementsMock).toHaveBeenCalledWith('org-A')
  })

  it('throws FORBIDDEN naming the feature when the org is not entitled', async () => {
    getEntitlementsMock.mockResolvedValue(new Set())
    const caller = callerFor({ _id: 'admin', organizerOrgIds: ['org-A'] })
    await expect(caller.probe()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: expect.stringContaining('"graphql-api"'),
    })
  })

  it('fails closed before the entitlement read when the org is unresolvable', async () => {
    // Legacy-token bridge admin (no organizerOrgIds, global flag) passes the
    // waist even with a null org — the feature gate must still deny.
    getConferenceMock.mockResolvedValue({
      conference: { _id: 'conf-A' },
      error: null,
    })
    const caller = callerFor({ _id: 'legacy-admin', isOrganizer: true })
    await expect(caller.probe()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(getEntitlementsMock).not.toHaveBeenCalled()
  })

  it('never reaches the gate for a non-organizer (the waist rejects first)', async () => {
    const caller = callerFor({ _id: 'speaker', organizerOrgIds: [] })
    await expect(caller.probe()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(getEntitlementsMock).not.toHaveBeenCalled()
  })
})
