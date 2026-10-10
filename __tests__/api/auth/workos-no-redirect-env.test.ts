/**
 * @vitest-environment node
 *
 * The workshop portal's sign-in with NO redirect URI in the environment
 * (#1299): `NEXT_PUBLIC_WORKOS_REDIRECT_URI` and `WORKOS_REDIRECT_URI` are both
 * unset, which is how production runs once they are removed. Against the REAL
 * `@workos-inc/authkit-nextjs` and its own `jose`.
 *
 * Every other real-SDK suite loads the SDK with a decoy in that variable, to
 * show a set value is never used. This one shows the other half: nothing the
 * portal does needs a value there. One attendee goes through every SDK entry
 * point on a host that can sign in — the proxy, the sign-in and sign-up
 * routes, the callback, tRPC and the sign-out action — and each one works from
 * the request's own host.
 *
 * Boundaries supplied, as in `workos-sign-in-out.test.ts`: the host's Sanity
 * sign-in-standing row, the conference and feature gate (ON), WorkOS's token
 * endpoint and key set, and `next/headers` (see `nextHeadersJar.ts`).
 */
import '../../helpers/workosEnvWithoutRedirectUri'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest, type NextFetchEvent } from 'next/server'
import { signInHost, signInHostsById } from '../../helpers/workshopSignIn'
import {
  beginRequest,
  presentCookie,
  writtenCookies,
} from '../../helpers/nextHeadersJar'

// The SDK's own `jose`: sign-out and a refresh read the access token.
vi.mock('jose', () => import('../../helpers/sdkJose'))

// tRPC asks NextAuth for a session too; there is none. The proxy needs the
// rest of the module as it is.
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  getAuthSession: vi.fn(async () => null),
}))

const HOST = 'conf.example.org'
const CALLBACK = `https://${HOST}/api/auth/callback`
const SESSION_ID = 'session_01HXYZ'

vi.mock('@/lib/domain-verification/sanity', () => ({
  getRedirectUriSyncRow: (id: string) =>
    signInHostsById([signInHost(HOST)])(id),
}))

vi.mock('next/headers', () => import('../../helpers/nextHeadersJar'))

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

import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/msw/server'
import middleware from '@/proxy'
import { GET as signIn } from '@/app/(workshop)/workshop/sign-in/route'
import { GET as signUp } from '@/app/(workshop)/workshop/sign-up/route'
import { GET as callback } from '@/app/api/auth/callback/route'
import { signOutOfWorkshop } from '@/app/(workshop)/workshop/actions'
import { createTRPCContext } from '@/server/trpc'
import { authkitMiddleware, getWorkOS } from '@workos-inc/authkit-nextjs'

const exchangeCode = vi.spyOn(
  getWorkOS().userManagement,
  'authenticateWithCode',
)
const refresh = vi.spyOn(
  getWorkOS().userManagement,
  'authenticateWithRefreshToken',
)

const event = {} as NextFetchEvent

/** An unsigned JWT-shaped access token carrying the claims the SDK reads. */
function accessToken(claims: Record<string, unknown>): string {
  const part = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'RS256', typ: 'JWT' })}.${part(claims)}.signature`
}

/** Begin a "request" on the host: fresh cookie jar, these request headers. */
function request(path: string, headers: Record<string, string> = {}) {
  const requestHeaders = new Headers({ host: HOST, ...headers })
  beginRequest(requestHeaders)
  return new NextRequest(`https://${HOST}${path}`, { headers: requestHeaders })
}

/** A cookie's attributes, without its name=value pair and its `Expires` date. */
function attributes(cookie: string): string[] {
  return cookie
    .split('; ')
    .slice(1)
    .filter((attribute) => !attribute.startsWith('Expires='))
}

/** Start on `/workshop/sign-in`, return through the callback. */
async function completeSignIn() {
  const started = await signIn(request('/workshop/sign-in'))
  const state = new URL(started.headers.get('location')!).searchParams.get(
    'state',
  )!
  const verifier = decodeURIComponent(writtenCookies()[0].split(';')[0])

  beginRequest(new Headers({ host: HOST }))
  const url = new URL(CALLBACK)
  url.searchParams.set('code', 'code_from_workos')
  url.searchParams.set('state', state)
  const finished = await callback(
    new NextRequest(url, {
      headers: new Headers({ host: HOST, cookie: verifier }),
    }),
  )
  const sessionCookie = writtenCookies().find((cookie) =>
    cookie.startsWith('wos-session='),
  )!
  const sealed = decodeURIComponent(
    sessionCookie.split(';')[0].slice('wos-session='.length),
  )
  return { finished, sessionCookie, sealed }
}

