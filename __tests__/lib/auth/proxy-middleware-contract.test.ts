/**
 * @vitest-environment node
 *
 * MIDDLEWARE-WRAPPER SHAPE CONTRACT — the unit-level guard for the #462 / #671
 * incident.
 *
 * The incident: PR #462 fed `NextAuth` a CONFIG FUNCTION (Auth.js "lazy" form).
 * In next-auth v5 that changes the shape of the returned `auth`, so the wrapper
 * `auth((req) => …)` in `src/proxy.ts` yielded a NON-function and every
 * authenticated route 500'd (`nextAuthMiddleware is not a function`).
 *
 * This test asserts the contract the proxy depends on, WITHOUT mocking
 * `@/lib/auth` (only next-auth itself is globally mocked in vitest.config, as it
 * is for every test): the exported `auth` must be callable and, given a request
 * handler, return a FUNCTION; and the proxy's default middleware export must be
 * a function that returns a Response for a protected route.
 *
 * IMPORTANT LIMITATION (why PART 2's post-build smoke test also exists): the
 * global next-auth mock's `auth()` returns a function REGARDLESS of whether the
 * real code passed a static object or a lazy function to `NextAuth`, so this
 * unit test CANNOT distinguish the two config shapes and would NOT, on its own,
 * have caught #462. It locks the export/wrapper contract at the source level;
 * the real regression is caught by the production-bundle smoke test in
 * `scripts/smoke-protected-routes.mjs` (CI job "Runtime Smoke Test").
 */
import { describe, it, expect, vi } from 'vitest'
import { NextRequest, type NextFetchEvent } from 'next/server'

// The proxy statically imports the WorkOS middleware factory and the app
// environment; stub both so importing the REAL proxy (and the REAL @/lib/auth)
// does not require a live WorkOS client or a fixed NODE_ENV. @/lib/auth is
// deliberately NOT mocked — this test exercises its real wrapper export.
vi.mock('@workos-inc/authkit-nextjs', () => ({
  authkitMiddleware: vi.fn(() => vi.fn()),
}))
vi.mock('@/lib/environment/config', () => ({
  AppEnvironment: {
    isTestMode: false,
    isDevelopment: false,
    isProduction: true,
    createMockAuthContext: () => ({ user: { email: 'mock@test' } }),
  },
}))

import { auth } from '@/lib/auth'
import middleware from '@/proxy'

describe('proxy middleware wrapper shape (#462 regression contract)', () => {
  it('exports `auth` as a callable that wraps a handler into a function', () => {
    expect(typeof auth).toBe('function')
    const wrapped = auth((() => undefined) as never)
    expect(typeof wrapped).toBe('function')
  })

  it('exports a middleware function that returns a Response for a protected route', async () => {
    expect(typeof middleware).toBe('function')
    const req = new NextRequest('http://localhost:3000/admin')
    const result = await middleware(req, {} as NextFetchEvent)
    // Unauthenticated → the wrapped middleware runs and redirects to sign-in.
    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBeGreaterThanOrEqual(300)
    expect((result as Response).status).toBeLessThan(400)
  })
})
