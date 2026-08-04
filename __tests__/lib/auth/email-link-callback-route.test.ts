/**
 * @vitest-environment node
 *
 * The GET route that redeems an emailed link. What matters here is not the
 * happy path (covered by verify/identity) but the HYGIENE of the response: the
 * token must not leak via Referer or a cache, and every failure must look the
 * same from the outside.
 */
import { createHash } from 'crypto'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockSignIn } = vi.hoisted(() => ({ mockSignIn: vi.fn() }))

vi.mock('@/lib/auth', () => ({ signIn: mockSignIn }))

import { GET } from '@/app/api/auth/email-link/callback/route'
import {
  EMAIL_LINK_INTENT_COOKIE,
  EMAIL_LINK_PENDING_COOKIE,
  emailLinkIntentValue,
} from '@/lib/auth/email-link/intent'
import { AuthError } from 'next-auth'

const ORIGIN = 'https://tenant-a.example.com'

/** Extract the token from a `?token=…` query so the intent cookie can match it. */
function tokenOf(query: string): string | null {
  return new URLSearchParams(query.replace(/^\?/, '')).get('token')
}

/**
 * A redemption from THE BROWSER THAT REQUESTED THE LINK — the fast path. The
 * intent cookie is what proves that, so every pre-existing expectation about
 * this route now needs it (see `intent.ts`).
 */
function request(query: string) {
  const headers: Record<string, string> = { host: 'tenant-a.example.com' }
  const token = tokenOf(query)
  if (token) {
    headers.cookie = `${EMAIL_LINK_INTENT_COOKIE}=${emailLinkIntentValue(token)}`
  }
  return new NextRequest(`${ORIGIN}/api/auth/email-link/callback${query}`, {
    headers,
  })
}

/** A redemption WITHOUT that proof: cross-device, or an induced navigation. */
function unprovenRequest(query: string, cookie?: string) {
  const headers: Record<string, string> = { host: 'tenant-a.example.com' }
  if (cookie) headers.cookie = cookie
  return new NextRequest(`${ORIGIN}/api/auth/email-link/callback${query}`, {
    headers,
  })
}

describe('email-link callback route', () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = 'test-auth-secret-value'
    vi.clearAllMocks()
  })

  it('never lets the token escape via Referer, a cache or an index', async () => {
    mockSignIn.mockResolvedValue(`${ORIGIN}/cfp/list`)
    const res = await GET(request('?token=st1.aaa.bbb&callbackUrl=/cfp/list'))

    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(res.headers.get('x-robots-tag')).toContain('noindex')

    const location = res.headers.get('location')!
    expect(location).toBe(`${ORIGIN}/cfp/list`)
    expect(location).not.toContain('token')
  })

  it('passes the token to the credentials flow and nothing else', async () => {
    mockSignIn.mockResolvedValue(`${ORIGIN}/`)
    await GET(request('?token=st1.aaa.bbb&callbackUrl=/admin'))

    expect(mockSignIn).toHaveBeenCalledWith(
      'email-link',
      expect.objectContaining({
        token: 'st1.aaa.bbb',
        redirect: false,
        redirectTo: '/admin',
      }),
    )
  })

  it('refuses a hostile callbackUrl before it reaches sign-in', async () => {
    mockSignIn.mockResolvedValue(`${ORIGIN}/`)
    await GET(request('?token=st1.aaa.bbb&callbackUrl=https://evil.example/x'))
    expect(mockSignIn).toHaveBeenCalledWith(
      'email-link',
      expect.objectContaining({ redirectTo: '/' }),
    )
  })

  it('gives the SAME opaque response for every kind of invalid token', async () => {
    const outcomes = []

    // No token at all.
    outcomes.push(await GET(request('')))

    // authorize() returned null → @auth/core throws CredentialsSignin.
    mockSignIn.mockRejectedValue(new AuthError('CredentialsSignin'))
    outcomes.push(await GET(request('?token=st1.expired.sig')))
    outcomes.push(await GET(request('?token=sd1.alreadyused')))
    outcomes.push(await GET(request('?token=garbage')))

    // An unexpected internal failure must not look different either.
    mockSignIn.mockRejectedValue(new Error('sanity down'))
    outcomes.push(await GET(request('?token=st1.aaa.bbb')))

    for (const res of outcomes) {
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toBe(
        `${ORIGIN}/signin?error=EmailSignIn`,
      )
      expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    }
  })

  it('never redirects off-origin, even if sign-in returns a foreign URL', async () => {
    mockSignIn.mockResolvedValue('https://evil.example/steal')
    const res = await GET(request('?token=st1.aaa.bbb'))
    expect(res.headers.get('location')).toBe(
      `${ORIGIN}/signin?error=EmailSignIn`,
    )
  })

  it('spends the intent cookie, so a replay is no longer proven', async () => {
    mockSignIn.mockResolvedValue(`${ORIGIN}/`)
    const res = await GET(request('?token=st1.aaa.bbb'))
    const cleared = res.cookies.get(EMAIL_LINK_INTENT_COOKIE)
    expect(cleared?.value).toBe('')
  })
})

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * F3 — LOGIN CSRF.
 * ─────────────────────────────────────────────────────────────────────────────
 * The attack: an attacker requests a link for THEIR OWN address and induces a
 * victim's browser to make a top-level navigation to it. Previously this GET
 * minted a session immediately (server-side `signIn` runs with
 * `skipCSRFCheck`), silently switching the victim to the attacker's account —
 * over an existing session, with no UI signal.
 *
 * A GET can no longer mint anything unless the browser proves it asked for the
 * link. Everything else is handed to the confirmation interstitial, whose
 * continue control is a server action (a POST Next refuses cross-origin).
 */
