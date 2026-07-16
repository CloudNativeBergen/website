/**
 * @vitest-environment node
 *
 * Tests for the edge middleware in `src/proxy.ts` — previously ZERO coverage
 * (its scoped threshold was gated at 0 to keep the gap visible). The middleware
 * is the app's first auth gate, so its routing and production guards are
 * security-relevant:
 *   - path routing: /workshop → WorkOS, protected /cfp|/admin|/cli → NextAuth,
 *     everything else (incl. bare /cfp) → pass-through.
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
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest, type NextFetchEvent } from 'next/server'

const h = vi.hoisted(() => ({
  // Mutable environment flags, read via getters on the mocked AppEnvironment.
  env: { isTestMode: false, isDevelopment: false, isProduction: false },
  // Sentinel returned by the mocked WorkOS middleware so we can assert routing.
  workOSResult: { __workos: true },
  workOSMiddleware: vi.fn(),
}))

vi.mock('@workos-inc/authkit-nextjs', () => ({
  authkitMiddleware: vi.fn(() => h.workOSMiddleware),
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

beforeEach(() => {
  vi.clearAllMocks()
  h.env.isTestMode = false
  h.env.isDevelopment = false
  h.env.isProduction = false
  h.workOSMiddleware.mockReturnValue(h.workOSResult)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('middleware — path routing', () => {
  it('routes /workshop to the WorkOS middleware', () => {
    const result = middleware(req('/workshop'), event)
    expect(h.workOSMiddleware).toHaveBeenCalledOnce()
    expect(result).toBe(h.workOSResult)
  })

  it('routes nested /workshop/* to the WorkOS middleware', () => {
    const result = middleware(req('/workshop/agenda'), event)
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

describe('middleware — NextAuth gate (unauthenticated)', () => {
  it.each(['/cfp/list', '/admin/sponsors', '/cli/token'])(
    'redirects an unauthenticated request to %s to sign-in with callbackUrl',
    (path) => {
      const res = middleware(req(path), event) as Response
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
  it('forwards an authenticated request and sets the x-url header', () => {
    const res = middleware(
      req('/admin/sponsors', { authUser: ORGANIZER_ID }),
      event,
    ) as Response
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
    (path) => {
      const res = middleware(
        req(path, { authUser: ORGANIZER_ID }),
        event,
      ) as Response
      expect(res.status).toBe(404)
    },
  )

  it('strips the impersonate param and redirects in production', () => {
    const res = middleware(
      req('/admin/sponsors?impersonate=someone', { authUser: ORGANIZER_ID }),
      event,
    ) as Response
    expect(res.status).toBe(307)
    const url = new URL(res.headers.get('location')!)
    expect(url.searchParams.has('impersonate')).toBe(false)
    expect(url.pathname).toBe('/admin/sponsors')
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('[SECURITY] Impersonation attempt blocked'),
    )
  })

  it('forwards a clean authenticated admin request in production', () => {
    const res = middleware(
      req('/admin/sponsors', { authUser: ORGANIZER_ID }),
      event,
    ) as Response
    expect(res.headers.get('x-middleware-next')).toBe('1')
    expect(console.error).not.toHaveBeenCalled()
  })

  it('does NOT strip impersonate outside production', () => {
    // NODE_ENV is stubbed to production in this describe; override back.
    vi.stubEnv('NODE_ENV', 'development')
    const res = middleware(
      req('/admin/sponsors?impersonate=someone', { authUser: ORGANIZER_ID }),
      event,
    ) as Response
    // Authenticated + no production strip → forwarded, not redirected.
    expect(res.headers.get('x-middleware-next')).toBe('1')
    expect(console.error).not.toHaveBeenCalled()
  })
})

describe('middleware — dev test-mode bypass', () => {
  it('bypasses auth when dev test-mode is active, even unauthenticated', () => {
    h.env.isDevelopment = true
    h.env.isTestMode = true
    const res = middleware(req('/admin/sponsors'), event) as Response
    // Bypass → NextResponse.next, no sign-in redirect despite no auth.
    expect(res.headers.get('x-middleware-next')).toBe('1')
    expect(res.status).not.toBe(307)
  })

  it('honours the ?test=true param in development', () => {
    h.env.isDevelopment = true
    h.env.isTestMode = false
    const res = middleware(req('/admin/sponsors?test=true'), event) as Response
    expect(res.headers.get('x-middleware-next')).toBe('1')
  })
})
