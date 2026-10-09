/**
 * @vitest-environment node
 *
 * THE READ BUDGET of the workshop sign-in (#1296).
 *
 * The host's verification and redirect-URI state are read LIVE from Sanity on
 * every decision —
 * a cached answer is a delisting that has not taken effect — and the project
 * has 250k live API requests a month. So the number of reads each entry point
 * spends is a contract, counted here at the live client
 * (`clientReadUncached.fetch`) with the REAL by-id query and sign-in policy and the
 * REAL proxy, callback, sign-in route and sign-out action in between, on the
 * real AuthKit SDK. The tRPC cases stub `authkit()` — they count the reads
 * taken BEFORE it, which is all this feature adds there.
 *
 * These are per-REQUEST counts. How many requests a page view makes is not
 * executed anywhere in this suite.
 *
 * What this does NOT count: the reads the portal already made before #1296
 * (the page's and each attendee procedure's live `ticketTypeRoles` read from
 * #1294). The page's is pinned in `__tests__/app/workshop/portal-gate.test.tsx`;
 * the procedures' are not counted by any test.
 */
import '../../helpers/workosEnv'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest, type NextFetchEvent } from 'next/server'
import { signInHost } from '../../helpers/workshopSignIn'
import { beginRequest, writtenCookies } from '../../helpers/nextHeadersJar'

const HOST = 'conf.example.org'

/** Every live read, by GROQ query. */
const liveReads = vi.fn(async (query: string, params?: { id: string }) => {
  // The one query this feature may issue: this host's own sign-in state.
  if (
    query.includes('*[_type == "domainVerification" && _id == $id][0]') &&
    query.includes('redirectUriStatus')
  ) {
    const row = signInHost(HOST)
    if (params?.id !== row.record._id) return null
    return {
      ...row.record,
      _rev: row.rev,
      redirectUriStatus: row.redirectUri.status,
      redirectUriId: row.redirectUri.id,
      redirectUriError: row.redirectUri.error,
      conference: row.conference,
    }
  }
  throw new Error(`unexpected live read: ${query}`)
})

vi.mock('@/lib/sanity/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/sanity/client')>()),
  clientReadUncached: {
    fetch: (query: string, params?: { id: string }) => liveReads(query, params),
  },
}))

vi.mock('next/headers', () => import('../../helpers/nextHeadersJar'))

// The sign-in routes and the callback also ask the workshop FEATURE gate. It
// is supplied here, ON, so ITS READS ARE NOT COUNTED BY THIS FILE. They are
// the ones every page already makes to resolve the domain conference and its
// organization, through `'use cache'` readers — plus, when
// `DOMAIN_VERIFICATION_ENFORCE_ROUTING` is on, that resolution's own live
// ownership check.
vi.mock('@/lib/conference/sanity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/conference/sanity')>()),
  getConferenceForCurrentDomain: async () => ({
    conference: { _id: 'conf-1', organization: { _ref: 'org-1' } },
    error: null,
  }),
}))
vi.mock('@/lib/features/workshops', () => ({
  isWorkshopsEnabledForConference: async () => true,
}))

vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  getAuthSession: vi.fn(async () => null),
}))

import middleware from '@/proxy'
import { GET as callback } from '@/app/api/auth/callback/route'
import { GET as signIn } from '@/app/(workshop)/workshop/sign-in/route'
import { signOutOfWorkshop } from '@/app/(workshop)/workshop/actions'
import { createTRPCContext } from '@/server/trpc'
import * as sdk from '@workos-inc/authkit-nextjs'

const exchangeCode = vi.spyOn(
  sdk.getWorkOS().userManagement,
  'authenticateWithCode',
)

function request(
  path: string,
  init: { host?: string; cookie?: string } = {},
): NextRequest {
  const host = init.host ?? HOST
  const headers = new Headers({
    host,
    accept: 'text/html',
    ...(init.cookie ? { cookie: init.cookie } : {}),
  })
  beginRequest(headers)
  return new NextRequest(`https://${host}${path}`, { headers })
}