describe('login CSRF on the redemption GET (F3 reproduction)', () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = 'test-auth-secret-value'
    vi.clearAllMocks()
  })

  it('does NOT sign in from an attacker-induced navigation', async () => {
    mockSignIn.mockResolvedValue(`${ORIGIN}/`)
    const res = await GET(unprovenRequest('?token=st1.attacker.link'))

    expect(mockSignIn).not.toHaveBeenCalled()
    expect(res.headers.get('location')).toBe(`${ORIGIN}/signin/confirm`)
    // The token moves in an HttpOnly cookie, never in the interstitial's URL.
    expect(res.headers.get('location')).not.toContain('token')
    const pending = res.cookies.get(EMAIL_LINK_PENDING_COOKIE)
    expect(pending?.httpOnly).toBe(true)
    expect(pending?.sameSite).toBe('lax')
    expect(JSON.parse(pending!.value)).toEqual({
      t: 'st1.attacker.link',
      c: '/',
    })
  })

  it('does not accept an intent cookie minted for a DIFFERENT token', async () => {
    mockSignIn.mockResolvedValue(`${ORIGIN}/`)
    const res = await GET(
      unprovenRequest(
        '?token=st1.attacker.link',
        `${EMAIL_LINK_INTENT_COOKIE}=${emailLinkIntentValue('st1.victims.own.link')}`,
      ),
    )
    expect(mockSignIn).not.toHaveBeenCalled()
    expect(res.headers.get('location')).toBe(`${ORIGIN}/signin/confirm`)
  })

  it('cannot be satisfied by a guessed or forged intent value', async () => {
    mockSignIn.mockResolvedValue(`${ORIGIN}/`)
    for (const forged of [
      'x'.repeat(64),
      // The unsalted hash an attacker who holds the token could compute.
      createHash('sha256').update('st1.attacker.link').digest('hex'),
    ]) {
      const res = await GET(
        unprovenRequest(
          '?token=st1.attacker.link',
          `${EMAIL_LINK_INTENT_COOKIE}=${forged}`,
        ),
      )
      expect(res.headers.get('location')).toBe(`${ORIGIN}/signin/confirm`)
    }
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it('carries the sanitized callback path through the handoff', async () => {
    const res = await GET(
      unprovenRequest('?token=st1.a.b&callbackUrl=https://evil.example/x'),
    )
    expect(
      JSON.parse(res.cookies.get(EMAIL_LINK_PENDING_COOKIE)!.value).c,
    ).toBe('/')
  })
})

/**
 * The pending cookie holds an UNREDEEMED sign-in token, so whether it is marked
 * `Secure` decides whether that bearer credential may travel in clear text.
 *
 * The rest of this file builds requests over `https://`, which made every
 * existing assertion about the cookie pass for the wrong reason: on Vercel TLS
 * terminates at the edge and the handler sees `http://`, so the flag has to come
 * from `x-forwarded-proto`, not from the request URL.
 */
describe('pending-cookie Secure flag behind a TLS-terminating proxy', () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = 'test-auth-secret-value'
    vi.clearAllMocks()
  })

  /** An unproven redemption (so the pending cookie is written) on a given URL. */
  function proxied(url: string, forwardedProto?: string) {
    const headers: Record<string, string> = { host: 'tenant-a.example.com' }
    if (forwardedProto !== undefined) {
      headers['x-forwarded-proto'] = forwardedProto
    }
    return new NextRequest(
      `${url}/api/auth/email-link/callback?token=st1.a.b`,
      {
        headers,
      },
    )
  }

  it('marks it Secure when the proxy reports HTTPS, though the handler sees HTTP', async () => {
    const res = await GET(proxied('http://tenant-a.example.com', 'https'))
    expect(res.cookies.get(EMAIL_LINK_PENDING_COOKIE)?.secure).toBe(true)
  })

  it('reads only the first hop of a forwarded chain', async () => {
    const res = await GET(proxied('http://tenant-a.example.com', 'https,http'))
    expect(res.cookies.get(EMAIL_LINK_PENDING_COOKIE)?.secure).toBe(true)
  })

  it('leaves it unset for plain-HTTP local dev, where Secure would discard it', async () => {
    const res = await GET(proxied('http://localhost:3000'))
    expect(res.cookies.get(EMAIL_LINK_PENDING_COOKIE)?.secure).toBe(false)
  })

  it('honours a proxy that reports plain HTTP', async () => {
    const res = await GET(proxied('http://tenant-a.example.com', 'http'))
    expect(res.cookies.get(EMAIL_LINK_PENDING_COOKIE)?.secure).toBe(false)
  })
})
