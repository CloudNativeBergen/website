import { auth } from '@/lib/auth'
import {
  NextResponse,
  type NextRequest,
  type NextFetchEvent,
} from 'next/server'
import { AppEnvironment } from '@/lib/environment/config'
import { authkitMiddleware } from '@workos-inc/authkit-nextjs'
import {
  resolveWorkshopSignInHost,
  workshopRequestHost,
} from '@/lib/workshop/sign-in'
import {
  WORKSHOP_SIGN_IN_PATH,
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
 * The workshop portal's WorkOS gate (#1296): AuthKit, with the redirect URI
 * chosen for THIS request's host.
 *
 * ORDER IS THE CONTROL. `resolveWorkshopSignInHost` decides first — the host
 * must be on the verified-redirect allowlist — and only a match reaches the
 * SDK. A host that is not allowlisted gets a 404 and nothing else: no authorize
 * URL is built, no PKCE pair is generated, no session cookie is read. The
 * decision is one live Sanity read per `/workshop*` request, deliberately
 * uncached (see `@/lib/workshop/sign-in`).
 *
 * THE MIDDLEWARE IS BUILT PER REQUEST because `authkitMiddleware` captures its
 * options — `redirectUri` included — when the factory is called. A module-level
 * instance is exactly the single-host binding this replaces. The factory is a
 * closure over its arguments and nothing more, so building it here costs
 * nothing; it also keeps the SDK's in-place edits to `unauthenticatedPaths`
 * from leaking between requests.
 *
 * NOT THE FEATURE GATE. Whether this tenant has workshops at all
 * (`isWorkshopsEnabledForConference`) is decided in the portal layout and page,
 * where the conference is in hand. A signed-out visitor on an allowlisted host
 * of a tenant without workshops is therefore sent to WorkOS first and sees the
 * 404 on return, as before.
 */
async function workshopMiddleware(req: NextRequest, event: NextFetchEvent) {
  const signIn = await resolveWorkshopSignInHost(
    workshopRequestHost(req.headers),
  )
  if (!signIn) {
    return new NextResponse('Not Found', { status: 404 })
  }

  return authkitMiddleware({
    redirectUri: signIn.redirectUri,
    middlewareAuth: {
      enabled: true,
      // These two START a sign-in (their route handlers call the SDK), so a
      // signed-out visitor must reach them rather than be bounced into one.
      unauthenticatedPaths: [WORKSHOP_SIGN_IN_PATH, WORKSHOP_SIGN_UP_PATH],
    },
    debug: process.env.NODE_ENV === 'development',
  })(req, event)
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
