import { beforeEach, describe, expect, it, vi } from 'vitest'

const w = vi.hoisted(() => ({
  host: vi.fn<() => Promise<string | null>>(),
  jwt: vi.fn<() => Promise<string | null>>(),
  ctx: vi.fn<
    (
      host: string,
      jwt: string,
    ) => Promise<{ orgId: string; plan: string; isOwner: boolean }>
  >(),
}))
const plan = (p: string, isOwner = true) =>
  w.ctx.mockResolvedValue({ orgId: 'org_1', plan: p, isOwner })
vi.mock('@/lib/konf-api/conference-write', () => ({
  requestHost: () => w.host(),
  identityJwt: () => w.jwt(),
  orgContextViaApi: (h: string, j: string) => w.ctx(h, j),
}))

const { requireOrgPlan, sellsTickets } = await import('./index')
const { structuredErrorData } = await import('@/server/errors')

beforeEach(() => {
  vi.resetAllMocks()
  w.host.mockResolvedValue('conf.example')
  w.jwt.mockResolvedValue('jwt')
})

describe('requireOrgPlan (#2129)', () => {
  it.each(['free', 'enterprise', ''])(
    'refuses plan %j with FORBIDDEN, PLAN_REQUIRED and basic',
    async (p) => {
      plan(p, false)
      const err = await requireOrgPlan('conference.publish_ticketed').catch(
        (e) => e,
      )
      expect(err).toMatchObject({ code: 'FORBIDDEN' })
      expect(structuredErrorData(err)).toEqual({
        code: 'FORBIDDEN',
        reason: 'PLAN_REQUIRED',
        requiredPlan: 'basic',
        orgId: 'org_1',
        isOwner: false,
      })
    },
  )

  it.each(['basic', 'pro'])('allows %s, asking as the organizer', async (p) => {
    plan(p)
    await expect(
      requireOrgPlan('domain.connect_custom'),
    ).resolves.toBeUndefined()
    expect(w.ctx).toHaveBeenCalledWith('conf.example', 'jwt')
  })

  it.each([
    ['the gateway fails', () => w.ctx.mockRejectedValue(new Error('HTTP 503'))],
    ['there is no identity session', () => w.jwt.mockResolvedValue(null)],
    ['there is no host', () => w.host.mockResolvedValue(null)],
  ])('fails closed (retryable) when %s', async (_, arrange) => {
    plan('pro')
    arrange()
    await expect(requireOrgPlan('domain.connect_custom')).rejects.toMatchObject(
      {
        code: 'SERVICE_UNAVAILABLE',
      },
    )
  })
})

const SELLS_CASES: [Record<string, unknown>, boolean][] = [
  [{}, false],
  [{ checkinEventId: 7 }, true],
  [{ ticketingProvider: 'tito', titoEventSlug: 'ev' }, true],
  [{ ticketingProvider: 'tito', checkinEventId: 7 }, false],
  // #2247: native ticketing has no vendor event; choosing it is selling.
  [{ ticketingProvider: 'konf' }, true],
  [{ ticketingProvider: 'konf', checkinEventId: null }, true],
]

describe('sellsTickets (#2141, #2247)', () => {
  it.each(SELLS_CASES)('%j -> %s', (c, want) => {
    expect(sellsTickets(c)).toBe(want)
  })
})
