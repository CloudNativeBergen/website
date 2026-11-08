import { beforeEach, describe, expect, it, vi } from 'vitest'

const w = vi.hoisted(() => ({
  host: vi.fn<() => Promise<string | null>>(),
  jwt: vi.fn<() => Promise<string | null>>(),
  plan: vi.fn<(host: string, jwt: string) => Promise<string>>(),
}))
vi.mock('@/lib/konf-api/conference-write', () => ({
  requestHost: () => w.host(),
  identityJwt: () => w.jwt(),
  orgPlanViaApi: (h: string, j: string) => w.plan(h, j),
}))

const { requireOrgPlan } = await import('./index')
const { structuredErrorData } = await import('@/server/errors')

beforeEach(() => {
  vi.resetAllMocks()
  w.host.mockResolvedValue('conf.example')
  w.jwt.mockResolvedValue('jwt')
})

describe('requireOrgPlan (#2129)', () => {
  it.each(['free', 'enterprise', ''])(
    'refuses plan %j with FORBIDDEN, PLAN_REQUIRED and basic',
    async (plan) => {
      w.plan.mockResolvedValue(plan)
      const err = await requireOrgPlan('conference.publish_ticketed').catch(
        (e) => e,
      )
      expect(err).toMatchObject({ code: 'FORBIDDEN' })
      expect(structuredErrorData(err)).toEqual({
        code: 'FORBIDDEN',
        reason: 'PLAN_REQUIRED',
        requiredPlan: 'basic',
      })
    },
  )

  it.each(['basic', 'pro'])(
    'allows %s, asking as the organizer',
    async (plan) => {
      w.plan.mockResolvedValue(plan)
      await expect(
        requireOrgPlan('domain.connect_custom'),
      ).resolves.toBeUndefined()
      expect(w.plan).toHaveBeenCalledWith('conf.example', 'jwt')
    },
  )

  it.each([
    [
      'the gateway fails',
      () => w.plan.mockRejectedValue(new Error('HTTP 503')),
    ],
    ['there is no identity session', () => w.jwt.mockResolvedValue(null)],
    ['there is no host', () => w.host.mockResolvedValue(null)],
  ])('fails closed (retryable) when %s', async (_, arrange) => {
    w.plan.mockResolvedValue('pro')
    arrange()
    await expect(requireOrgPlan('domain.connect_custom')).rejects.toMatchObject(
      {
        code: 'SERVICE_UNAVAILABLE',
      },
    )
  })
})
