/**
 * @vitest-environment node
 *
 * The SDK-backed entry points of the workshop portal (#1296), against the REAL
 * `@workos-inc/authkit-nextjs` AND the real `jose` it depends on:
 *
 *  - `GET /workshop/sign-in` and `/workshop/sign-up` — behind the two buttons
 *    (GET forms) on the signed-out page. They replace a hand-built authorize URL that had no PKCE.
 *  - the sign-out action — it replaces a link to NextAuth's sign-out route,
 *    which never ended the WorkOS session at all.
 *  - `authkit(req, { redirectUri })` as tRPC calls it, UNMOCKED, through a
 *    token refresh — the one place the SDK's session path runs for real.
 *
 * Boundaries supplied: the host's own Sanity sign-in-standing row
 * (`getRedirectUriSyncRow`, verified and registered), WorkOS's token endpoint,
 * and `next/headers` (backed by a real `NextResponse`, see
 * `nextHeadersJar.ts`, so cookies are serialized by Next). The workshop
 * FEATURE GATE is supplied too (`isWorkshopsEnabledForConference`, with the
 * conference the host resolves to): these routes are where it is ordered
 * against the SDK; what it decides is proven in `workshops.test.ts` and, on
 * the page, in `portal-gate.test.tsx`. `next/navigation` is
 * the real one: `redirect()` and `notFound()` throw, and the outcome is read
 * off the error's digest the way Next itself does.
 */
import '../../helpers/workosEnv'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { RedirectUriSyncRow } from '@/lib/domain-verification/types'
import { signInHost, signInHostsById } from '../../helpers/workshopSignIn'
import {
  beginRequest,
  presentCookie,
  writtenCookies,
} from '../../helpers/nextHeadersJar'

// The suite-wide `jose` alias is a stub without `decodeJwt`. Sign-out reads the
// session id out of the access token and a refresh verifies it, so this file
// runs the real package — the SDK's OWN copy (see `sdkJose.ts`).
vi.mock('jose', () => import('../../helpers/sdkJose'))

vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn(async () => null) }))

const getRedirectUriSyncRow =
  vi.fn<(id: string) => Promise<RedirectUriSyncRow | null>>()

vi.mock('@/lib/domain-verification/sanity', () => ({
  getRedirectUriSyncRow: (id: string) => getRedirectUriSyncRow(id),
}))

vi.mock('next/headers', () => import('../../helpers/nextHeadersJar'))

/** The conference each host serves, and whether its tenant has workshops. */
const gate = vi.hoisted(() => ({
  conferenceForHost: vi.fn(),
  workshopsEnabled: vi.fn(),
}))

vi.mock('@/lib/conference/sanity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/conference/sanity')>()),
  getConferenceForCurrentDomain: async () => {
    const { headers } = await import('next/headers')
    return gate.conferenceForHost((await headers()).get('host'))
  },
}))

vi.mock('@/lib/features/workshops', () => ({
  isWorkshopsEnabledForConference: (conference: unknown) =>
    gate.workshopsEnabled(conference),
}))

import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/msw/server'
import {
  SDK_JOSE_VERSION,
  decodeJwt as sdkDecodeJwt,
} from '../../helpers/sdkJose'
import { GET as signIn } from '@/app/(workshop)/workshop/sign-in/route'
import { GET as signUp } from '@/app/(workshop)/workshop/sign-up/route'
import { GET as callback } from '@/app/api/auth/callback/route'
import { signOutOfWorkshop } from '@/app/(workshop)/workshop/actions'
import { createTRPCContext } from '@/server/trpc'
import { getWorkOS } from '@workos-inc/authkit-nextjs'

const TENANT_A = 'a.example.org'
const TENANT_B = 'b.example.org'
const UNVERIFIED = 'unverified.example.org'
const SESSION_ID = 'session_01HXYZ'

const buildAuthorizationUrl = vi.spyOn(
  getWorkOS().userManagement,
  'getAuthorizationUrl',
)
const exchangeCode = vi.spyOn(
  getWorkOS().userManagement,
  'authenticateWithCode',
)

