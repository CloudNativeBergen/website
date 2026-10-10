/**
 * @vitest-environment node
 *
 * The workshop branch of `src/proxy.ts` against the REAL
 * `@workos-inc/authkit-nextjs` (#1296). Nothing of the SDK is mocked: the
 * responses asserted here are what the installed package produces.
 *
 * THE PROXY NEVER SENDS ANYONE TO WORKOS (review of #1304). It decides from the
 * host alone and cannot know whether the tenant has workshops, so a signed-out
 * visitor is let through to the page, which checks the feature gate and only
 * then offers the sign-in routes. Those routes are where the authorize
 * redirect, the PKCE pair and the verifier cookie are proven
 * (`workos-sign-in-out.test.ts`).
 *
 * Only the Sanity persistence boundary is supplied (`getRedirectUriSyncRow`),
 * so the real allowlist policy and WorkOS registration standing decide which
 * hosts may sign in from their own records read by id.
 *
 * LIMIT OF THIS FILE: the suite aliases `jose` to a stub (see vitest.config),
 * and the SDK is inlined, so a request carrying a `wos-session` cookie would be
 * verified by that stub. Everything below is therefore about the SIGNED-OUT
 * path, which never reaches `jose`.
 */
import { WORKOS_ENV_FALLBACK_REDIRECT_URI as ENV_FALLBACK } from '../../helpers/workosEnv'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest, type NextFetchEvent } from 'next/server'
import type { RedirectUriSyncRow } from '@/lib/domain-verification/types'
import { signInHost, signInHostsById } from '../../helpers/workshopSignIn'

const getRedirectUriSyncRow =
  vi.fn<(id: string) => Promise<RedirectUriSyncRow | null>>()

vi.mock('@/lib/domain-verification/sanity', () => ({
  getRedirectUriSyncRow: (id: string) => getRedirectUriSyncRow(id),
}))

import middleware from '@/proxy'
import { getWorkOS } from '@workos-inc/authkit-nextjs'

const TENANT_A = 'a.example.org'
const TENANT_B = 'b.example.org'
const UNVERIFIED = 'unverified.example.org'

/** A browser navigating to `path` on `host`, signed out. */
function navigate(
  host: string,
  path = '/workshop',
  init: { scheme?: 'http' | 'https'; headers?: Record<string, string> } = {},
): NextRequest {
  return new NextRequest(`${init.scheme ?? 'https'}://${host}${path}`, {
    headers: new Headers({ host, accept: 'text/html', ...init.headers }),
  })
}

const event = {} as NextFetchEvent

async function run(request: NextRequest): Promise<Response> {
  return (await middleware(request, event)) as Response
}

/**
 * The callback the proxy handed the page for this request: the `x-redirect-uri`
 * REQUEST header the SDK sets, as Next carries it on a pass-through response.
 */
function callbackForPage(response: Response): string | null {
  return response.headers.get('x-middleware-request-x-redirect-uri')
}

/** Passed through to the app: no redirect anywhere, nothing set on the browser. */
function expectPassedThrough(response: Response) {
  expect(response.headers.get('x-middleware-next')).toBe('1')
  expect(response.headers.get('location')).toBeNull()
  expect(response.headers.getSetCookie()).toEqual([])
}

const buildAuthorizationUrl = vi.spyOn(
  getWorkOS().userManagement,
  'getAuthorizationUrl',
)
const generatePkce = vi.spyOn(getWorkOS().pkce, 'generate')

