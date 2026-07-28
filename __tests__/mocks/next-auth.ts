import { vi } from 'vitest'

import { NextAuthRequest } from '@/lib/auth'
import { NextRequest } from 'next/server'
import { Account } from 'next-auth'
import speakers from '../testdata/speakers'
import { Speaker } from '@/lib/speaker/types'

export class AuthError extends Error {
  type: string
  constructor(type: string) {
    super(type)
    this.type = type
  }
}

/**
 * Stand-in for @auth/core's `/api/auth/*` responses.
 *
 * The real handlers emit `Set-Cookie` headers we cannot produce here without a
 * live OAuth round-trip, so the mock ECHOES them instead: a request carrying an
 * `x-mock-set-cookie` header (a JSON array of raw `Set-Cookie` values) gets each
 * entry back on the response. That lets a test drive the app's REAL exported
 * `handlers` — including the per-request session-cookie `Domain` rewrite wrapped
 * around them in `src/lib/auth.ts` — with a deterministic cookie payload.
 */
function mockAuthRouteResponse(req?: { headers?: Headers }): Response {
  const res = new Response(null, { status: 200 })
  const raw = req?.headers?.get?.('x-mock-set-cookie')
  if (raw) {
    for (const value of JSON.parse(raw) as string[]) {
      res.headers.append('set-cookie', value)
    }
  }
  return res
}

const NextAuth = () => ({
  auth: vi.fn((handler: (req: NextAuthRequest, ctx: any) => any) => {
    return (req: NextAuthRequest, ctx: any) => {
      if (!req) req = {} as NextAuthRequest

      let user: Speaker | undefined

      if (req.headers && req.headers.get('x-test-auth-user')) {
        user = speakers.find(
          (speaker) => speaker._id === req.headers.get('x-test-auth-user'),
        )
      }

      if (user) {
        const account: Account = {
          provider: 'github',
          providerAccountId: '123',
          access_token: 'abc',
          type: 'oidc',
        }

        req.auth = {
          expires: (Date.now() + 1000).toString(),
          user: {
            email: user.email!,
            name: user.name,
            picture: 'https://example.com/foo.jpg',
          },
          speaker: {
            _id: user._id!,
            isOrganizer: user.isOrganizer === true,
          },
          account,
        }
      }

      const res = handler(req, ctx)

      // Mirror next-auth's `handleAuth`, which APPENDS the Set-Cookie headers of
      // its internal `session` action (the JWT strategy re-issues the session
      // cookie on every call to slide its expiry) onto the handler's response.
      // Driven by the same `x-mock-set-cookie` request header as the route
      // handlers above, so a test can exercise the middleware's own cookie path.
      const raw = req?.headers?.get?.('x-mock-set-cookie')
      if (raw && res && typeof res === 'object' && 'headers' in res) {
        for (const value of JSON.parse(raw) as string[]) {
          ;(res as Response).headers.append('set-cookie', value)
        }
      }
      return res
    }
  }),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {
    GET: vi.fn(mockAuthRouteResponse),
    POST: vi.fn(mockAuthRouteResponse),
  },
  AuthError: AuthError,
})

export default NextAuth