/** An unsigned JWT-shaped access token carrying the claims sign-out reads. */
function accessToken(claims: Record<string, unknown>): string {
  const part = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'RS256', typ: 'JWT' })}.${part(claims)}.signature`
}

/** Begin a "request" on `host`: fresh cookie jar, these request headers. */
function onHost(host: string, headers: Record<string, string> = {}) {
  const requestHeaders = new Headers({ host, ...headers })
  beginRequest(requestHeaders)
  return new NextRequest(`https://${host}/workshop/sign-in`, {
    headers: requestHeaders,
  })
}

const setCookies = writtenCookies

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
  getRedirectUriSyncRow.mockImplementation(
    signInHostsById([signInHost(TENANT_A), signInHost(TENANT_B)]),
  )
  vi.stubEnv('NODE_ENV', 'production')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  gate.conferenceForHost.mockImplementation(async (host: string) => ({
    conference: { _id: `conf-on-${host}`, organization: { _ref: 'org' } },
    error: null,
  }))
  gate.workshopsEnabled.mockResolvedValue(true)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe.each([
  ['/workshop/sign-in', signIn, 'sign-in'],
  ['/workshop/sign-up', signUp, 'sign-up'],
] as const)('GET %s', (_path, handler, screenHint) => {
  it(`sends the visitor to WorkOS’s ${screenHint} screen with this host’s callback`, async () => {
    const response = await handler(onHost(TENANT_A))

    expect(response.status).toBe(307)
    const url = new URL(response.headers.get('location')!)
    expect(url.origin + url.pathname).toBe(
      'https://api.workos.com/user_management/authorize',
    )
    expect(url.searchParams.get('screen_hint')).toBe(screenHint)
    expect(url.searchParams.get('redirect_uri')).toBe(
      `https://${TENANT_A}/api/auth/callback`,
    )
  })

  it('uses PKCE, with the verifier in a host-only cookie', async () => {
    const response = await handler(onHost(TENANT_A))
    const url = new URL(response.headers.get('location')!)

    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/)

    const [cookie] = setCookies()
    expect(cookie).toMatch(/^wos-auth-verifier-[0-9a-f]{8}=/)
    expect(decodeURIComponent(cookie)).toContain(
      `=${url.searchParams.get('state')};`,
    )
    // The COMPLETE attribute list, by equality. A `Domain=…` entry — which is
    // what the SDK adds when `WORKOS_COOKIE_DOMAIN` is set, shown against the
    // real SDK in `sdk-cookie-domain.test.ts` — would make this fail.
    // (`Expires` is the same lifetime as `Max-Age`, as a date.)
    const attributes = cookie.split('; ').slice(1)
    expect(attributes.filter((a) => !a.startsWith('Expires='))).toEqual([
      'Path=/',
      'Max-Age=600',
      'Secure',
      'HttpOnly',
      'SameSite=lax',
    ])
  })

  it('ignores a client-sent x-redirect-uri and the single-host env URI', async () => {
    const response = await handler(
      onHost(TENANT_B, { 'x-redirect-uri': 'https://evil.example.org/steal' }),
    )

    const location = response.headers.get('location')!
    expect(location).not.toContain('evil')
    expect(location).not.toContain('decoy')
    expect(new URL(location).searchParams.get('redirect_uri')).toBe(
      `https://${TENANT_B}/api/auth/callback`,
    )
  })

  it('completes on the callback and lands on the portal', async () => {
    const started = await handler(onHost(TENANT_A))
    const state = new URL(started.headers.get('location')!).searchParams.get(
      'state',
    )!
    const verifier = decodeURIComponent(setCookies()[0].split(';')[0])
    exchangeCode.mockResolvedValue({
      accessToken: accessToken({ sid: SESSION_ID, sub: 'user_01' }),
      refreshToken: 'refresh_token_value',
      user: { id: 'user_01', email: 'ada@example.com' },
    } as never)

    onHost(TENANT_A)
    const url = new URL(`https://${TENANT_A}/api/auth/callback`)
    url.searchParams.set('code', 'code_from_workos')
    url.searchParams.set('state', state)
    const finished = await callback(
      new NextRequest(url, {
        headers: new Headers({ host: TENANT_A, cookie: verifier }),
      }),
    )

    expect(finished.headers.get('location')).toBe(
      `https://${TENANT_A}/workshop`,
    )
  })

  it('marks the redirect uncacheable — it carries a one-time verifier cookie', async () => {
    const response = await handler(onHost(TENANT_A))
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('takes the host from the Host header: a verified x-forwarded-host does not admit it', async () => {
    const response = await handler(
      onHost(UNVERIFIED, { 'x-forwarded-host': TENANT_A }),
    )

    expect(response.status).toBe(404)
    expect(buildAuthorizationUrl).not.toHaveBeenCalled()

    // …and an unverified one does not divert a verified host's callback.
    const honest = await handler(
      onHost(TENANT_A, { 'x-forwarded-host': UNVERIFIED }),
    )
    expect(
      new URL(honest.headers.get('location')!).searchParams.get('redirect_uri'),
    ).toBe(`https://${TENANT_A}/api/auth/callback`)
  })

  it('starts nothing on a host that is not allowlisted', async () => {
    const response = await handler(onHost(UNVERIFIED))

    expect(response.status).toBe(404)
    expect(response.headers.get('location')).toBeNull()
    expect(buildAuthorizationUrl).not.toHaveBeenCalled()
    expect(setCookies()).toEqual([])
  })

  /**
   * THE FEATURE GATE COMES BEFORE WORKOS (review of #1304). These two routes
   * are the only place a signed-out visitor is sent to WorkOS, so a tenant
   * without workshops must stop here: a host that can sign in is not enough.
   */
  it('starts nothing for a tenant without workshops, though its host can sign in', async () => {
    gate.workshopsEnabled.mockResolvedValue(false)

    const response = await handler(onHost(TENANT_A))

    expect(response.status).toBe(404)
    expect(response.headers.get('location')).toBeNull()
    expect(buildAuthorizationUrl).not.toHaveBeenCalled()
    expect(setCookies()).toEqual([])
    // The gate was asked about the conference resolved for THIS request. (The
    // resolver is supplied here; that it maps a host to the right conference
    // is its own tests' business.)
    expect(gate.workshopsEnabled).toHaveBeenCalledWith(
      expect.objectContaining({ _id: `conf-on-${TENANT_A}` }),
    )
  })

  it('starts nothing when the host resolves to no conference (fail closed)', async () => {
    gate.conferenceForHost.mockResolvedValue({
      conference: null,
      error: new Error('no conference for this domain'),
    })

    const response = await handler(onHost(TENANT_A))

    expect(response.status).toBe(404)
    expect(buildAuthorizationUrl).not.toHaveBeenCalled()
    // The gate is not asked to bless a conference that did not resolve.
    expect(gate.workshopsEnabled).not.toHaveBeenCalledWith(
      expect.objectContaining({ _id: expect.any(String) }),
    )
  })
})

describe('GET /api/auth/callback — the feature gate', () => {
  /** A sign-in started while the tenant had workshops, returning now. */
  async function returningFromWorkOS(host: string) {
    const started = await signIn(onHost(host))
    const state = new URL(started.headers.get('location')!).searchParams.get(
      'state',
    )!
    const verifier = decodeURIComponent(setCookies()[0].split(';')[0])
    exchangeCode.mockResolvedValue({
      accessToken: accessToken({ sid: SESSION_ID, sub: 'user_01' }),
      refreshToken: 'refresh_token_value',
      user: { id: 'user_01', email: 'ada@example.com' },
    } as never)
    onHost(host)
    const url = new URL(`https://${host}/api/auth/callback`)
    url.searchParams.set('code', 'code_from_workos')
    url.searchParams.set('state', state)
    return new NextRequest(url, {
      headers: new Headers({ host, cookie: verifier }),
    })
  }

  it('exchanges no code and sets no session for a tenant without workshops', async () => {
    const request = await returningFromWorkOS(TENANT_A)
    gate.workshopsEnabled.mockResolvedValue(false)

    const response = await callback(request)

    expect(response.status).toBe(404)
    expect(exchangeCode).not.toHaveBeenCalled()
    expect(setCookies()).toEqual([])
  })

  it('CONTROL: the same return completes when the tenant has workshops', async () => {
    const response = await callback(await returningFromWorkOS(TENANT_A))

    expect(exchangeCode).toHaveBeenCalledOnce()
    expect(response.headers.get('location')).toBe(
      `https://${TENANT_A}/workshop`,
    )
  })
})

/**
 * A signed-in "request": the headers the proxy would have set (the SDK's
 * `withAuth` reads the sealed session from them) and the session cookie in the
 * jar. The sealed value is the SDK's own — produced by a real sign-in above.
 */
async function signedInOn(host: string) {
  const started = await signIn(onHost(host))
  const state = new URL(started.headers.get('location')!).searchParams.get(
    'state',
  )!
  const verifier = decodeURIComponent(setCookies()[0].split(';')[0])
  exchangeCode.mockResolvedValue({
    accessToken: accessToken({ sid: SESSION_ID, sub: 'user_01' }),
    refreshToken: 'refresh_token_value',
    user: { id: 'user_01', email: 'ada@example.com' },
  } as never)

  onHost(host)
  const url = new URL(`https://${host}/api/auth/callback`)
  url.searchParams.set('code', 'code_from_workos')
  url.searchParams.set('state', state)
  await callback(
    new NextRequest(url, {
      headers: new Headers({ host, cookie: verifier }),
    }),
  )
  const sealed = decodeURIComponent(
    setCookies()
      .find((c) => c.startsWith('wos-session='))!
      .split(';')[0]
      .slice('wos-session='.length),
  )

  onHost(host, {
    'x-workos-middleware': 'true',
    'x-workos-session': sealed,
  })
  presentCookie('wos-session', sealed)
  return sealed
}

describe('signOutOfWorkshop', () => {
  it('ends the WorkOS session: the browser is sent to WorkOS’s logout for THIS session', async () => {
    await signedInOn(TENANT_A)

    const target = new URL(await redirectTarget(() => signOutOfWorkshop()))

    expect(target.origin + target.pathname).toBe(
      'https://api.workos.com/user_management/sessions/logout',
    )
    expect(target.searchParams.get('session_id')).toBe(SESSION_ID)
  })

  it('asks to come back to the host the attendee signed out on', async () => {
    await signedInOn(TENANT_A)
    const a = new URL(await redirectTarget(() => signOutOfWorkshop()))

    await signedInOn(TENANT_B)
    const b = new URL(await redirectTarget(() => signOutOfWorkshop()))

    expect(a.searchParams.get('return_to')).toBe(`https://${TENANT_A}/`)
    expect(b.searchParams.get('return_to')).toBe(`https://${TENANT_B}/`)
  })

  it('takes the host from the Host header: a verified x-forwarded-host does not admit it', async () => {
    const sealed = await signedInOn(TENANT_A)
    onHost(UNVERIFIED, {
      'x-forwarded-host': TENANT_A,
      'x-workos-middleware': 'true',
      'x-workos-session': sealed,
    })
    presentCookie('wos-session', sealed)

    const digest = await signOutOfWorkshop().then(
      () => 'resolved',
      (error: { digest?: string }) => error.digest ?? String(error),
    )

    expect(digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404')
    expect(setCookies()).toEqual([])
  })

  /**
   * The session ended elsewhere (another tab, a revocation). The proxy lets the
   * POST through with no session; the action must finish cleanly — not throw —
   * and leave the attendee on this host, signed out.
   */
  it('with no session left, lands on this host’s home page without going to WorkOS', async () => {
    onHost(TENANT_A, { 'x-workos-middleware': 'true' })
    const buildLogoutUrl = vi.spyOn(getWorkOS().userManagement, 'getLogoutUrl')

    const target = await redirectTarget(() => signOutOfWorkshop())

    expect(target).toBe(`https://${TENANT_A}/`)
    expect(buildLogoutUrl).not.toHaveBeenCalled()
  })

  it('removes the session cookie on this host', async () => {
    await signedInOn(TENANT_A)
    await redirectTarget(() => signOutOfWorkshop())

    const cleared = setCookies().find((c) => c.startsWith('wos-session='))
    expect(cleared).toBeDefined()
    expect(cleared).toMatch(/^wos-session=;/)
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/)
    expect(cleared).not.toMatch(/;\s*domain=/i)
  })

  /**
   * A server action can be POSTed to any path, so the action takes the host
   * decision itself. On a host that may not sign in it answers 404 and the SDK
   * is not entered: the session cookie is left alone and nobody is sent to
   * WorkOS.
   */
  it('refuses on a host that is not allowlisted — a 404, and the SDK is never entered', async () => {
    await signedInOn(TENANT_A)
    // The same signed-in request, but the host has since been delisted.
    getRedirectUriSyncRow.mockImplementation(
      signInHostsById([signInHost(TENANT_B)]),
    )
    const buildLogoutUrl = vi.spyOn(getWorkOS().userManagement, 'getLogoutUrl')

    const digest = await signOutOfWorkshop().then(
      () => 'resolved',
      (error: { digest?: string }) => error.digest ?? String(error),
    )

    expect(digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404')
    expect(buildLogoutUrl).not.toHaveBeenCalled()
    expect(setCookies()).toEqual([])

    // CONTROL: on the admitted host the same call does build it.
    getRedirectUriSyncRow.mockImplementation(
      signInHostsById([signInHost(TENANT_A)]),
    )
    await redirectTarget(() => signOutOfWorkshop())
    expect(buildLogoutUrl).toHaveBeenCalledOnce()
  })
})

/**
 * `authkit(req, { redirectUri })` UNMOCKED, the way `createTRPCContext` calls
 * it, on a session whose access token no longer verifies — so the SDK takes
 * its refresh path for real: it unseals the cookie, fails verification against
 * WorkOS's key set (served here by MSW, empty), spends the refresh token at
 * WorkOS (the one boundary supplied) and re-seals the session.
 */
describe('createTRPCContext on the real SDK — a refresh is persisted', () => {
  const refresh = vi.spyOn(
    getWorkOS().userManagement,
    'authenticateWithRefreshToken',
  )

  beforeEach(() => {
    server.use(
      http.get('https://api.workos.com/sso/jwks/:clientId', () =>
        HttpResponse.json({ keys: [] }),
      ),
    )
    refresh.mockResolvedValue({
      accessToken: accessToken({ sid: 'session_ROTATED', sub: 'user_01' }),
      refreshToken: 'refresh_token_ROTATED',
      user: { id: 'user_01', email: 'ada@example.com', emailVerified: true },
    } as never)
  })

  function trpcRequest(host: string, sealed: string) {
    return new NextRequest(`https://${host}/api/trpc/workshop.getMySignups`, {
      headers: new Headers({ host, cookie: `wos-session=${sealed}` }),
    })
  }

  it('runs the SDK’s own jose, not the suite stub', async () => {
    // What `jose` resolves to in this file's module graph — the SDK's included
    // — is the helper's real package. The suite stub has no `decodeJwt` at all.
    const resolved = await import('jose')
    expect(resolved.decodeJwt).toBe(sdkDecodeJwt)
    expect(
      resolved.decodeJwt(accessToken({ sid: 'session_x', sub: 'user_x' })),
    ).toEqual({ sid: 'session_x', sub: 'user_x' })
    // The SDK's dependency, not the app's own newer major.
    expect(SDK_JOSE_VERSION.split('.')[0]).toBe('5')
  })

  it('spends the refresh token once and hands the browser the re-sealed session', async () => {
    const sealed = await signedInOn(TENANT_A)
    const resHeaders = new Headers()

    const ctx = await createTRPCContext({
      req: trpcRequest(TENANT_A, sealed),
      resHeaders,
    })

    expect(refresh).toHaveBeenCalledOnce()
    expect(refresh).toHaveBeenCalledWith(
      expect.objectContaining({ refreshToken: 'refresh_token_value' }),
    )
    expect(ctx.workosUser).toMatchObject({
      id: 'user_01',
      emailVerified: true,
    })

    // The browser gets a NEW sealed session, host-only like the first one.
    const [cookie, ...rest] = resHeaders.getSetCookie()
    expect(rest).toEqual([])
    const [pair, ...attributes] = cookie.split('; ')
    expect(pair.startsWith('wos-session=Fe26.2')).toBe(true)
    expect(pair).not.toBe(`wos-session=${sealed}`)
    expect(attributes.map((a) => a.split('=')[0])).toEqual([
      'Path',
      'HttpOnly',
      'SameSite',
      'Max-Age',
      'Secure',
    ])
    expect(resHeaders.get('cache-control')).toBe('no-store')
  })

  it('refreshes nothing on a host that is not allowlisted', async () => {
    const sealed = await signedInOn(TENANT_A)
    const resHeaders = new Headers()

    const ctx = await createTRPCContext({
      req: trpcRequest(UNVERIFIED, sealed),
      resHeaders,
    })

    expect(ctx.workosUser).toBeNull()
    expect(refresh).not.toHaveBeenCalled()
    expect([...resHeaders.keys()]).toEqual([])
  })
})
