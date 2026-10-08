/**
 * @vitest-environment node
 *
 * `GET /api/auth/callback` — where WorkOS sends the authorization code back
 * (#1296). Run against the REAL `@workos-inc/authkit-nextjs`: the sign-in is
 * STARTED by the real proxy (so the state and the PKCE cookie are the SDK's
 * own) and FINISHED by the real callback handler.
 *
 * Two boundaries are supplied:
 *  - the Sanity read behind the verified-redirect allowlist;
 *  - WorkOS's token endpoint (`authenticateWithCode`), the one network call.
 *
 * `next/headers` is backed by a real `NextResponse` (see `nextHeadersJar.ts`),
 * so the session cookie asserted below is serialized by Next's own cookie code.
 *
 * The suite-wide `jose` stub is in force here and does not matter: the callback
 * handler never touches `jose` (it seals whatever tokens WorkOS returns), which
 * is why a non-JWT access token is enough for these cases.
 */
import '../../helpers/workosEnv'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest, type NextFetchEvent } from 'next/server'
import type { DomainVerificationRecord } from '@/lib/domain-verification/types'
import { verifiedHost } from '../../helpers/workshopSignIn'
import { beginRequest, writtenCookies } from '../../helpers/nextHeadersJar'

const listAllowlistCandidates =
  vi.fn<() => Promise<DomainVerificationRecord[]>>()

vi.mock('@/lib/domain-verification/sanity', () => ({
  listAllowlistCandidates: () => listAllowlistCandidates(),
}))

vi.mock('next/headers', () => import('../../helpers/nextHeadersJar'))

import middleware from '@/proxy'
import { GET } from '@/app/api/auth/callback/route'
import { getWorkOS } from '@workos-inc/authkit-nextjs'

const TENANT_A = 'a.example.org'
const TENANT_B = 'b.example.org'
const UNVERIFIED = 'unverified.example.org'

const WORKOS_USER = {
  id: 'user_01',
  email: 'ada@example.com',
  emailVerified: true,
  firstName: 'Ada',
  lastName: 'Lovelace',
}

const exchangeCode = vi.spyOn(
  getWorkOS().userManagement,
  'authenticateWithCode',
)

/**
 * Start a real sign-in on `host` through the proxy and return what the browser
 * would carry to the callback: the `state` WorkOS echoes back, and the PKCE
 * verifier cookie the proxy set on that host.
 */
async function startSignIn(host: string, path = '/workshop') {
  const response = (await middleware(
    new NextRequest(`https://${host}${path}`, {
      headers: new Headers({ host, accept: 'text/html' }),
    }),
    {} as NextFetchEvent,
  )) as Response
  const state = new URL(response.headers.get('location')!).searchParams.get(
    'state',
  )!
  const cookie = response.headers.getSetCookie()[0].split(';')[0]
  return { state, cookie }
}

/** WorkOS redirecting the browser back to `host` with a code. */
function callback(
  host: string,
  flow: { state: string; cookie: string },
  urlHost = host,
): NextRequest {
  const url = new URL(`https://${urlHost}/api/auth/callback`)
  url.searchParams.set('code', 'code_from_workos')
  url.searchParams.set('state', flow.state)
  return new NextRequest(url, {
    headers: new Headers({ host, cookie: flow.cookie }),
  })
}

/** The session cookie the handler wrote, as Next serializes it. */
function sessionCookie(): string | undefined {
  return writtenCookies().find((c) => c.startsWith('wos-session='))
}

