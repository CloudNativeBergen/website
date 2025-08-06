import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { AppEnvironment } from '@/lib/environment'

export default auth((req) => {
  const { pathname } = req.nextUrl

  // Block access to development routes in production
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

  // In test mode, bypass authentication entirely (only in development)
  if (AppEnvironment.isDevelopment && AppEnvironment.isTestMode) {
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

export const config = {
  matcher: ['/(cfp|admin)/((?!opengraph-image.png).*)'],
}
