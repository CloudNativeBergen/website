/**
 * @vitest-environment node
 *
 * THE READ BUDGET of the workshop sign-in (#1296, #1314).
 *
 * A host's record is read LIVE from Sanity on every decision (a cached answer
 * is a delisting that has not taken effect) and the project has 250k live API
 * requests a month. So the number of reads each entry point spends is a
 * contract, counted here at the live client (`clientReadUncached.fetch`) with
 * the REAL by-id query, the real destination policy, the real seal and the
 * REAL routes, tRPC context, sign-out action and proxy in between.
 *
 * ONE READ PER DECISION, AND NO CALL TO WORKOS ON A TENANT HOST: every network
 * call goes through `fetch`, which is counted too. The only request that may
 * reach WorkOS is the auth host's callback, exchanging the code.
 *
 * These are per-REQUEST counts. How many requests a page view makes is not
 * executed anywhere in this suite. The portal page's own count (one, plus the
 * `ticketTypeRoles` read of #1294 for a signed-in attendee) is pinned in
 * `__tests__/app/workshop/portal-gate.test.tsx`.
 */
import '../../helpers/workosEnv'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { provenClaim } from '../../helpers/domainClaims'
import { beginRequest, writtenCookies } from '../../helpers/nextHeadersJar'

vi.mock('jose', async () => (await import('../../helpers/realJose')).realJose())

const h = vi.hoisted(() => ({
  /** The live client: every uncached Sanity read goes through here. */
  read: vi.fn<(query: string, params?: { id?: string }) => Promise<unknown>>(),
  claims: new Map<string, unknown>(),
}))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.read },
}))

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn(async () => null),
  // The proxy wraps its NextAuth gate with this; no /workshop path reaches it.
  auth: (handler: unknown) => handler,
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForDomain: vi.fn(),
  getConferenceForCurrentDomain: vi.fn(),
}))
vi.mock('@/lib/features/workshops', () => ({
  isWorkshopsEnabledForConference: vi.fn(async () => true),
}))
vi.mock('next/headers', () => import('../../helpers/nextHeadersJar'))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { url })
  },
}))

import { GET as signInRoute } from '@/app/(workshop)/workshop/sign-in/route'
import { GET as signUpRoute } from '@/app/(workshop)/workshop/sign-up/route'
import { GET as redeemRoute } from '@/app/(workshop)/workshop/redeem/route'
import { GET as startRoute } from '@/app/api/auth/workshop/start/route'
import { signOutOfWorkshop } from '@/app/(workshop)/workshop/actions'
import { workshopWorkOS } from '@/lib/workshop/central-sign-in/workos'
import middleware from '@/proxy'
import { createTRPCContext } from '@/server/trpc'
import {
  callback,
  handOff,
  signIn,
  startFlow,
} from '../../helpers/workshopFlow'

const AUTH = 'auth.example.org'
const TENANT = 'conf.example.org'

function get(url: string | URL, host: string, cookie?: string) {
  const headers = new Headers({ host })
  if (cookie) headers.set('cookie', cookie)
  return new NextRequest(url, { headers })
}

const exchangeCode = vi.spyOn(
  workshopWorkOS().userManagement,
  'authenticateWithCode',
)
/** Every network call there is. The exchange above is stubbed, so: none. */
const network = vi.spyOn(globalThis, 'fetch')

/** Forget what the steps so far spent: count the next request alone. */
function fromHere() {
  h.read.mockClear()
  network.mockClear()
  exchangeCode.mockClear()
}

/** One read of this host's record, by id, and nothing else from Sanity. */
function expectOneRecordRead(host: string) {
  expect(h.read).toHaveBeenCalledOnce()
  const [query, params] = h.read.mock.calls[0]
  expect(query).toContain('_type == "domainVerification" && _id == $id')
  expect(params).toEqual({ id: `domainVerification.${host}` })
}

function expectNoWorkOS() {
  expect(network).not.toHaveBeenCalled()
  expect(exchangeCode).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  beginRequest()
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('WORKSHOP_AUTH_ORIGIN', `https://${AUTH}`)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const { record, conference } = provenClaim(TENANT)
  h.claims.clear()
  h.claims.set(record._id, { ...record, conference })
  h.read.mockImplementation(
    async (_query, params) => h.claims.get(params?.id ?? '') ?? null,
  )
  network.mockRejectedValue(new Error('no network in this suite'))
  exchangeCode.mockResolvedValue({
    accessToken: `e30.${Buffer.from(JSON.stringify({ sid: 'session_01' })).toString('base64url')}.sig`,
    user: {
      id: 'user_01',
      email: 'ada@example.com',
      emailVerified: true,
      firstName: 'Ada',
      lastName: 'Lovelace',
    },
  } as never)
})

