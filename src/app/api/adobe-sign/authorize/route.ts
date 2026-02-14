import { NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth'
import { getAuthorizeUrl, setStateCookie } from '@/lib/adobe-sign/auth'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export async function GET() {
  const session = await getAuthSession()
  if (!session?.speaker?.isOrganizer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { domain } = await getConferenceForCurrentDomain()
  const origin = `https://${domain}`
  const state = crypto.randomUUID()
  const redirectUri = `${origin}/api/adobe-sign/callback`
  const authorizeUrl = getAuthorizeUrl(state, redirectUri)

  console.log('[Adobe Sign] Redirecting to authorize URL:', authorizeUrl)
  console.log('[Adobe Sign] Redirect URI:', redirectUri)

  const response = NextResponse.redirect(authorizeUrl)
  setStateCookie(response, state)
  return response
}
