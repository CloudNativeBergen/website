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

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/workshop')) {
    return workOSMiddleware(req, event)
  }

  if (pathname.startsWith('/cfp') || pathname.startsWith('/admin')) {
    return nextAuthMiddleware(req, { params: Promise.resolve({}) })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/cfp/:path*', '/admin/:path*', '/workshop', '/workshop/:path*'],
}
