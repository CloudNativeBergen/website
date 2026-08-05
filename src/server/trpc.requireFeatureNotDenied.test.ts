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
 * to `requireFeature` semantics and the shape `features/ticketing.ts` rule 2
 * protects — a `community` org with no `plan`, against `ticketing`'s
 * `minPlan: 'pro'`, whose own provider credentials still earn it the full
 * ticketing UI — loses the API behind that UI entirely. The `entitled by plan?`
 * assertions below pin exactly that, and a pro-plan positive control pins the
 * shape production actually has.
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

const ORG = 'organization-cloud-native-days'

/**
 * THE RULE-2 SHAPE: `community` (no `plan`), no operator override. Not entitled
 * to `ticketing` — `minPlan` is `'pro'` — but `features/ticketing.ts` rule 2
 * keeps its ticketing surface on its own provider credentials, so this gate must
 * pass it. Not a snapshot of any live tenant; production's org carries
 * `plan: 'pro'`, covered by its own positive control below.
 */
const communityOrgDocument = {
  _id: ORG,
  name: 'Cloud Native Days Norway',
  slug: 'cloud-native-days-norway',
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
    organizerOrgIds: [ORG],
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
    conference: { _id: 'conf-A', organization: { _ref: ORG } },
    error: null,
  })
  getOrganizationById.mockResolvedValue(communityOrgDocument)
})

describe('requireFeatureNotDenied refuses ONLY an operator’s explicit deny', () => {
  it('throws FORBIDDEN naming the feature, and the handler never runs', async () => {
    getOrganizationById.mockResolvedValue({
      ...communityOrgDocument,
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
      ...communityOrgDocument,
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
    expect(getOrganizationById).toHaveBeenCalledWith(ORG)
  })
})

/**
 * THE HARD CONSTRAINT. Gating must not remove a capability an org already has.
 * Each case below is an org the ENTITLEMENT resolver says is not entitled to
 * `ticketing`; each must still pass this gate.
 */
describe('requireFeatureNotDenied passes everything that is not a deny', () => {
  it('passes the rule-2 shape, which is NOT entitled by plan', async () => {
    // The premise, pinned: `requireFeature('ticketing')` here would 403,
    // because this document carries no `plan` and ticketing is `minPlan: 'pro'`.
    const entitledByPlan = computeEntitlements(
      (communityOrgDocument as { plan?: string }).plan,
      [],
      new Date(),
    )
    expect(entitledByPlan.has('ticketing')).toBe(false)
    await expect(callerFor().probe()).resolves.toEqual({ orgId: ORG })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('passes an EXPIRED deny (the override is ignored entirely)', async () => {
    getOrganizationById.mockResolvedValue({
      ...communityOrgDocument,
      featureOverrides: [
        {
          feature: 'ticketing',
          enabled: false,
          expiresAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    })
    await expect(callerFor().probe()).resolves.toEqual({ orgId: ORG })
  })

  it('passes a deny aimed at a DIFFERENT feature', async () => {
    getOrganizationById.mockResolvedValue({
      ...communityOrgDocument,
      featureOverrides: [{ feature: 'badges', enabled: false }],
    })
    await expect(callerFor().probe()).resolves.toEqual({ orgId: ORG })
  })

  it('passes a missing org document and a REJECTED read — accidents are not decisions', async () => {
    getOrganizationById.mockResolvedValue(null)
    await expect(callerFor().probe()).resolves.toEqual({ orgId: ORG })

    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    getOrganizationById.mockRejectedValue(new Error('sanity unavailable'))
    await expect(callerFor().probe()).resolves.toEqual({ orgId: ORG })
    logged.mockRestore()
  })

  /**
   * THE SHAPE PRODUCTION ACTUALLY HAS, queried from the live dataset on
   * 2026-08-05: `plan: 'pro'`, `featureOverrides: null`. It IS entitled by plan,
   * which makes it the complement of the "refuses even a PAID org" case above —
   * pro WITHOUT a deny. Deny-only passes it trivially; it is here as the
   * positive control the live shape did not previously have.
   */
  it('passes the production shape — pro plan, no overrides', async () => {
    const productionOrgDocument = {
      ...communityOrgDocument,
      plan: 'pro',
      featureOverrides: null,
    }
    // The premise, pinned in the opposite direction: `requireFeature` WOULD
    // admit this one, so it can never be the case that tightens the gate.
    expect(
      computeEntitlements(productionOrgDocument.plan, [], new Date()).has(
        'ticketing',
      ),
    ).toBe(true)
    getOrganizationById.mockResolvedValue(productionOrgDocument)
    await expect(callerFor().probe()).resolves.toEqual({ orgId: ORG })
    expect(handler).toHaveBeenCalledTimes(1)
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
