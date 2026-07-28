import { auth } from '@/lib/auth'
import {
  NextResponse,
  type NextRequest,
  type NextFetchEvent,
} from 'next/server'
import { AppEnvironment } from '@/lib/environment/config'
import {
  applySessionCookieDomain,
  sessionCookieRequestHost,
} from '@/lib/auth-cookie-domain'
import { authkitMiddleware } from '@workos-inc/authkit-nextjs'

const workOSMiddleware = authkitMiddleware({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: [],
  },
  debug: process.env.NODE_ENV === 'development',
})

const rawNextAuthMiddleware = auth((req) => {
  const { pathname } = req.nextUrl
  const hasTestParam = req.nextUrl.searchParams.get('test') === 'true'

  if (process.env.NODE_ENV === 'production') {
    if (
      pathname.startsWith('/api/dev/') ||
      pathname.includes('clear-storage') ||
      pathname.includes('debug') ||
      pathname.includes('test-mode')
    ) {
      return new NextResponse('Not Found', { status: 404 })
    }

    // SECURITY: Block impersonation in production by rejecting any URL with impersonate parameter
    if (req.nextUrl.searchParams.has('impersonate')) {
      console.error(
        `[SECURITY] Impersonation attempt blocked in production: ${pathname}?${req.nextUrl.searchParams.toString()}`,
      )
      // Remove the impersonate parameter and redirect
      const url = req.nextUrl.clone()
      url.searchParams.delete('impersonate')
      return NextResponse.redirect(url)
    }
  }

  const isTestModeActive =
    AppEnvironment.isDevelopment && (AppEnvironment.isTestMode || hasTestParam)

  if (isTestModeActive) {
    return NextResponse.next()
  }

  if (!req.auth) {
    const signInPage = '/api/auth/signin'
    const signInUrl = new URL(signInPage, req.nextUrl.origin)
    signInUrl.searchParams.append('callbackUrl', req.url)
    return NextResponse.redirect(signInUrl)
  }

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-url', req.url)

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
})

/**
 * The NextAuth middleware, with the session cookie's `Domain` rewritten PER
 * REQUEST from the actual host.
 *
 * next-auth's middleware wrapper appends the Set-Cookie headers of its internal
 * `session` action onto the response (`handleAuth` in `next-auth/lib/index.js`),
 * and the JWT session strategy RE-ISSUES the session cookie on every such call
 * to slide its expiry. Without this pass those rolling refreshes would be
 * host-only while the `/api/auth/*` responses were `Domain`-scoped, so a signed
 * in user on a subdomain would end up with two competing cookies. The wrapper
 * is applied OUTSIDE `auth(...)` so the `auth((req) => …)` call shape — the one
 * the #671 outage broke — is completely untouched.
 */
const nextAuthMiddleware = async (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string | string[] | undefined>> },
) => {
  const res = await rawNextAuthMiddleware(req, ctx)
  if (!res) return res
  return applySessionCookieDomain(res, sessionCookieRequestHost(req.headers))
}

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/workshop')) {
    return workOSMiddleware(req, event)
  }

  if (
    (pathname.startsWith('/cfp') && pathname !== '/cfp') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/cli')
  ) {
    return nextAuthMiddleware(req, { params: Promise.resolve({}) })
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/cfp/:path*',
    '/admin/:path*',
    '/cli/:path*',
    '/workshop',
    '/workshop/:path*',
  ],
}
