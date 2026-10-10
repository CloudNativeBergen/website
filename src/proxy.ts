import { auth } from '@/lib/auth'
import { NextRequest, NextResponse, type NextFetchEvent } from 'next/server'
import { AppEnvironment } from '@/lib/environment/config'
import { authkitMiddleware } from '@workos-inc/authkit-nextjs'
import {
  resolveWorkshopSignInHost,
  workshopRequestHost,
} from '@/lib/workshop/sign-in'
import {
  WORKSHOP_PORTAL_PATH,
  WORKSHOP_SIGN_IN_PATH,
  WORKSHOP_SIGN_IN_UNAVAILABLE_HEADER,
  WORKSHOP_SIGN_UP_PATH,
} from '@/lib/workshop/sign-in-paths'

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
 * The request without a client-sent unavailable mark: the SDK forwards every
 * request header to the page, and the mark is the proxy's to set.
 */
function withoutUnavailableMark(req: NextRequest): NextRequest {
  if (!req.headers.has(WORKSHOP_SIGN_IN_UNAVAILABLE_HEADER)) return req
  const headers = new Headers(req.headers)
  headers.delete(WORKSHOP_SIGN_IN_UNAVAILABLE_HEADER)
  return new NextRequest(req, { headers })
}

/**
 * The path without trailing slashes: `skipTrailingSlashRedirect` is on, so
 * Next hands `/workshop/` over as written, and it is the same page.
 */
function workshopPath(req: NextRequest): string {
  return req.nextUrl.pathname.replace(/\/+$/, '')
}

function isWorkshopSignInEntry(req: NextRequest): boolean {
  const path = workshopPath(req)
  return (
    (path === WORKSHOP_SIGN_IN_PATH || path === WORKSHOP_SIGN_UP_PATH) &&
    (req.method === 'GET' || req.method === 'HEAD')
  )
}

function isWorkshopPortalView(req: NextRequest): boolean {
  return (
    workshopPath(req) === WORKSHOP_PORTAL_PATH &&
    (req.method === 'GET' || req.method === 'HEAD')
  )
}

/**
 * The workshop portal's WorkOS SESSION layer (#1296): AuthKit, with the
 * redirect URI chosen for THIS request's host. It reads (and refreshes) a
 * session the attendee already has, and hands the page the headers `withAuth`
 * needs. It starts nothing.
 *
 * ORDER IS THE CONTROL. `resolveWorkshopSignInHost` decides first — the host
 * must be on the verified-redirect allowlist — and only a match reaches the
 * SDK. A host that may not sign in gets a 404 (or, for the portal page alone,
 * the page without the SDK — see below) and nothing else: no authorize
 * URL is built, no PKCE pair is generated, no session cookie is read. The
 * decision is one live Sanity read per `/workshop*` request, deliberately
 * uncached (see `@/lib/workshop/sign-in`).
 *
 * THE MIDDLEWARE IS BUILT PER REQUEST because `authkitMiddleware` captures its
 * options — `redirectUri` included — when the factory is called. A module-level
 * instance could name only one callback for every host. The factory is a
 * closure over its arguments and nothing more, so building it here costs
 * nothing; it also keeps the SDK's in-place edits to `unauthenticatedPaths`
 * from leaking between requests.
 *
 * NOBODY IS SENT TO WORKOS FROM HERE (`middlewareAuth` stays off). This runs
 * on the host alone and cannot ask whether the tenant has workshops at all
 * (`isWorkshopsEnabledForConference` needs the conference, and there is no
 * cache here to read one through). So a signed-out visitor is let through: the
 * portal layout answers 404 for a tenant without workshops, the page shows the
 * signed-out view for one with them, and only `/workshop/sign-in` and
 * `/workshop/sign-up` — which check the feature first — redirect to WorkOS.
 * Bouncing from here sent visitors of a tenant WITHOUT workshops through a
 * processor its `/privacy` page says it does not use. With the bounce off the
 * SDK sets no cookie for a signed-out request either: it only issues the PKCE
 * verifier alongside a redirect it makes itself.
 *
 * STILL REACHES WORKOS FROM HERE: a request that already carries a session
 * cookie, when its access token needs refreshing. That session was started
 * while the tenant had workshops. (And, with `WORKOS_CLAIM_TOKEN` set — an
 * unclaimed development environment, never production — the SDK exchanges
 * that token server-to-server on a signed-out request. No visitor data is in
 * that call.)
 */
async function workshopMiddleware(req: NextRequest, event: NextFetchEvent) {
  const signIn = await resolveWorkshopSignInHost(
    workshopRequestHost(req.headers),
  )
  if (!signIn) {
    // THE PORTAL PAGE ITSELF IS LET THROUGH (#1298), marked and WITHOUT the
    // SDK, so an attendee of a tenant with workshops learns that sign-up is not
    // available yet instead of meeting a bare 404. The page reads the mark and
    // never calls `withAuth`; the layout still answers 404 for a tenant
    // without workshops. The mark is set here on every such request and
    // stripped from every request the SDK handles, so a client can neither
    // remove nor forge it. Every other path, and any other method, is refused
    // as before.
    // A sign-in or sign-up link (a bookmark, a page rendered before the host
    // stopped qualifying) goes to the portal page too, which says why not —
    // not to a bare 404 (#1298). The target is this request's own origin with
    // the portal path and no query: same origin, so Next's adapter
    // sends the browser a relative `Location: /workshop`. (A relative Location
    // returned from here throws in that adapter — "Invalid URL".)
    if (isWorkshopSignInEntry(req)) {
      // Built from the origin, not `nextUrl.clone()`: a clone keeps a trailing
      // slash from `/workshop/sign-in/` and would send the browser there.
      return NextResponse.redirect(
        new URL(WORKSHOP_PORTAL_PATH, req.nextUrl.origin),
        307,
      )
    }
    if (isWorkshopPortalView(req)) {
      const headers = new Headers(req.headers)
      headers.set(WORKSHOP_SIGN_IN_UNAVAILABLE_HEADER, '1')
      return NextResponse.next({ request: { headers } })
    }
    return new NextResponse('Not Found', { status: 404 })
  }

  return authkitMiddleware({
    redirectUri: signIn.redirectUri,
    debug: process.env.NODE_ENV === 'development',
  })(withoutUnavailableMark(req), event)
}

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/workshop')) {
    return workshopMiddleware(req, event)
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