beforeEach(() => {
  vi.clearAllMocks()
  beginRequest()
  listAllowlistCandidates.mockResolvedValue([
    verifiedHost(TENANT_A),
    verifiedHost(TENANT_B),
  ])
  exchangeCode.mockResolvedValue({
    accessToken: 'access.token.value',
    refreshToken: 'refresh_token_value',
    user: WORKOS_USER,
  } as never)
  vi.stubEnv('NODE_ENV', 'production')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('WorkOS callback — on an allowlisted host', () => {
  it('exchanges the code with the PKCE verifier and lands on that host’s portal', async () => {
    const flow = await startSignIn(TENANT_A)

    const response = await GET(callback(TENANT_A, flow))

    expect(exchangeCode).toHaveBeenCalledOnce()
    expect(exchangeCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'code_from_workos',
        codeVerifier: expect.stringMatching(/^[\w-]{43,}$/),
      }),
    )
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      `https://${TENANT_A}/workshop`,
    )
  })

  it('seals the session in a HOST-ONLY cookie', async () => {
    const flow = await startSignIn(TENANT_A)
    await GET(callback(TENANT_A, flow))

    // The COMPLETE set of attribute names, by equality: a `Domain` among them
    // is what `WORKOS_COOKIE_DOMAIN` produces (`sdk-cookie-domain.test.ts`).
    const names = sessionCookie()!
      .split('; ')
      .slice(1)
      .map((attribute) => attribute.split('=')[0])
    expect(names).toEqual([
      'Path',
      'Expires',
      'Max-Age',
      'Secure',
      'HttpOnly',
      'SameSite',
    ])
  })

  it('returns the attendee to the exact path and query they first asked for', async () => {
    // The proxy seals the requested URL into the state; nothing else carries it.
    const flow = await startSignIn(TENANT_A, '/workshop?from=email&x=1')

    const response = await GET(callback(TENANT_A, flow))

    expect(response.headers.get('location')).toBe(
      `https://${TENANT_A}/workshop?from=email&x=1`,
    )
  })

  it('sends the browser to the ALLOWLISTED origin, whatever the request URL claims', async () => {
    const flow = await startSignIn(TENANT_A)

    // Host header says the verified host; the URL the framework reconstructed
    // says something else. Only the matched origin is ever redirected to.
    const response = await GET(
      callback(TENANT_A, flow, 'internal-7f3a.example.org'),
    )

    expect(response.headers.get('location')).toBe(
      `https://${TENANT_A}/workshop`,
    )
  })

  it('keeps two hosts apart: each flow completes on its own host', async () => {
    const a = await startSignIn(TENANT_A)
    const b = await startSignIn(TENANT_B)

    const first = await GET(callback(TENANT_A, a))
    const second = await GET(callback(TENANT_B, b))

    expect(first.headers.get('location')).toBe(`https://${TENANT_A}/workshop`)
    expect(second.headers.get('location')).toBe(`https://${TENANT_B}/workshop`)
  })
})

describe('WorkOS callback — on any other host', () => {
  it('exchanges NOTHING, even with a valid state and verifier cookie', async () => {
    // A complete, genuine flow — started while the host WAS verified.
    listAllowlistCandidates.mockResolvedValue([verifiedHost(UNVERIFIED)])
    const flow = await startSignIn(UNVERIFIED)

    // The host is delisted before the code comes back.
    listAllowlistCandidates.mockResolvedValue([verifiedHost(TENANT_A)])
    const response = await GET(callback(UNVERIFIED, flow))

    expect(response.status).toBe(404)
    expect(exchangeCode).not.toHaveBeenCalled()
    expect(sessionCookie()).toBeUndefined()
    expect(response.headers.get('location')).toBeNull()
  })

  it('answers 404 — not the SDK’s error page — when the request carries no code at all', async () => {
    // Without a code the SDK would answer 500 by itself; the guard must not
    // depend on the request looking like a real callback.
    const response = await GET(
      new NextRequest(`https://${UNVERIFIED}/api/auth/callback`, {
        headers: new Headers({ host: UNVERIFIED }),
      }),
    )

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Not Found')
  })

  it('takes the host from the Host header: a verified x-forwarded-host or URL does not admit it', async () => {
    const flow = await startSignIn(TENANT_A)
    const url = new URL(`https://${TENANT_A}/api/auth/callback`)
    url.searchParams.set('code', 'code_from_workos')
    url.searchParams.set('state', flow.state)

    const response = await GET(
      new NextRequest(url, {
        headers: new Headers({
          host: UNVERIFIED,
          'x-forwarded-host': TENANT_A,
          cookie: flow.cookie,
        }),
      }),
    )

    expect(response.status).toBe(404)
    expect(exchangeCode).not.toHaveBeenCalled()
  })

  it('decides from the allowlist BEFORE calling WorkOS', async () => {
    const flow = await startSignIn(TENANT_A)
    listAllowlistCandidates.mockClear()

    await GET(callback(TENANT_A, flow))

    expect(listAllowlistCandidates).toHaveBeenCalledOnce()
    expect(listAllowlistCandidates.mock.invocationCallOrder[0]).toBeLessThan(
      exchangeCode.mock.invocationCallOrder[0],
    )
  })

  it('refuses when the allowlist cannot be read (fail closed)', async () => {
    const flow = await startSignIn(TENANT_A)
    listAllowlistCandidates.mockRejectedValue(new Error('sanity unavailable'))

    const response = await GET(callback(TENANT_A, flow))

    expect(response.status).toBe(404)
    expect(exchangeCode).not.toHaveBeenCalled()
  })
})
