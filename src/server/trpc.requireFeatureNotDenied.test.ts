/**
 * @vitest-environment node
 *
 * `requireFeatureNotDenied` — the KILL-SWITCH gate (#836). Composed onto the
 * org-scoped admin waist exactly as consumers use it
 * (`adminProcedure.use(requireFeatureNotDenied(...))`) and driven through a test
 * router.
 *
 * The gate's INPUT is a real read: `@/lib/features/platform-default` and
 * `@/lib/features/entitlements` run for real over a mocked
 * `getOrganizationById`, so these cases exercise the same override/expiry
 * semantics the ticketing pages do rather than a stubbed boolean.
 *
 * The distinction under test is NARROW and load-bearing: an operator's active
 * `enabled: false` refuses; every other shape of "not entitled" passes. Widen it
 * to `requireFeature` semantics and this deployment's own tenant — no `plan`, so
 * `community`, against `ticketing`'s `minPlan: 'pro'` — loses ticketing
 * entirely. The `entitled by plan?` assertions below pin exactly that.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getOrganizationById = vi.fn()
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: (...args: unknown[]) => getOrganizationById(...args),
  getOrganizationRefForCurrentConference: () => null,
}))

const getConferenceMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    getConferenceMock(...args),
}))

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))

import {
  router,
  adminProcedure,
  requireFeatureNotDenied,
  type Context,
} from './trpc'
import { computeEntitlements } from '@/lib/features/entitlements'

/** The tenant this deployment actually runs (migration 044): no plan, no overrides. */
const CNDN_ORG = 'organization-cloud-native-days'
const cndnDocument = {
  _id: CNDN_ORG,
  name: 'Cloud Native Days Norway',
  slug: 'cloud-native-days',
}

const handler = vi.fn()

const testRouter = router({
  probe: adminProcedure
    .use(requireFeatureNotDenied('ticketing'))
    .query(({ ctx }) => {
      handler()
      return { orgId: ctx.orgId }
    }),
})

function callerFor(
  speaker: {
    _id: string
    isOrganizer?: boolean
    organizerOrgIds?: string[]
  } = {
    _id: 'admin',
    organizerOrgIds: [CNDN_ORG],
  },
) {
  const session = { speaker, user: { email: 'u@x.test' } }
  return testRouter.createCaller({
    session,
    speaker,
    user: session.user,
  } as unknown as Context)
}

beforeEach(() => {
  vi.clearAllMocks()
  getConferenceMock.mockResolvedValue({
    conference: { _id: 'conf-A', organization: { _ref: CNDN_ORG } },
    error: null,
  })
  getOrganizationById.mockResolvedValue(cndnDocument)
})

describe('requireFeatureNotDenied refuses ONLY an operator’s explicit deny', () => {
  it('throws FORBIDDEN naming the feature, and the handler never runs', async () => {
    getOrganizationById.mockResolvedValue({
      ...cndnDocument,
      featureOverrides: [{ feature: 'ticketing', enabled: false }],
    })
    await expect(callerFor().probe()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      // Asserted verbatim so the org-scoped waist's own FORBIDDEN ("Admin
      // privileges required") cannot satisfy this case by accident.
      message:
        'The "ticketing" feature has been switched off for this organization',
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it('refuses even a PAID org — a deny beats the plan that sells it', async () => {
    getOrganizationById.mockResolvedValue({
      ...cndnDocument,
      plan: 'pro',
      featureOverrides: [{ feature: 'ticketing', enabled: false }],
    })
    await expect(callerFor().probe()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: expect.stringContaining('switched off'),
    })
  })

  it('keys on the REQUEST-resolved org, never on client input', async () => {
    await callerFor().probe()
    expect(getOrganizationById).toHaveBeenCalledWith(CNDN_ORG)
  })
})

/**
 * THE HARD CONSTRAINT. Gating must not remove capability from the tenant that
 * exists. Each case below is an org the ENTITLEMENT resolver says is not
 * entitled to `ticketing`; each must still pass this gate.
 */
describe('requireFeatureNotDenied passes everything that is not a deny', () => {
  it('passes the live CNDN-shaped org, which is NOT entitled by plan', async () => {
    // The premise, pinned: `requireFeature('ticketing')` here would 403,
    // because this document carries no `plan` and ticketing is `minPlan: 'pro'`.
    const entitledByPlan = computeEntitlements(
      (cndnDocument as { plan?: string }).plan,
      [],
      new Date(),
    )
    expect(entitledByPlan.has('ticketing')).toBe(false)
    await expect(callerFor().probe()).resolves.toEqual({ orgId: CNDN_ORG })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('passes an EXPIRED deny (the override is ignored entirely)', async () => {
    getOrganizationById.mockResolvedValue({
      ...cndnDocument,
      featureOverrides: [
        {
          feature: 'ticketing',
          enabled: false,
          expiresAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    })
    await expect(callerFor().probe()).resolves.toEqual({ orgId: CNDN_ORG })
  })

  it('passes a deny aimed at a DIFFERENT feature', async () => {
    getOrganizationById.mockResolvedValue({
      ...cndnDocument,
      featureOverrides: [{ feature: 'badges', enabled: false }],
    })
    await expect(callerFor().probe()).resolves.toEqual({ orgId: CNDN_ORG })
  })

  it('passes a missing org document and a REJECTED read — accidents are not decisions', async () => {
    getOrganizationById.mockResolvedValue(null)
    await expect(callerFor().probe()).resolves.toEqual({ orgId: CNDN_ORG })

    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    getOrganizationById.mockRejectedValue(new Error('sanity unavailable'))
    await expect(callerFor().probe()).resolves.toEqual({ orgId: CNDN_ORG })
    logged.mockRestore()
  })
})

/**
 * THE HOLE, NAMED. This gate does not fail closed on an unresolvable org (a
 * flaky read must not black out a working tenant). What closes it is the waist
 * it composes onto — so the composition, not this middleware, is the thing that
 * must not be undone.
 */
describe('composition with the admin waist', () => {
  it('is never reached for a non-organizer: the waist refuses first', async () => {
    const caller = callerFor({ _id: 'speaker', organizerOrgIds: [] })
    await expect(caller.probe()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Admin privileges required',
    })
    expect(getOrganizationById).not.toHaveBeenCalled()
  })

  it('is never reached for an unresolvable org: the waist FAILS CLOSED there', async () => {
    getConferenceMock.mockResolvedValue({
      conference: { _id: 'conf-A' },
      error: null,
    })
    const caller = callerFor({ _id: 'legacy-admin', isOrganizer: true })
    await expect(caller.probe()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Admin privileges required',
    })
    expect(handler).not.toHaveBeenCalled()
  })
})
