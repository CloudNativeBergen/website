import { NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth'
import {
  consumeStateCookie,
  encryptSession,
  exchangeCodeForTokens,
  setAdobeSignSessionCookie,
} from '@/lib/adobe-sign/auth'

export async function GET(request: Request) {
  const session = await getAuthSession()
  if (!session?.speaker?.isOrganizer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) {
    const desc = url.searchParams.get('error_description') || error
    return NextResponse.redirect(
      `${url.origin}/admin/sponsors/contracts?adobe_sign_error=${encodeURIComponent(desc)}`,
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${url.origin}/admin/sponsors/contracts?adobe_sign_error=${encodeURIComponent('Missing code or state parameter')}`,
    )
  }

  const savedState = await consumeStateCookie()
  if (!savedState || savedState !== state) {
    return NextResponse.redirect(
      `${url.origin}/admin/sponsors/contracts?adobe_sign_error=${encodeURIComponent('Invalid state — possible CSRF attack')}`,
    )
  }

  try {
    const redirectUri = `${url.origin}/api/adobe-sign/callback`
    const adobeSession = await exchangeCodeForTokens(code, redirectUri)
    const encrypted = await encryptSession(adobeSession)

    const response = NextResponse.redirect(
      `${url.origin}/admin/sponsors/contracts?adobe_sign_connected=true`,
    )
    setAdobeSignSessionCookie(response, encrypted)
    return response
  } catch (err) {
    console.error('Adobe Sign OAuth callback error:', err)
    const message = err instanceof Error ? err.message : 'Token exchange failed'
    return NextResponse.redirect(
      `${url.origin}/admin/sponsors/contracts?adobe_sign_error=${encodeURIComponent(message)}`,
    )
  }
}
