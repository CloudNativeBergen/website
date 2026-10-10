/**
 * @vitest-environment node
 *
 * Tests for the edge middleware in `src/proxy.ts` — previously ZERO coverage
 * (its scoped threshold was gated at 0 to keep the gap visible). The middleware
 * is the app's first auth gate, so its routing and production guards are
 * security-relevant:
 *   - path routing: /workshop → WorkOS (on a verified and registered host,
 *     #1298), protected /cfp|/admin|/cli → NextAuth, everything else (incl. bare /cfp) →
 *     pass-through.
 *   - production hard guards: dev-tools 404 gate + impersonation-param strip.
 *   - unauthenticated → sign-in redirect (preserving callbackUrl).
 *   - authenticated → forward with the x-url request header.
 *   - dev test-mode bypass.
 *
 * The global `next-auth` mock (see __tests__/mocks/next-auth.ts) populates
 * `req.auth` from an `x-test-auth-user` header, so "authenticated" here means
 * "carry a header naming a known test speaker". `@workos-inc/authkit-nextjs`
 * and `@/lib/environment/config` are mocked so the routing and dev/test gates
 * are controllable without a real WorkOS client or a fixed NODE_ENV.
 *
 * The workshop branch is exercised against the REAL SDK in
 * `proxy.workshop.test.ts`; here the SDK is a sentinel, so these cases pin only
 * WHICH requests reach it and with what options. The Sanity boundary behind the
 * host’s own redirect-URI sync row is supplied so the real decision runs.
 */
import { isPortalRedirect } from '../../helpers/workshopSignIn'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest, type NextFetchEvent } from 'next/server'

const h = vi.hoisted(() => ({
  // Mutable environment flags, read via getters on the mocked AppEnvironment.
  env: { isTestMode: false, isDevelopment: false, isProduction: false },
  // Sentinel returned by the mocked WorkOS middleware so we can assert routing.
  workOSResult: { __workos: true },
  workOSMiddleware: vi.fn(),
  // The factory, so the per-request options can be asserted.
  authkitMiddleware: vi.fn(),
  // Hostnames currently verified and registered in WorkOS.
  verifiedHosts: [] as string[],
}))

vi.mock('@workos-inc/authkit-nextjs', () => ({
  authkitMiddleware: h.authkitMiddleware,
}))

vi.mock('@/lib/domain-verification/sanity', () => ({
  getRedirectUriSyncRow: async (id: string) => {
    const { signInHost, signInHostsById } =
      await import('../../helpers/workshopSignIn')
    return signInHostsById(
      h.verifiedHosts.map((hostname) => signInHost(hostname)),
    )(id)
  },
}))

vi.mock('@/lib/environment/config', () => ({
  AppEnvironment: {
    get isTestMode() {
      return h.env.isTestMode
    },
    get isDevelopment() {
      return h.env.isDevelopment
    },
    get isProduction() {
      return h.env.isProduction
    },
    createMockAuthContext: () => ({ user: { email: 'mock@test' } }),
  },
}))

import middleware from '@/proxy'

const ORGANIZER_ID = '08913fe1-4e52-43b9-8b27-6d5febf95dbd'

/** Build a NextRequest, optionally authenticated as a known test speaker. */
function req(path: string, opts: { authUser?: string } = {}): NextRequest {
  const headers = new Headers()
  if (opts.authUser) headers.set('x-test-auth-user', opts.authUser)
  return new NextRequest(`http://localhost:3000${path}`, { headers })
}

const event = {} as NextFetchEvent

/** A host verified and registered in WorkOS for these tests. */
const VERIFIED_HOST = 'conf.example.org'