/** Where a thrown `redirect()` points, read the way Next reads it. */
async function redirectTarget(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? ''
    if (digest.startsWith('NEXT_REDIRECT')) return digest.split(';')[2]
    throw error
  }
  throw new Error('expected a redirect')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV', 'production')
  exchangeCode.mockResolvedValue({
    accessToken: accessToken({ sid: SESSION_ID, sub: 'user_01' }),
    refreshToken: 'refresh_token_value',
    user: { id: 'user_01', email: 'ada@example.com' },
  } as never)
  refresh.mockResolvedValue({
    accessToken: accessToken({ sid: 'session_ROTATED', sub: 'user_01' }),
    refreshToken: 'refresh_token_ROTATED',
    user: { id: 'user_01', email: 'ada@example.com', emailVerified: true },
  } as never)
  // No key verifies the access token, so a session read takes the refresh path.
  server.use(
    http.get('https://api.workos.com/sso/jwks/:clientId', () =>
      HttpResponse.json({ keys: [] }),
    ),
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('workshop sign-in with no redirect URI in the environment', () => {
  /**
   * CONTROL: the SDK in this file really has nothing to fall back on. Built
   * the way the one-host design built it — no `redirectUri` — its middleware
   * refuses to run. Each test below passes only because the app names the
   * host's callback itself.
   */
  it('CONTROL: the SDK has no fallback — its middleware without a redirectUri throws', async () => {
    expect(process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI).toBeUndefined()
    expect(process.env.WORKOS_REDIRECT_URI).toBeUndefined()

    await expect(
      authkitMiddleware()(request('/workshop'), event),
    ).rejects.toThrow('You must provide a redirect URI')
  })

  it('the proxy hands the page this host’s callback', async () => {
    const response = (await middleware(
      request('/workshop', { accept: 'text/html' }),
      event,
    )) as Response

    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(response.headers.get('x-middleware-request-x-redirect-uri')).toBe(
      CALLBACK,
    )
  })

  it.each([
    ['/workshop/sign-in', signIn, 'sign-in'],
    ['/workshop/sign-up', signUp, 'sign-up'],
  ] as const)(
    '%s sends the visitor to WorkOS with this host’s callback and a Secure, host-only verifier',
    async (path, handler, screenHint) => {
      const response = await handler(request(path))

      const url = new URL(response.headers.get('location')!)
      expect(url.origin + url.pathname).toBe(
        'https://api.workos.com/user_management/authorize',
      )
      expect(url.searchParams.get('screen_hint')).toBe(screenHint)
      expect(url.searchParams.get('redirect_uri')).toBe(CALLBACK)

      const [verifier, ...rest] = writtenCookies()
      expect(rest).toEqual([])
      expect(verifier).toMatch(/^wos-auth-verifier-[0-9a-f]{8}=/)
      expect(attributes(verifier)).toEqual([
        'Path=/',
        'Max-Age=600',
        'Secure',
        'HttpOnly',
        'SameSite=lax',
      ])
    },
  )

  it('the callback trades the code for a Secure, host-only session and lands on the portal', async () => {
    const { finished, sessionCookie } = await completeSignIn()

    expect(exchangeCode).toHaveBeenCalledOnce()
    expect(finished.status).toBe(307)
    expect(finished.headers.get('location')).toBe(`https://${HOST}/workshop`)
    expect(attributes(sessionCookie)).toEqual([
      'Path=/',
      'Max-Age=34560000',
      'Secure',
      'HttpOnly',
      'SameSite=lax',
    ])
  })

  it('the proxy refreshes a signed-in attendee’s session on this host', async () => {
    const { sealed } = await completeSignIn()

    const response = (await middleware(
      request('/workshop', {
        accept: 'text/html',
        cookie: `wos-session=${sealed}`,
      }),
      event,
    )) as Response

    expect(refresh).toHaveBeenCalledOnce()
    expect(response.headers.get('x-middleware-next')).toBe('1')
    const session = response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith('wos-session='))!
    expect(session.startsWith(`wos-session=${sealed}`)).toBe(false)
    expect(attributes(session)).toEqual([
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      'Max-Age=34560000',
      'Secure',
    ])
  })

  it('tRPC resolves the attendee and persists the refreshed session', async () => {
    const { sealed } = await completeSignIn()
    const resHeaders = new Headers()

    const ctx = await createTRPCContext({
      req: new NextRequest(`https://${HOST}/api/trpc/workshop.getMySignups`, {
        headers: new Headers({ host: HOST, cookie: `wos-session=${sealed}` }),
      }),
      resHeaders,
    })

    expect(ctx.workosUser).toMatchObject({ id: 'user_01', emailVerified: true })
    const [cookie, ...rest] = resHeaders.getSetCookie()
    expect(rest).toEqual([])
    expect(cookie.startsWith('wos-session=Fe26.2')).toBe(true)
    expect(attributes(cookie)).toEqual([
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      'Max-Age=34560000',
      'Secure',
    ])
  })

  it('sign-out ends this session at WorkOS, returns to this host and clears the cookie', async () => {
    const { sealed } = await completeSignIn()
    beginRequest(
      new Headers({
        host: HOST,
        'x-workos-middleware': 'true',
        'x-workos-session': sealed,
      }),
    )
    presentCookie('wos-session', sealed)

    const target = new URL(await redirectTarget(() => signOutOfWorkshop()))

    expect(target.origin + target.pathname).toBe(
      'https://api.workos.com/user_management/sessions/logout',
    )
    expect(target.searchParams.get('session_id')).toBe(SESSION_ID)
    expect(target.searchParams.get('return_to')).toBe(`https://${HOST}/`)

    const cleared = writtenCookies().find((cookie) =>
      cookie.startsWith('wos-session='),
    )!
    expect(cleared).toMatch(/^wos-session=;/)
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/)
    expect(attributes(cleared)).toEqual(['Path=/', 'Secure', 'SameSite=lax'])
  })
})
