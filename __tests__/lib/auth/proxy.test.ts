/**
 * @vitest-environment node
 *
 * Tests for the edge middleware in `src/proxy.ts` — previously ZERO coverage
 * (its scoped threshold was gated at 0 to keep the gap visible). The middleware
 * is the app's first auth gate, so its routing and production guards are
 * security-relevant:
 *   - path routing: protected /cfp|/admin|/cli → NextAuth, everything else
 *     (incl. bare /cfp and the whole of /workshop, #1311) → pass-through.
 *   - production hard guards: dev-tools 404 gate + impersonation-param strip.
 *   - unauthenticated → sign-in redirect (preserving callbackUrl).
 *   - authenticated → forward with the x-url request header.
 *   - dev test-mode bypass.
 *
 * The global `next-auth` mock (see __tests__/mocks/next-auth.ts) populates
 * `req.auth` from an `x-test-auth-user` header, so "authenticated" here means
 * "carry a header naming a known test speaker". `@/lib/environment/config` is
 * mocked so the dev/test gates are controllable without a fixed NODE_ENV.
 *
 * THE WORKSHOP PORTAL IS NOT THE PROXY'S (#1311): it keeps a session of its
 * own, read by the page and the procedures. The record read behind every
 * sign-in decision is supplied as a spy, so "reads nothing" is asserted.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  // Mutable environment flags, read via getters on the mocked AppEnvironment.
  env: { isTestMode: false, isDevelopment: false, isProduction: false },
  // The live record read every workshop sign-in decision is taken from.
  getDomainClaim: vi.fn(),
}))

vi.mock('@/lib/domain-verification/sanity', () => ({
  getDomainClaim: h.getDomainClaim,
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

import middleware, { config } from '@/proxy'

const ORGANIZER_ID = '08913fe1-4e52-43b9-8b27-6d5febf95dbd'

/** Build a NextRequest, optionally authenticated as a known test speaker. */
function req(path: string, opts: { authUser?: string } = {}): NextRequest {
  const headers = new Headers()
  if (opts.authUser) headers.set('x-test-auth-user', opts.authUser)
  return new NextRequest(`http://localhost:3000${path}`, { headers })
}

const TENANT_HOST = 'conf.example.org'

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
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('middleware — path routing', () => {
  it('passes through the bare /cfp landing page (not protected)', () => {
    const res = middleware(req('/cfp')) as Response
    expect(res.status).toBe(200)
    expect(res.headers.get('x-middleware-next')).toBe('1')
  })

  it('passes through unmatched public paths', () => {
    const res = middleware(req('/')) as Response
    expect(res.status).toBe(200)
    expect(res.headers.get('x-middleware-next')).toBe('1')
  })
})

/**
 * The workshop portal's session is the portal's own (#1311, spec §6). The
 * proxy neither reads it nor decides anything for `/workshop*`.
 */
describe('middleware — /workshop is not the proxy’s', () => {
  it('has no /workshop path in its matcher', () => {
    expect(config.matcher).toEqual([
      '/cfp/:path*',
      '/admin/:path*',
      '/cli/:path*',
    ])
  })

  it.each([
    '/workshop',
    '/workshop/sign-in',
    '/workshop/sign-up',
    '/workshop/redeem?token=x',
  ])('passes %s through untouched, and reads nothing', (path) => {
    const res = middleware(reqOnHost(path, TENANT_HOST)) as Response

    expect(res.status).toBe(200)
    expect(res.headers.get('x-middleware-next')).toBe('1')
    expect(res.headers.get('location')).toBeNull()
    expect(res.headers.getSetCookie()).toEqual([])
    expect(h.getDomainClaim).not.toHaveBeenCalled()
  })
})

describe('middleware — NextAuth gate (unauthenticated)', () => {
  it.each(['/cfp/list', '/admin/sponsors', '/cli/token'])(
    'redirects an unauthenticated request to %s to sign-in with callbackUrl',
    async (path) => {
      const res = (await middleware(req(path))) as Response
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
      )) as Response
      expect(res.status).toBe(404)
    },
  )

  it('strips the impersonate param and redirects in production', async () => {
    const res = (await middleware(
      req('/admin/sponsors?impersonate=someone', { authUser: ORGANIZER_ID }),
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
    )) as Response
    expect(res.headers.get('x-middleware-next')).toBe('1')
    expect(console.error).not.toHaveBeenCalled()
  })

  it('does NOT strip impersonate outside production', async () => {
    // NODE_ENV is stubbed to production in this describe; override back.
    vi.stubEnv('NODE_ENV', 'development')
    const res = (await middleware(
      req('/admin/sponsors?impersonate=someone', { authUser: ORGANIZER_ID }),
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
    const res = (await middleware(req('/admin/sponsors'))) as Response
    // Bypass → NextResponse.next, no sign-in redirect despite no auth.
    expect(res.headers.get('x-middleware-next')).toBe('1')
    expect(res.status).not.toBe(307)
  })

  it('honours the ?test=true param in development', async () => {
    h.env.isDevelopment = true
    h.env.isTestMode = false
    const res = (await middleware(req('/admin/sponsors?test=true'))) as Response
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
