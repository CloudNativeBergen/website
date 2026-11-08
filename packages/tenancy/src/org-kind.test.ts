// Org kind (#2150): demo is pro, the envelope claim, and the recipient rule.
import { describe, expect, it, vi } from 'vitest'
import {
  allowedRecipients,
  createSigner,
  effectivePlan,
  generateEnvelopeKeyPair,
  verifyEnvelope,
  type Envelope,
} from './index'

vi.mock('jose', async () => {
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  return import(pathToFileURL(require.resolve('jose')).href)
})

describe('effectivePlan for a demo org', () => {
  it.each([
    { plan: 'free', planSource: 'default', subscriptionStatus: null },
    { plan: 'basic', planSource: 'stripe', subscriptionStatus: 'canceled' },
    {
      plan: 'basic',
      planSource: 'comp',
      subscriptionStatus: null,
      compUntil: '2000-01-01T00:00:00Z',
    },
  ])('is pro whatever the billing says: %j', (r) => {
    const row = { currentPeriodEnd: null, compUntil: null, ...r }
    expect(effectivePlan({ ...row, kind: 'demo' })).toBe('pro')
    expect(effectivePlan({ ...row, kind: 'customer' })).not.toBe('pro')
    expect(effectivePlan(row)).not.toBe('pro')
  })
})

describe('the envelope orgKind claim', () => {
  const base = {
    typ: 'tenant' as const,
    orgId: 'o',
    conferenceId: null,
    userId: null,
    orgRole: null,
    scopes: [],
  }
  it.each([
    ['demo', 'demo'],
    ['customer', 'customer'],
    [undefined, 'customer'],
    ['operator', 'customer'],
    [true, 'customer'],
  ])('minted %j verifies as %j', async (orgKind, want) => {
    const keys = await generateEnvelopeKeyPair()
    const token = await (
      await createSigner(keys.privatePem)
    ).sign({
      ...base,
      ...(orgKind === undefined ? {} : { orgKind }),
    } as never)
    const e = await verifyEnvelope(token, keys.publicPem)
    expect(e).toEqual({ ...base, plan: 'free', orgKind: want })
  })
})

describe('allowedRecipients', () => {
  const to = ['Member@x.no', 'stranger@y.no', 'other@x.no']
  const members = ['member@x.no', 'other@x.no']
  const env = (orgKind?: 'demo' | 'customer'): Envelope => ({
    typ: 'tenant',
    orgId: 'o',
    conferenceId: null,
    userId: null,
    orgRole: null,
    scopes: [],
    orgKind,
  })

  it('drops non-members for a demo org, case-insensitively', () => {
    expect(allowedRecipients('demo', to, members)).toEqual([
      'Member@x.no',
      'other@x.no',
    ])
    expect(allowedRecipients(env('demo'), to, members)).toEqual([
      'Member@x.no',
      'other@x.no',
    ])
    expect(allowedRecipients('demo', to, [])).toEqual([])
  })

  it('passes a customer org through unchanged, missing kind included', () => {
    for (const k of [
      'customer',
      undefined,
      null,
      env(),
      env('customer'),
    ] as const)
      expect(allowedRecipients(k, to, [])).toEqual(to)
  })
})
