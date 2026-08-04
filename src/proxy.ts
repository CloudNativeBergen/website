import { auth } from '@/lib/auth'
import {
  NextResponse,
  type NextRequest,
  type NextFetchEvent,
} from 'next/server'
import { AppEnvironment } from '@/lib/environment/config'
import { authkitMiddleware } from '@workos-inc/authkit-nextjs'

const workOSMiddleware = authkitMiddleware({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: [],
  },
  debug: process.env.NODE_ENV === 'development',
})

// The session cookie's `Domain` is rewritten PER REQUEST for every response
// this produces: `auth` itself applies it to its handler-wrapper form (see
// `perRequestAuth` in `@/lib/auth`), so the middleware's rolling session
// refresh is scoped to the ACTUAL request host, not a module-load constant
// (#682). Wrapping inside `auth` rather than around it also leaves the
// `auth((req) => …)` call shape — the one the #671 outage broke — untouched.
const nextAuthMiddleware = auth((req) => {
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
 * CAPABILITY check (NOT the feature gate) for the workshop portal: the AuthKit
 * round-trip can only complete on the ONE host the global WorkOS client is
 * configured for — `wos-session` is sealed host-only on the redirect origin, so
 * on any other tenant domain the attendee bounces back to the sign-in button
 * forever (#689). Starting that round-trip from a foreign host is therefore
 * never useful, and it would happen BEFORE the request ever reaches the
 * portal's feature gate (middleware auth redirects unauthenticated users away).
 *
 * Returns false ONLY when the request host is positively known not to be the
 * WorkOS host. Both env vars the workshop flow uses are accepted
 * (`WORKOS_REDIRECT_URI` — the middleware's own callback — and
 * `NEXT_PUBLIC_URL`, from which the portal builds its authorize URL), and an
 * unset/unparsable configuration falls back to TRUE so a missing env var can
 * never take the portal down on the host where it works today.
 *
 * The feature gate proper (`isWorkshopsEnabledForConference`) lives in the
 * portal layout/page and the ticket-sold webhook, where a Sanity read is
 * possible; this only avoids an auth bounce that provably cannot succeed.
 */
function isWorkOSAuthHost(req: NextRequest): boolean {
  const host = req.headers.get('host')?.toLowerCase()
  if (!host) return true

  const configuredHosts = [
    process.env.WORKOS_REDIRECT_URI,
    process.env.NEXT_PUBLIC_URL,
  ].flatMap((value) => {
    if (!value) return []
    try {
      return [new URL(value).host.toLowerCase()]
    } catch {
      return []
    }
  })

  if (configuredHosts.length === 0) return true
  return configuredHosts.includes(host)
}

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/workshop')) {
    if (!isWorkOSAuthHost(req)) {
      return new NextResponse('Not Found', { status: 404 })
    }
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
