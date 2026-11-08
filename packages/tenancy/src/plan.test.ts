// Billing phase 1 (#2129): the effective-plan table, the plan gates and the
// envelope's plan claim.
import { describe, expect, it, vi } from 'vitest'
import {
  GRACE_DAYS,
  PLAN_GATES,
  createSigner,
  effectivePlan,
  generateEnvelopeKeyPair,
  planAllows,
  requirePlan,
  verifyEnvelope,
  type BillingRow,
  type PlanGate,
} from './index'

vi.mock('jose', async () => {
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  return import(pathToFileURL(require.resolve('jose')).href)
})

const NOW = Date.parse('2026-11-08T12:00:00Z')
const DAY = 86_400_000
const iso = (ms: number) => new Date(NOW + ms).toISOString()
const row = (r: Partial<BillingRow>): BillingRow => ({
  plan: 'pro',
  planSource: 'default',
  subscriptionStatus: null,
  currentPeriodEnd: null,
  compUntil: null,
  ...r,
})

describe('effectivePlan', () => {
  const STATUSES = ['active', 'past_due', 'canceled', 'incomplete', null]
  // [source, status, periodEnd, compUntil, expected]
  const cases: [string, string | null, string | null, string | null, string][] =
    [
      // comp: plan while comp_until is unset or ahead, whatever Stripe says
      ...STATUSES.flatMap((st) => [
        ['comp', st, null, null, 'pro'] as const,
        ['comp', st, null, iso(DAY), 'pro'] as const,
        ['comp', st, null, iso(-1), 'free'] as const,
        ['comp', st, null, 'not a date', 'free'] as const,
      ]),
      // stripe
      ['stripe', 'active', null, null, 'pro'],
      ['stripe', 'active', iso(-100 * DAY), null, 'pro'],
      ['stripe', 'past_due', iso(-DAY), null, 'pro'],
      ['stripe', 'past_due', iso(-(GRACE_DAYS * DAY) + 1000), null, 'pro'],
      ['stripe', 'past_due', iso(-(GRACE_DAYS * DAY)), null, 'free'],
      ['stripe', 'past_due', iso(-(GRACE_DAYS + 1) * DAY), null, 'free'],
      ['stripe', 'past_due', null, null, 'free'],
      ['stripe', 'canceled', iso(DAY), null, 'free'],
      ['stripe', 'incomplete', iso(DAY), null, 'free'],
      ['stripe', null, iso(DAY), null, 'free'],
      // a stale comp_until is ignored outside comp
      ['stripe', 'canceled', null, iso(DAY), 'free'],
      // default and unknown sources: free, whatever the columns hold
      ...STATUSES.map(
        (st) => ['default', st, iso(DAY), iso(DAY), 'free'] as const,
      ),
      ['bogus', 'active', null, null, 'free'],
      [null as unknown as string, 'active', null, null, 'free'],
    ] as [string, string | null, string | null, string | null, string][]

  it.each(cases)(
    'source %s, status %s, period end %s, comp until %s → %s',
    (planSource, subscriptionStatus, currentPeriodEnd, compUntil, want) => {
      expect(
        effectivePlan(
          row({ planSource, subscriptionStatus, currentPeriodEnd, compUntil }),
          NOW,
        ),
      ).toBe(want)
    },
  )

  it('returns the stored plan, and free for an unknown one', () => {
    for (const plan of ['free', 'basic', 'pro'])
      expect(effectivePlan(row({ plan, planSource: 'comp' }), NOW)).toBe(plan)
    expect(
      effectivePlan(row({ plan: 'enterprise', planSource: 'comp' }), NOW),
    ).toBe('free')
    expect(
      effectivePlan(
        row({ plan: null, planSource: 'stripe', subscriptionStatus: 'active' }),
        NOW,
      ),
    ).toBe('free')
  })
})

describe('plan gates', () => {
  const GATES = Object.keys(PLAN_GATES) as PlanGate[]
  it.each(GATES)(
    '%s needs basic: refused on free, allowed on basic and pro',
    (gate) => {
      expect(PLAN_GATES[gate]).toBe('basic')
      for (const p of ['free', undefined, null, 'enterprise'])
        expect(planAllows(p, gate)).toBe(false)
      expect(planAllows('basic', gate)).toBe(true)
      expect(planAllows('pro', gate)).toBe(true)
    },
  )

  it('requirePlan throws BAD_USER_INPUT, PLAN_REQUIRED and the plan', () => {
    let err: unknown
    try {
      requirePlan('free', 'api_client.create')
    } catch (e) {
      err = e
    }
    expect(err).toMatchObject({
      extensions: {
        code: 'BAD_USER_INPUT',
        reason: 'PLAN_REQUIRED',
        requiredPlan: 'basic',
      },
    })
    expect(() => requirePlan('basic', 'api_client.create')).not.toThrow()
  })
})

describe('the envelope plan claim', () => {
  const base = {
    typ: 'tenant' as const,
    orgId: 'o',
    conferenceId: null,
    userId: null,
    orgRole: null,
    scopes: [],
  }
  it.each([
    ['pro', 'pro'],
    ['basic', 'basic'],
    ['free', 'free'],
    [undefined, 'free'],
    ['enterprise', 'free'],
    [42, 'free'],
  ])('minted %j verifies as %j', async (plan, want) => {
    const keys = await generateEnvelopeKeyPair()
    const token = await (
      await createSigner(keys.privatePem)
    ).sign({
      ...base,
      ...(plan === undefined ? {} : { plan }),
    } as never)
    const e = await verifyEnvelope(token, keys.publicPem)
    expect(e).toEqual({ ...base, plan: want })
  })
})