/** Request `path` on `host`, as a browser would: URL and Host header agree. */
function reqOnHost(path: string, host: string): NextRequest {
  return new NextRequest(`https://${host}${path}`, {
    headers: new Headers({ host }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  h.env.isTestMode = false
  h.env.isDevelopment = false
  h.env.isProduction = false
  h.workOSMiddleware.mockReturnValue(h.workOSResult)
  h.authkitMiddleware.mockReturnValue(h.workOSMiddleware)
  h.verifiedHosts = [VERIFIED_HOST]
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('middleware — path routing', () => {
  it('routes /workshop to the WorkOS middleware', async () => {
    const result = await middleware(
      reqOnHost('/workshop', VERIFIED_HOST),
      event,
    )
    expect(h.workOSMiddleware).toHaveBeenCalledOnce()
    expect(result).toBe(h.workOSResult)
  })

  it('routes nested /workshop/* to the WorkOS middleware', async () => {
    const result = await middleware(
      reqOnHost('/workshop/agenda', VERIFIED_HOST),
      event,
    )
    expect(h.workOSMiddleware).toHaveBeenCalledOnce()
    expect(result).toBe(h.workOSResult)
  })

  it('passes through the bare /cfp landing page (not protected)', () => {
    const res = middleware(req('/cfp'), event) as Response
    expect(h.workOSMiddleware).not.toHaveBeenCalled()
    expect(res.headers.get('x-middleware-next')).toBe('1')
  })

  it('passes through unmatched public paths', () => {
    const res = middleware(req('/'), event) as Response
    expect(res.headers.get('x-middleware-next')).toBe('1')
  })
})

/**
 * The workshop portal signs in on the host the attendee is on, and only when
 * that host is verified and registered in WorkOS (#1298). No environment
 * variable names a host: setting `WORKOS_REDIRECT_URI` or `NEXT_PUBLIC_URL`
 * grants and refuses nothing.
 */
describe('middleware — /workshop host decision', () => {
  it('builds the WorkOS middleware for THIS request, with this host’s callback', async () => {
    await middleware(reqOnHost('/workshop', VERIFIED_HOST), event)

    expect(h.authkitMiddleware).toHaveBeenCalledOnce()
    const [options] = h.authkitMiddleware.mock.calls[0]
    expect(options.redirectUri).toBe(
      `https://${VERIFIED_HOST}/api/auth/callback`,
    )
    // THE WHOLE OPTION SET, by equality: no `middlewareAuth`. With it the SDK
    // redirects a signed-out visitor to WorkOS from here, before anything has
    // asked whether the tenant has workshops (review of #1304).
    expect(Object.keys(options).sort()).toEqual(['debug', 'redirectUri'])
  })

  it('builds it again for the next request — no instance is shared between hosts', async () => {
    h.verifiedHosts = [VERIFIED_HOST, 'other.example.org']

    await middleware(reqOnHost('/workshop', VERIFIED_HOST), event)
    await middleware(reqOnHost('/workshop', 'other.example.org'), event)

    expect(
      h.authkitMiddleware.mock.calls.map(([options]) => options.redirectUri),
    ).toEqual([
      `https://${VERIFIED_HOST}/api/auth/callback`,
      'https://other.example.org/api/auth/callback',
    ])
  })

  it('sends /workshop/sign-in to the portal page on a host that cannot sign in, without building it', async () => {
    // /workshop itself now passes through marked (#1298), covered in proxy tests.
    const res = (await middleware(
      reqOnHost('/workshop/sign-in', 'tenant2.example.org'),
      event,
    )) as Response

    expect(res.status).toBe(307)
    expect(isPortalRedirect(res.headers.get('location'))).toBe(true)
    expect(res.headers.getSetCookie()).toEqual([])
    expect(res.headers.get('x-middleware-request-x-redirect-uri')).toBeNull()
    expect(h.authkitMiddleware).not.toHaveBeenCalled()
    expect(h.workOSMiddleware).not.toHaveBeenCalled()
  })

  it('404s nested /workshop/* on such a host too', async () => {
    const res = (await middleware(
      reqOnHost('/workshop/sign-in/x', 'tenant2.example.org'),
      event,
    )) as Response

    expect(res.status).toBe(404)
    expect(h.authkitMiddleware).not.toHaveBeenCalled()
  })

  it('does not let WORKOS_REDIRECT_URI or NEXT_PUBLIC_URL admit a host', async () => {
    vi.stubEnv(
      'WORKOS_REDIRECT_URI',
      'https://env.example.org/api/auth/callback',
    )
    vi.stubEnv('NEXT_PUBLIC_URL', 'https://public.example.org')

    // /workshop itself now passes through marked (#1298), covered in proxy tests.
    for (const host of ['env.example.org', 'public.example.org']) {
      const res = (await middleware(
        reqOnHost('/workshop/sign-in', host),
        event,
      )) as Response
      expect(res.status).toBe(307)
      expect(isPortalRedirect(res.headers.get('location'))).toBe(true)
      expect(res.headers.getSetCookie()).toEqual([])
      expect(res.headers.get('x-middleware-request-x-redirect-uri')).toBeNull()
    }
    expect(h.authkitMiddleware).not.toHaveBeenCalled()
  })

  it('does not let them refuse a verified host, nor steer its callback', async () => {
    vi.stubEnv(
      'WORKOS_REDIRECT_URI',
      'https://env.example.org/api/auth/callback',
    )
    vi.stubEnv('NEXT_PUBLIC_URL', 'https://public.example.org')

    const result = await middleware(
      reqOnHost('/workshop', VERIFIED_HOST),
      event,
    )

    expect(result).toBe(h.workOSResult)
    expect(h.authkitMiddleware.mock.calls[0][0].redirectUri).toBe(
      `https://${VERIFIED_HOST}/api/auth/callback`,
    )
  })

  it('sends /workshop/sign-in to the portal page when nothing at all is verified', async () => {
    // /workshop itself now passes through marked (#1298), covered in proxy tests.
    h.verifiedHosts = []
    vi.stubEnv('WORKOS_REDIRECT_URI', '')
    vi.stubEnv('NEXT_PUBLIC_URL', 'not a url')

    const res = (await middleware(
      reqOnHost('/workshop/sign-in', 'anything.example.org'),
      event,
    )) as Response

    expect(res.status).toBe(307)
    expect(isPortalRedirect(res.headers.get('location'))).toBe(true)
    expect(res.headers.getSetCookie()).toEqual([])
    expect(res.headers.get('x-middleware-request-x-redirect-uri')).toBeNull()
    expect(h.authkitMiddleware).not.toHaveBeenCalled()
    expect(h.workOSMiddleware).not.toHaveBeenCalled()
  })
})

describe('middleware — NextAuth gate (unauthenticated)', () => {
  it.each(['/cfp/list', '/admin/sponsors', '/cli/token'])(
    'redirects an unauthenticated request to %s to sign-in with callbackUrl',
    async (path) => {
      const res = (await middleware(req(path), event)) as Response
      expect(res.status).toBe(307)
      const location = res.headers.get('location')!
      const url = new URL(location)
      expect(url.pathname).toBe('/api/auth/signin')
      expect(url.searchParams.get('callbackUrl')).toBe(
        `http://localhost:3000${path}`,
      )
    },
  )
})

describe('middleware — NextAuth gate (authenticated)', () => {
  it('forwards an authenticated request and sets the x-url header', async () => {
    const res = (await middleware(
      req('/admin/sponsors', { authUser: ORGANIZER_ID }),
      event,
    )) as Response
    expect(res.headers.get('x-middleware-next')).toBe('1')
    expect(res.headers.get('x-middleware-request-x-url')).toBe(
      'http://localhost:3000/admin/sponsors',
    )
  })
})

describe('middleware — production guards', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
  })

  it.each(['/admin/debug', '/admin/clear-storage', '/admin/test-mode'])(
    'returns 404 for dev-tools path %s in production',
    async (path) => {
      const res = (await middleware(
        req(path, { authUser: ORGANIZER_ID }),
        event,
      )) as Response
      expect(res.status).toBe(404)
    },
  )

  it('strips the impersonate param and redirects in production', async () => {
    const res = (await middleware(
      req('/admin/sponsors?impersonate=someone', { authUser: ORGANIZER_ID }),
      event,
    )) as Response
    expect(res.status).toBe(307)
    const url = new URL(res.headers.get('location')!)
    expect(url.searchParams.has('impersonate')).toBe(false)
    expect(url.pathname).toBe('/admin/sponsors')
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('[SECURITY] Impersonation attempt blocked'),
    )
  })

  it('forwards a clean authenticated admin request in production', async () => {
    const res = (await middleware(
      req('/admin/sponsors', { authUser: ORGANIZER_ID }),
      event,
    )) as Response
    expect(res.headers.get('x-middleware-next')).toBe('1')
    expect(console.error).not.toHaveBeenCalled()
  })

  it('does NOT strip impersonate outside production', async () => {
    // NODE_ENV is stubbed to production in this describe; override back.
    vi.stubEnv('NODE_ENV', 'development')
    const res = (await middleware(
      req('/admin/sponsors?impersonate=someone', { authUser: ORGANIZER_ID }),
      event,
    )) as Response
    // Authenticated + no production strip → forwarded, not redirected.
    expect(res.headers.get('x-middleware-next')).toBe('1')
    expect(console.error).not.toHaveBeenCalled()
  })
})

