import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { AppEnvironment } from '@/lib/environment/config'
import { sessionCookieRequestHost } from '@/lib/auth-cookie-domain'
import { IDENTITY_SESSION_COOKIE } from '@/lib/auth/identity-cookie'

// The session cookie's `Domain` is rewritten PER REQUEST for every response
// this produces: `auth` itself applies it to its handler-wrapper form (see
// `perRequestAuth` in `@/lib/auth`), so the middleware's rolling session
// refresh is scoped to the ACTUAL request host, not a module-load constant
// (#682). Wrapping inside `auth` rather than around it also leaves the
// `auth((req) => …)` call shape — the one the #671 outage broke — untouched.
const nextAuthMiddleware = auth(async (req) => {
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

  if (!req.auth && !(await identitySignedIn(req))) {
    const signInPage = '/api/auth/signin'
    const signInUrl = new URL(signInPage, req.nextUrl.origin)
    // A same-site path, not `req.url`: the email-link flow's
    // `safeCallbackPath` collapses any absolute URL to `/` (#1071).
    signInUrl.searchParams.append(
      'callbackUrl',
      req.nextUrl.pathname + req.nextUrl.search,
    )
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
 * Identity session cookie (#1892): a gate only. The proxy runs outside the
 * React server layer, so it must not reach `'use cache'` reads, `server-only`
 * modules or Sanity writes. It asks identity whether the session is live and
 * bound to this origin; the page's getAuthSession then applies the tenant
 * flag and maps the speaker, and redirects when either fails.
 */
async function identitySignedIn(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(IDENTITY_SESSION_COOKIE)?.value
  const host = sessionCookieRequestHost(req.headers)
  if (
    !token ||
    !host ||
    process.env.KONF_API_DISABLED === '1' ||
    !process.env.IDENTITY_URL
  ) {
    return false
  }
  try {
    const res = await fetch(
      new URL('/api/auth/get-session', process.env.IDENTITY_URL),
      {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      },
    )
    if (!res.ok) return false
    const got = (await res.json()) as { session?: { origin?: string } } | null
    return got?.session?.origin === `https://${host}`
  } catch (err) {
    // Error class and message only: no token, no user.
    console.error('[identity] proxy session check failed', String(err))
    return false
  }
}

/**
 * `/workshop*` IS NOT HANDLED HERE (#1311). The portal keeps a session of its
 * own, which the page and the `workshop.*` procedures read for themselves; the
 * routes that begin and redeem a sign-in take their own decision. Nothing on
 * that path needs a redirect or a header from the proxy, so it is not in the
 * matcher.
 */
export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

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
  matcher: ['/cfp/:path*', '/admin/:path*', '/cli/:path*'],
}
