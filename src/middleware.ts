import { auth } from '@/lib/auth'
import { NextResponse, type NextRequest } from 'next/server'
import { AppEnvironment } from '@/lib/environment/config'
import { authkitMiddleware } from '@workos-inc/authkit-nextjs'

const workOSMiddleware = authkitMiddleware({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: [],
  },
  signInPath: '/workshop',
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

  return NextResponse.next()
})

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Handle workshop routes with WorkOS middleware
  if (pathname.startsWith('/workshop')) {
    return workOSMiddleware(req)
  }

  // Handle other protected routes with NextAuth
  if (pathname.startsWith('/cfp') || pathname.startsWith('/admin')) {
    // @ts-expect-error NextAuth middleware type
    return nextAuthMiddleware(req)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/cfp/:path*',
    '/admin/:path*',
    '/workshop',
    '/workshop/:path*',
  ],
}