describe('middleware — dev test-mode bypass', () => {
  it('bypasses auth when dev test-mode is active, even unauthenticated', async () => {
    h.env.isDevelopment = true
    h.env.isTestMode = true
    const res = (await middleware(req('/admin/sponsors'), event)) as Response
    // Bypass → NextResponse.next, no sign-in redirect despite no auth.
    expect(res.headers.get('x-middleware-next')).toBe('1')
    expect(res.status).not.toBe(307)
  })

  it('honours the ?test=true param in development', async () => {
    h.env.isDevelopment = true
    h.env.isTestMode = false
    const res = (await middleware(
      req('/admin/sponsors?test=true'),
      event,
    )) as Response
    expect(res.headers.get('x-middleware-next')).toBe('1')
  })
})

describe('middleware — per-request session cookie Domain (#682)', () => {
  // next-auth's middleware wrapper appends the Set-Cookie headers of its
  // internal `session` action onto the response, and the JWT strategy re-issues
  // the session cookie on every one of those calls. The mock reproduces that via
  // `x-mock-set-cookie`, so this exercises the middleware's real cookie seam.
  const SESSION =
    '__Secure-authjs.session-token=rolling; Path=/; HttpOnly; Secure; SameSite=Lax'

  async function domainForHost(host: string): Promise<string | undefined> {
    const headers = new Headers()
    headers.set('x-test-auth-user', ORGANIZER_ID)
    headers.set('x-forwarded-host', host)
    headers.set('x-mock-set-cookie', JSON.stringify([SESSION]))
    const res = (await middleware(
      new NextRequest('http://localhost:3000/admin/sponsors', { headers }),
      event,
    )) as Response
    // A widened/narrowed write is accompanied by a counter-scope CLEAR; the
    // cookie under test is the one that still carries the token.
    const cookie = res.headers
      .getSetCookie()
      .find((value) => value.includes('=rolling;'))!
    return /;\s*Domain=([^;]+)/i.exec(cookie)?.[1]
  }

  it('scopes the rolling session cookie to the ACTUAL host, per request', async () => {
    // The two LIVE production domains plus a denylisted one, in one process: the
    // module-load derivation this replaced would hand all three the same Domain
    // — and the browser would reject it on two of them.
    expect(await domainForHost('2026.cloudnativedays.no')).toBe(
      '.cloudnativedays.no',
    )
    expect(await domainForHost('2025.cloudnativebergen.dev')).toBe(
      '.cloudnativebergen.dev',
    )
    expect(await domainForHost('tenant.konf.app')).toBeUndefined()
  })
})