const event = {} as NextFetchEvent

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV', 'production')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('live Sanity reads per entry point', () => {
  it('a /workshop request through the proxy: 1', async () => {
    const response = (await middleware(request('/workshop'), event)) as Response

    // It really did reach the SDK, which hands the page this host's callback.
    expect(response.headers.get('x-middleware-request-x-redirect-uri')).toBe(
      `https://${HOST}/api/auth/callback`,
    )
    expect(liveReads).toHaveBeenCalledTimes(1)
  })

  it('the /workshop page on a host that may not sign in: 1 — marked, and the page reads nothing more', async () => {
    const response = (await middleware(
      request('/workshop', { host: 'unverified.example.org' }),
      event,
    )) as Response

    // Let through to the unavailable view (#1298), without the SDK; the page
    // stops at the mark, so this proxy read is the whole cost.
    expect(
      response.headers.get(
        'x-middleware-request-x-workshop-sign-in-unavailable',
      ),
    ).toBe('1')
    expect(liveReads).toHaveBeenCalledTimes(1)
  })

  it('a /workshop/sign-in request on a host that may not sign in: 1, and nothing after it', async () => {
    // /workshop itself is now let through marked (#1298), covered in the proxy tests.
    const response = (await middleware(
      request('/workshop/sign-in', { host: 'unverified.example.org' }),
      event,
    )) as Response

    expect(response.status).toBe(404)
    expect(liveReads).toHaveBeenCalledTimes(1)
  })

  it('a request with a malformed Host: 0', async () => {
    // /workshop itself is now let through marked (#1298), covered in the proxy tests.
    const malformed = new NextRequest(`https://${HOST}/workshop/sign-in`, {
      headers: new Headers({ host: `attacker@${HOST}` }),
    })

    expect(((await middleware(malformed, event)) as Response).status).toBe(404)
    expect(liveReads).not.toHaveBeenCalled()
  })

  it('the callback: 1', async () => {
    const started = await signIn(request('/workshop/sign-in'))
    const state = new URL(started.headers.get('location')!).searchParams.get(
      'state',
    )!
    const verifier = decodeURIComponent(writtenCookies()[0].split(';')[0])
    exchangeCode.mockResolvedValue({
      accessToken: 'a.b.c',
      refreshToken: 'r',
      user: { id: 'user_01', email: 'ada@example.com' },
    } as never)
    liveReads.mockClear()

    const url = `/api/auth/callback?code=c&state=${encodeURIComponent(state)}`
    const response = await callback(request(url, { cookie: verifier }))

    expect(response.status).toBe(307)
    expect(exchangeCode).toHaveBeenCalledOnce()
    expect(liveReads).toHaveBeenCalledTimes(1)
  })

  it('starting a sign-in from /workshop/sign-in: 2 (the proxy, then the route)', async () => {
    const through = (await middleware(
      request('/workshop/sign-in'),
      event,
    )) as Response
    expect(through.headers.get('x-middleware-next')).toBe('1')

    const response = await signIn(request('/workshop/sign-in'))

    expect(response.status).toBe(307)
    expect(liveReads).toHaveBeenCalledTimes(2)
  })

  it('signing out: 2 (the proxy for the POST, then the action)', async () => {
    // The sign-out form posts a server action to the page's own URL.
    const post = new NextRequest(`https://${HOST}/workshop`, {
      method: 'POST',
      headers: new Headers({ host: HOST, 'next-action': 'action-id' }),
    })
    await middleware(post, event)
    expect(liveReads).toHaveBeenCalledTimes(1)

    request('/workshop')
    // No session to end: the SDK falls through to a plain redirect, which is
    // all this case needs — the read happens before the SDK is entered.
    await signOutOfWorkshop().catch(() => {})

    expect(liveReads).toHaveBeenCalledTimes(2)
  })
})

describe('live Sanity reads per tRPC request', () => {
  const authkit = vi.spyOn(sdk, 'authkit')

  beforeEach(() => {
    authkit.mockResolvedValue({
      session: { user: { id: 'user_01', email: 'ada@example.com' } },
    } as never)
  })

  it('a workshop.* batch from a signed-in browser: 1, however many procedures it carries', async () => {
    const ctx = await createTRPCContext({
      req: request(
        '/api/trpc/workshop.list,workshop.getMySignups,workshop.announcements',
        { cookie: 'wos-session=sealed' },
      ),
    })

    expect(ctx.workosUser).toMatchObject({ id: 'user_01' })
    expect(liveReads).toHaveBeenCalledTimes(1)
  })

  it('any other tRPC request from that same browser: 0', async () => {
    for (const procedures of [
      'sponsor.crm.list',
      'notification.list,conference.getCurrent',
      'proposal.admin.list',
    ]) {
      await createTRPCContext({
        req: request(`/api/trpc/${procedures}`, {
          cookie: 'wos-session=sealed',
        }),
      })
    }

    expect(liveReads).not.toHaveBeenCalled()
    expect(authkit).not.toHaveBeenCalled()
  })

  it('a workshop.* request with no WorkOS cookie (an organizer on NextAuth): 0', async () => {
    await createTRPCContext({
      req: request('/api/trpc/workshop.admin.getAllSignups'),
    })

    expect(liveReads).not.toHaveBeenCalled()
  })
})
