/**
 * @vitest-environment node
 *
 * The SDK-backed entry points of the workshop portal (#1296), against the REAL
 * `@workos-inc/authkit-nextjs` AND the real `jose`:
 *
 *  - `GET /workshop/sign-in` and `/workshop/sign-up` — the links on the
 *    signed-out page. They replace a hand-built authorize URL that had no PKCE.
 *  - the sign-out action — it replaces a link to NextAuth's sign-out route,
 *    which never ended the WorkOS session at all.
 *
 * Boundaries supplied: the Sanity read behind the allowlist, WorkOS's token
 * endpoint, and `next/headers` (backed by a real `NextResponse`, see
 * `nextHeadersJar.ts`, so cookies are serialized by Next). `next/navigation` is
 * the real one: `redirect()` and `notFound()` throw, and the outcome is read
 * off the error's digest the way Next itself does.
 */
import '../../helpers/workosEnv'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { DomainVerificationRecord } from '@/lib/domain-verification/types'
import { verifiedHost } from '../../helpers/workshopSignIn'
import {
  beginRequest,
  presentCookie,
  writtenCookies,
} from '../../helpers/nextHeadersJar'

// The suite-wide `jose` alias is a stub without `decodeJwt`. Sign-out reads the
// session id out of the access token, so this file runs the real package (the
// same alias-defeating factory as `jwt-real-crypto.test.ts`).
vi.mock('jose', async () => {
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  return import(pathToFileURL(require.resolve('jose')).href)
})

const listAllowlistCandidates =
  vi.fn<() => Promise<DomainVerificationRecord[]>>()

vi.mock('@/lib/domain-verification/sanity', () => ({
  listAllowlistCandidates: () => listAllowlistCandidates(),
}))

vi.mock('next/headers', () => import('../../helpers/nextHeadersJar'))

import { GET as signIn } from '@/app/(workshop)/workshop/sign-in/route'
import { GET as signUp } from '@/app/(workshop)/workshop/sign-up/route'
import { GET as callback } from '@/app/api/auth/callback/route'
import { signOutOfWorkshop } from '@/app/(workshop)/workshop/actions'
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
  listAllowlistCandidates.mockResolvedValue([
    verifiedHost(TENANT_A),
    verifiedHost(TENANT_B),
  ])
  vi.stubEnv('NODE_ENV', 'production')
  vi.spyOn(console, 'error').mockImplementation(() => {})
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
    expect(cookie).not.toMatch(/;\s*domain=/i)
    expect(cookie).toMatch(/;\s*HttpOnly/i)
    expect(cookie).toMatch(/;\s*Secure/i)
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

  it('starts nothing on a host that is not allowlisted', async () => {
    const response = await handler(onHost(UNVERIFIED))

    expect(response.status).toBe(404)
    expect(response.headers.get('location')).toBeNull()
    expect(buildAuthorizationUrl).not.toHaveBeenCalled()
    expect(setCookies()).toEqual([])
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
    listAllowlistCandidates.mockResolvedValue([verifiedHost(TENANT_B)])
    const buildLogoutUrl = vi.spyOn(getWorkOS().userManagement, 'getLogoutUrl')

    const digest = await signOutOfWorkshop().then(
      () => 'resolved',
      (error: { digest?: string }) => error.digest ?? String(error),
    )

    expect(digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404')
    expect(buildLogoutUrl).not.toHaveBeenCalled()
    expect(setCookies()).toEqual([])

    // CONTROL: on the allowlisted host the same call does build it.
    listAllowlistCandidates.mockResolvedValue([verifiedHost(TENANT_A)])
    await redirectTarget(() => signOutOfWorkshop())
    expect(buildLogoutUrl).toHaveBeenCalledOnce()
  })
})