beforeEach(() => {
  vi.clearAllMocks()
  getRedirectUriSyncRow.mockImplementation(
    signInHostsById([signInHost(TENANT_A), signInHost(TENANT_B)]),
  )
  vi.stubEnv('NODE_ENV', 'production')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('workshop proxy — a signed-out visitor on an allowlisted host', () => {
  it('is let through to the page: no redirect to WorkOS and no cookie', async () => {
    expectPassedThrough(await run(navigate(TENANT_A)))
  })

  it.each([
    '/workshop/sign-in',
    '/workshop/sign-up',
    '/workshop/sign-in/x',
    '/workshop/agenda',
  ])('lets %s through the same way', async (path) => {
    expectPassedThrough(await run(navigate(TENANT_A, path)))
  })

  it('hands the page THAT host’s callback — never the env URI, never a client-sent x-redirect-uri', async () => {
    const response = await run(
      navigate(TENANT_A, '/workshop', {
        headers: { 'x-redirect-uri': 'https://evil.example.org/steal' },
      }),
    )

    // The fixture's env URI is a different host, so equality rules it out.
    expect(ENV_FALLBACK).not.toContain(TENANT_A)
    expect(callbackForPage(response)).toBe(
      `https://${TENANT_A}/api/auth/callback`,
    )
  })

  it('serves each host its own callback, request by request (nothing is captured)', async () => {
    const seen: (string | null)[] = []
    for (const host of [TENANT_A, TENANT_B, TENANT_A]) {
      seen.push(callbackForPage(await run(navigate(host))))
    }
    expect(seen).toEqual([
      `https://${TENANT_A}/api/auth/callback`,
      `https://${TENANT_B}/api/auth/callback`,
      `https://${TENANT_A}/api/auth/callback`,
    ])
  })
})

/**
 * WHICH VALUE IS "THE HOST". The `Host` header alone — the same one that
 * resolves the conference for the page. `x-forwarded-host` is client-supplied
 * wherever an edge does not overwrite it, and the request URL is whatever the
 * framework reconstructed. Neither may admit a host or name its callback.
 */
describe('workshop proxy — the host is the Host header, and nothing else', () => {
  /** A request whose three host-ish values are set independently. */
  function request(
    hosts: { host: string; forwarded: string; url: string },
    path = '/workshop',
  ) {
    return new NextRequest(`https://${hosts.url}${path}`, {
      headers: new Headers({
        host: hosts.host,
        'x-forwarded-host': hosts.forwarded,
        accept: 'text/html',
      }),
    })
  }

  it('refuses an unverified Host even when x-forwarded-host and the URL name a verified one', async () => {
    // /workshop itself now passes through marked (#1298), covered in proxy tests.
    const response = await run(
      request(
        { host: UNVERIFIED, forwarded: TENANT_A, url: TENANT_A },
        '/workshop/sign-in',
      ),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/workshop')
    expect(response.headers.getSetCookie()).toEqual([])
    expect(callbackForPage(response)).toBeNull()
    expect(buildAuthorizationUrl).not.toHaveBeenCalled()
    expect(generatePkce).not.toHaveBeenCalled()
  })

  it('serves a verified Host its own callback whatever x-forwarded-host and the URL say', async () => {
    const response = await run(
      request({ host: TENANT_A, forwarded: UNVERIFIED, url: TENANT_B }),
    )

    expectPassedThrough(response)
    expect(callbackForPage(response)).toBe(
      `https://${TENANT_A}/api/auth/callback`,
    )
  })
})

/**
 * THE SESSION COOKIE STAYS HOST-ONLY. A cookie without a `Domain` attribute is
 * sent back only to the exact host that set it, so a session (or a pending
 * sign-in) on one tenant's host is never presented on another's.
 */
describe('workshop proxy — cookies are host-only', () => {
  // The verifier cookie's own attributes are pinned where it is issued now:
  // `workos-sign-in-out.test.ts`, on the sign-in and sign-up routes.
  it('refuses every host when WORKOS_COOKIE_DOMAIN would widen the cookie', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('WORKOS_COOKIE_DOMAIN', '.example.org')

    // /workshop itself now passes through marked (#1298), covered in proxy tests.
    const response = await run(navigate(TENANT_A, '/workshop/sign-in'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/workshop')
    expect(response.headers.getSetCookie()).toEqual([])
    expect(callbackForPage(response)).toBeNull()
    expect(buildAuthorizationUrl).not.toHaveBeenCalled()
    expect(generatePkce).not.toHaveBeenCalled()
    logged.mockRestore()
  })
})

describe('workshop proxy — any other host', () => {
  it('sends /workshop/sign-in to the portal page — the app never sees the request', async () => {
    // /workshop itself now passes through marked (#1298), covered in proxy tests.
    const response = await run(navigate(UNVERIFIED, '/workshop/sign-in'))

    expect(response.status).toBe(307)
    expect(response.headers.get('x-middleware-next')).toBeNull()
    expect(response.headers.get('location')).toBe('/workshop')
    expect(response.headers.getSetCookie()).toEqual([])
    expect(callbackForPage(response)).toBeNull()
    expect(buildAuthorizationUrl).not.toHaveBeenCalled()
    expect(generatePkce).not.toHaveBeenCalled()
  })

  it('builds no authorize URL and no PKCE pair — the SDK is never entered', async () => {
    await run(navigate(UNVERIFIED))
    await run(navigate(UNVERIFIED, '/workshop/sign-in'))

    expect(buildAuthorizationUrl).not.toHaveBeenCalled()
    expect(generatePkce).not.toHaveBeenCalled()

    // CONTROL: the same spies DO fire for an allowlisted host, so the two
    // assertions above are about the refusal and not about dead spies.
    await run(navigate(TENANT_A))
    expect(buildAuthorizationUrl).toHaveBeenCalledOnce()
    expect(generatePkce).toHaveBeenCalledOnce()
  })

  it('decides from the host’s own sync row BEFORE the SDK does anything', async () => {
    await run(navigate(TENANT_A))

    expect(getRedirectUriSyncRow).toHaveBeenCalledOnce()
    expect(getRedirectUriSyncRow.mock.invocationCallOrder[0]).toBeLessThan(
      generatePkce.mock.invocationCallOrder[0],
    )
    expect(getRedirectUriSyncRow.mock.invocationCallOrder[0]).toBeLessThan(
      buildAuthorizationUrl.mock.invocationCallOrder[0],
    )
  })

  it('refuses when the host’s own sync row cannot be read (fail closed)', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    getRedirectUriSyncRow.mockRejectedValue(new Error('sanity unavailable'))

    // /workshop itself now passes through marked (#1298), covered in proxy tests.
    const response = await run(navigate(TENANT_A, '/workshop/sign-in'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/workshop')
    expect(response.headers.getSetCookie()).toEqual([])
    expect(callbackForPage(response)).toBeNull()
    expect(buildAuthorizationUrl).not.toHaveBeenCalled()
    expect(generatePkce).not.toHaveBeenCalled()
    logged.mockRestore()
  })

  it('refuses a request with no Host header at all', async () => {
    // /workshop itself now passes through marked (#1298), covered in proxy tests.
    const request = new NextRequest(`https://${TENANT_A}/workshop/sign-in`, {
      headers: new Headers({ accept: 'text/html' }),
    })
    const response = await run(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/workshop')
    expect(response.headers.getSetCookie()).toEqual([])
    expect(callbackForPage(response)).toBeNull()
    expect(buildAuthorizationUrl).not.toHaveBeenCalled()
    expect(generatePkce).not.toHaveBeenCalled()
  })

  it('does not let a subdomain or a look-alike borrow a verified host', async () => {
    // /workshop itself now passes through marked (#1298), covered in proxy tests.
    for (const host of [
      `sub.${TENANT_A}`,
      `${TENANT_A}.evil.example.org`,
      `evil-${TENANT_A}`,
    ]) {
      const response = await run(navigate(host, '/workshop/sign-in'))
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('/workshop')
      expect(response.headers.getSetCookie()).toEqual([])
      expect(callbackForPage(response)).toBeNull()
    }
    expect(buildAuthorizationUrl).not.toHaveBeenCalled()
    expect(generatePkce).not.toHaveBeenCalled()
  })
})

/**
 * The development-only `localhost` exception (parent #1293, decision 8).
 */
describe('workshop proxy — localhost', () => {
  it('is admitted over http in development, with its own callback', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const response = await run(
      navigate('localhost:3000', '/workshop', { scheme: 'http' }),
    )

    expectPassedThrough(response)
    expect(callbackForPage(response)).toBe(
      'http://localhost:3000/api/auth/callback',
    )
    expect(getRedirectUriSyncRow).not.toHaveBeenCalled()
  })

  it('is unreachable when NODE_ENV is production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    // Even with a record that says "verified" for it.
    getRedirectUriSyncRow.mockImplementation(
      signInHostsById([signInHost('localhost:3000'), signInHost('localhost')]),
    )

    // /workshop itself now passes through marked (#1298), covered in proxy tests.
    const response = await run(
      navigate('localhost:3000', '/workshop/sign-in', { scheme: 'http' }),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/workshop')
    expect(response.headers.getSetCookie()).toEqual([])
    expect(callbackForPage(response)).toBeNull()
    expect(buildAuthorizationUrl).not.toHaveBeenCalled()
    expect(generatePkce).not.toHaveBeenCalled()
  })
})

/**
 * A POST under `/workshop` is a server action (today: Sign Out). It is treated
 * like every other non-portal-view request: let through on a host that may sign
 * in, refused on one that may not. The action decides for itself, as an action
 * must anyway — it can be posted to paths this proxy never sees.
 */
describe('workshop proxy — a POST', () => {
  function post(host: string, headers: Record<string, string> = {}) {
    return new NextRequest(`https://${host}/workshop`, {
      method: 'POST',
      headers: new Headers({ host, accept: 'text/x-component', ...headers }),
    })
  }

  it.each([
    ['a server-action POST', { 'next-action': 'a1b2c3' }],
    ['a plain form POST (no JavaScript)', {}],
  ])('lets %s through, signed out', async (_label, headers) => {
    expectPassedThrough(await run(post(TENANT_A, headers)))
  })

  it('refuses a POST on a host that may not sign in', async () => {
    const response = await run(post(UNVERIFIED, { 'next-action': 'a1b2c3' }))

    expect(response.status).toBe(404)
    expect(buildAuthorizationUrl).not.toHaveBeenCalled()
  })
})

/**
 * THE PORTAL PAGE ON A HOST THAT CANNOT SIGN IN (#1298). `GET /workshop` alone
 * is let through, MARKED and without the SDK, so the page can tell an attendee
 * that sign-up is not available yet. Every other path and method stays a 404
 * (above). The mark is what keeps the page from calling `withAuth`, which would
 * throw without the SDK.
 */
describe('workshop proxy — the portal page on a host that cannot sign in', () => {
  const MARK = 'x-middleware-request-x-workshop-sign-in-unavailable'
  const UNREGISTERED = 'unregistered.example.org'

  beforeEach(() => {
    getRedirectUriSyncRow.mockImplementation(
      signInHostsById([
        signInHost(TENANT_A),
        signInHost(UNREGISTERED, {}, { status: null, id: null }),
      ]),
    )
  })

  it.each([
    ['an unverified host', UNVERIFIED],
    ['a verified host WorkOS has not registered', UNREGISTERED],
  ])('lets GET /workshop through, marked, on %s', async (_label, host) => {
    const response = await run(navigate(host))

    expectPassedThrough(response)
    expect(response.headers.get(MARK)).toBe('1')
    // No SDK: no callback handed over, no authorize URL, no PKCE pair.
    expect(callbackForPage(response)).toBeNull()
    expect(buildAuthorizationUrl).not.toHaveBeenCalled()
    expect(generatePkce).not.toHaveBeenCalled()
  })

  it('lets HEAD /workshop through, marked', async () => {
    const response = await run(
      new NextRequest(`https://${UNREGISTERED}/workshop`, {
        method: 'HEAD',
        headers: new Headers({ host: UNREGISTERED }),
      }),
    )
    expectPassedThrough(response)
    expect(response.headers.get(MARK)).toBe('1')
  })

  it('sends the sign-in routes there to the portal page — no bare 404, no SDK', async () => {
    for (const path of ['/workshop/sign-in', '/workshop/sign-up']) {
      const response = await run(navigate(UNREGISTERED, `${path}?x=1`))
      expect(response.status).toBe(307)
      // Relative: the browser stays on this host; nothing from the request
      // (Host, query) shapes the target.
      expect(response.headers.get('location')).toBe('/workshop')
      expect(response.headers.getSetCookie()).toEqual([])
    }
    expect(buildAuthorizationUrl).not.toHaveBeenCalled()
    expect(generatePkce).not.toHaveBeenCalled()
  })

  it('still 404s anything else under /workshop there, and any POST', async () => {
    expect(
      (await run(navigate(UNREGISTERED, '/workshop/sign-in/x'))).status,
    ).toBe(404)
    const post = new NextRequest(`https://${UNREGISTERED}/workshop/sign-in`, {
      method: 'POST',
      headers: new Headers({ host: UNREGISTERED }),
    })
    expect((await run(post)).status).toBe(404)
  })

  it('does not mark a host that CAN sign in, even when the client sends the mark', async () => {
    const response = await run(
      navigate(TENANT_A, '/workshop', {
        headers: { 'x-workshop-sign-in-unavailable': '1' },
      }),
    )

    // The SDK ran for it (it handed the page this host's callback).
    expectPassedThrough(response)
    expect(callbackForPage(response)).toBe(
      `https://${TENANT_A}/api/auth/callback`,
    )
    expect(response.headers.get(MARK)).toBeNull()
  })
})
