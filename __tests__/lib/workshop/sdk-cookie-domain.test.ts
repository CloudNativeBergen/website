/**
 * @vitest-environment node
 *
 * THE POSITIVE CONTROL for "the session cookie stays host-only" (#1296).
 *
 * Every other suite asserts that the cookies this app issues carry no `Domain`
 * attribute. On its own that proves little: those suites load the SDK with
 * `WORKOS_COOKIE_DOMAIN` unset, so there is nothing that COULD add one. This
 * file loads the REAL SDK with the variable set — the SDK captures it at import
 * — and shows two things by value:
 *
 *  1. the variable is real: left to itself, the SDK then scopes every cookie it
 *     sets to that domain, through both of its cookie paths;
 *  2. so the guard in `resolveWorkshopSignInHost` is what keeps the cookie
 *     host-only: with the variable set, this app never lets the SDK run.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { NextRequest, type NextFetchEvent } from 'next/server'
import { verifiedHost } from '../../helpers/workshopSignIn'
import { beginRequest, writtenCookies } from '../../helpers/nextHeadersJar'

const HOST = 'conf.example.org'
const COOKIE_DOMAIN = '.example.org'
const CALLBACK = `https://${HOST}/api/auth/callback`

vi.mock('@/lib/domain-verification/sanity', () => ({
  listAllowlistCandidates: async () => [verifiedHost(HOST)],
}))
vi.mock('next/headers', () => import('../../helpers/nextHeadersJar'))
// The sign-in route also asks the feature gate; it is ON, so the cookie-domain
// guard is the only thing that can refuse below.
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

let sdk: typeof import('@workos-inc/authkit-nextjs')
let proxy: typeof import('@/proxy').default
let signIn: typeof import('@/app/(workshop)/workshop/sign-in/route').GET

beforeAll(async () => {
  // Before the SDK is imported for the first time in this file's module graph.
  vi.stubEnv('WORKOS_CLIENT_ID', 'client_test')
  vi.stubEnv('WORKOS_API_KEY', 'sk_test_key')
  vi.stubEnv('WORKOS_COOKIE_PASSWORD', 'p'.repeat(48))
  vi.stubEnv('WORKOS_COOKIE_DOMAIN', COOKIE_DOMAIN)
  vi.stubEnv('NODE_ENV', 'production')
  sdk = await import('@workos-inc/authkit-nextjs')
  proxy = (await import('@/proxy')).default
  signIn = (await import('@/app/(workshop)/workshop/sign-in/route')).GET
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterAll(() => {
  vi.unstubAllEnvs()
})

function navigate(): NextRequest {
  return new NextRequest(`https://${HOST}/workshop`, {
    headers: new Headers({ host: HOST, accept: 'text/html' }),
  })
}

describe('the SDK with WORKOS_COOKIE_DOMAIN set', () => {
  it('scopes the cookie its middleware sets to that domain', async () => {
    const response = (await sdk.authkitMiddleware({
      redirectUri: CALLBACK,
      middlewareAuth: { enabled: true, unauthenticatedPaths: [] },
    })(navigate(), {} as NextFetchEvent)) as Response

    expect(response.headers.getSetCookie()[0].split('; ').slice(1)).toEqual([
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      'Max-Age=600',
      `Domain=${COOKIE_DOMAIN}`,
      'Secure',
    ])
  })

  it('scopes the cookies it sets through next/headers to that domain too', async () => {
    beginRequest(new Headers({ host: HOST }))

    await sdk.getSignInUrl({ redirectUri: CALLBACK })

    const [cookie] = writtenCookies()
    expect(cookie).toMatch(/^wos-auth-verifier-[0-9a-f]{8}=/)
    expect(cookie.split('; ')).toContain(`Domain=${COOKIE_DOMAIN}`)
  })
})

describe('this app with WORKOS_COOKIE_DOMAIN set', () => {
  it('never lets the SDK run: the proxy and the sign-in route answer 404 and set no cookie', async () => {
    const buildAuthorizationUrl = vi.spyOn(
      sdk.getWorkOS().userManagement,
      'getAuthorizationUrl',
    )
    const startSignIn = () => {
      beginRequest(new Headers({ host: HOST }))
      return signIn(navigate())
    }

    const response = (await proxy(navigate(), {} as NextFetchEvent)) as Response
    const started = await startSignIn()

    expect(response.status).toBe(404)
    expect(response.headers.getSetCookie()).toEqual([])
    expect(started.status).toBe(404)
    expect(writtenCookies()).toEqual([])
    expect(buildAuthorizationUrl).not.toHaveBeenCalled()

    // CONTROL: it is the GUARD that refused, not the allowlist or the fixture.
    // Hide the variable from the guard (which reads it per call; the SDK
    // captured it at load) and the very same requests go through — the sign-in
    // carrying exactly the widened cookie the guard exists to prevent.
    vi.stubEnv('WORKOS_COOKIE_DOMAIN', '')
    const through = (await proxy(navigate(), {} as NextFetchEvent)) as Response
    const startedThrough = await startSignIn()
    vi.stubEnv('WORKOS_COOKIE_DOMAIN', COOKIE_DOMAIN)

    expect(through.headers.get('x-middleware-next')).toBe('1')
    expect(startedThrough.status).toBe(307)
    expect(writtenCookies()[0].split('; ')).toContain(`Domain=${COOKIE_DOMAIN}`)
  })
})