afterEach(() => {
  expect(console.error).not.toHaveBeenCalled()
  vi.unstubAllEnvs()
})

describe('a request on a tenant host: one record read, no call to WorkOS', () => {
  it.each([
    ['/workshop/sign-in', signInRoute],
    ['/workshop/sign-up', signUpRoute],
  ])('GET %s', async (path, route) => {
    const response = await route(get(`https://${TENANT}${path}`, TENANT))

    expect(response.status).toBe(307)
    expectOneRecordRead(TENANT)
    expectNoWorkOS()
  })

  it('GET /workshop/redeem', async () => {
    const { redeemUrl, browser } = await handOff(TENANT, AUTH)
    fromHere()

    const response = await redeemRoute(get(redeemUrl, TENANT, browser))

    expect(response.headers.get('location')).toBe('/workshop')
    expectOneRecordRead(TENANT)
    expectNoWorkOS()
  })

  it('a workshop.* tRPC request with a session', async () => {
    const cookie = await signIn(TENANT, AUTH)
    fromHere()

    const ctx = await createTRPCContext({
      req: get(`https://${TENANT}/api/trpc/workshop.signup`, TENANT, cookie),
    })

    expect(ctx.workosUser).toMatchObject({ id: 'user_01' })
    expectOneRecordRead(TENANT)
    expectNoWorkOS()
  })
})

describe('a request on a tenant host that needs no decision: no read at all', () => {
  it('any other tRPC request, session or not', async () => {
    const cookie = await signIn(TENANT, AUTH)
    fromHere()

    await createTRPCContext({
      req: get(`https://${TENANT}/api/trpc/sponsor.crm.list`, TENANT, cookie),
    })
    await createTRPCContext({
      req: get(`https://${TENANT}/api/trpc/workshop.signup`, TENANT),
    })

    expect(h.read).not.toHaveBeenCalled()
    expectNoWorkOS()
  })

  it('signing out', async () => {
    const cookie = await signIn(TENANT, AUTH)
    beginRequest(new Headers({ host: TENANT, cookie }))
    fromHere()

    await expect(signOutOfWorkshop()).rejects.toMatchObject({ url: '/' })

    expect(writtenCookies()).toEqual([
      '__Host-workshop-session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=lax',
    ])
    expect(h.read).not.toHaveBeenCalled()
    expectNoWorkOS()
  })

  it('the proxy, on every /workshop path', () => {
    for (const path of [
      '/workshop',
      '/workshop/sign-in',
      '/workshop/sign-up',
      '/workshop/redeem?token=x',
    ]) {
      middleware(get(`https://${TENANT}${path}`, TENANT))
    }

    expect(h.read).not.toHaveBeenCalled()
    expectNoWorkOS()
  })

  it('a sign-in, a sign-up or a redeem on the auth host', async () => {
    const { redeemUrl, browser } = await handOff(TENANT, AUTH)
    fromHere()

    for (const response of [
      await signInRoute(get(`https://${AUTH}/workshop/sign-in`, AUTH)),
      await signUpRoute(get(`https://${AUTH}/workshop/sign-up`, AUTH)),
      await redeemRoute(
        get(
          `https://${AUTH}/workshop/redeem${redeemUrl.search}`,
          AUTH,
          browser,
        ),
      ),
    ]) {
      expect(response.status).toBe(404)
    }

    expect(h.read).not.toHaveBeenCalled()
    expectNoWorkOS()
  })
})

describe('a request on the auth host: one record read, for the tenant host', () => {
  it('GET /api/auth/workshop/start', async () => {
    const begun = await signInRoute(
      get(`https://${TENANT}/workshop/sign-in`, TENANT),
    )
    fromHere()

    const response = await startRoute(get(begun.headers.get('location')!, AUTH))

    expect(response.status).toBe(307)
    expectOneRecordRead(TENANT)
    // The authorize URL and the PKCE pair are built without a network call.
    expectNoWorkOS()
  })

  it('GET /api/auth/callback, which alone calls WorkOS: once, to exchange the code', async () => {
    const flow = await startFlow(TENANT, AUTH)
    fromHere()

    const response = await callback(flow, { on: AUTH })

    expect(response.status).toBe(307)
    expectOneRecordRead(TENANT)
    expect(exchangeCode).toHaveBeenCalledOnce()
    expect(network).not.toHaveBeenCalled()
  })
})

describe('a whole sign-in', () => {
  it('spends four record reads: begin, start, callback, redeem', async () => {
    await signIn(TENANT, AUTH)

    expect(h.read).toHaveBeenCalledTimes(4)
    expect(exchangeCode).toHaveBeenCalledOnce()
    expect(network).not.toHaveBeenCalled()
  })
})
