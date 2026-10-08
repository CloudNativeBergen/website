import 'server-only'
import { getSignInUrl, getSignUpUrl } from '@workos-inc/authkit-nextjs'
import { NextResponse, type NextRequest } from 'next/server'
import { resolveWorkshopSignInHost, workshopRequestHost } from './sign-in'
import { WORKSHOP_PORTAL_PATH } from './sign-in-paths'

/**
 * Start a WorkOS sign-in or sign-up for the workshop portal (#1296) — the route
 * handlers behind the links on the signed-out page.
 *
 * The authorize URL comes from the SDK (`getSignInUrl` / `getSignUpUrl`), which
 * generates the PKCE pair, seals the state and sets the verifier cookie. It
 * replaces a URL the page used to assemble by hand, with no PKCE and with the
 * single `NEXT_PUBLIC_URL` host as its callback.
 *
 * THE HOST DECISION COMES FIRST and its `redirectUri` is passed EXPLICITLY.
 * Left to itself the SDK takes the callback from an `x-redirect-uri` request
 * header — set by the proxy on `/workshop*`, but a client-controlled value on
 * any path the proxy does not cover — and then from the single-host env URI.
 * Deciding again here costs one more allowlist read on a path that is only hit
 * when someone actually starts a sign-in, and means this stays correct even if
 * the proxy's matcher is ever changed.
 */
export async function startWorkshopSignIn(
  request: NextRequest,
  screen: 'sign-in' | 'sign-up',
): Promise<NextResponse> {
  const signIn = await resolveWorkshopSignInHost(
    workshopRequestHost(request.headers),
  )
  if (!signIn) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const options = {
    redirectUri: signIn.redirectUri,
    returnTo: WORKSHOP_PORTAL_PATH,
  }
  const authorizeUrl =
    screen === 'sign-up'
      ? await getSignUpUrl(options)
      : await getSignInUrl(options)

  return NextResponse.redirect(authorizeUrl, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
