/**
 * @vitest-environment node
 *
 * The GET route that redeems an emailed link. What matters here is not the
 * happy path (covered by verify/identity) but the HYGIENE of the response: the
 * token must not leak via Referer or a cache, and every failure must look the
 * same from the outside.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockSignIn } = vi.hoisted(() => ({ mockSignIn: vi.fn() }))

vi.mock('@/lib/auth', () => ({ signIn: mockSignIn }))

import { GET } from '@/app/api/auth/email-link/callback/route'
import { AuthError } from 'next-auth'

const ORIGIN = 'https://tenant-a.example.com'

function request(query: string) {
  return new NextRequest(
    `${ORIGIN}/api/auth/email-link/callback${query}`,
    { headers: { host: 'tenant-a.example.com' } },
  )
}

describe('email-link callback route', () => {
  beforeEach(() => vi.clearAllMocks())

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
})
