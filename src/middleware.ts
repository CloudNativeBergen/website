import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  // if (!req.auth) {
  //   const signInPage = '/api/auth/signin'
  //   const signInUrl = new URL(signInPage, req.nextUrl.origin)
  //   signInUrl.searchParams.append('callbackUrl', req.url)
  //   return NextResponse.redirect(signInUrl)
  // }

  return NextResponse.next()
})

export const config = {
  matcher: ['/cfp/((?!opengraph-image.png).*)'],
}
