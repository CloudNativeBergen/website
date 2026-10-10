import 'server-only'
import { getSignInUrl, getSignUpUrl } from '@workos-inc/authkit-nextjs'
import { NextResponse, type NextRequest } from 'next/server'
import { resolveWorkshopSignInForRequest } from './sign-in-request'
import { WORKSHOP_PORTAL_PATH } from './sign-in-paths'

/**
 * Start a WorkOS sign-in or sign-up for the workshop portal (#1296) — the route
 * handlers behind the two buttons (GET forms) on the signed-out page.
 *
 * The authorize URL comes from the SDK (`getSignInUrl` / `getSignUpUrl`), which
 * generates the PKCE pair, seals the state and sets the verifier cookie.
 *
 * THE DECISION COMES FIRST (`resolveWorkshopSignInForRequest`: the host is
 * verified AND its tenant has workshops) and its `redirectUri` is passed
 * EXPLICITLY. Left to itself the SDK takes the callback from an
 * `x-redirect-uri` request header — set by the proxy on `/workshop*`, but a
 * client-controlled value on any path the proxy does not cover — and then from
 * `NEXT_PUBLIC_WORKOS_REDIRECT_URI`, its own fallback, which nothing here
 * relies on (#1299). Deciding again here costs one more allowlist read on a
 * path that is only hit when someone actually starts a sign-in, and means this
 * stays correct even if the proxy's matcher is ever changed.
 *
 * THIS IS THE ONLY PLACE A SIGNED-OUT VISITOR IS SENT TO WORKOS — the proxy
 * does not bounce anyone — which is why the feature gate is checked here: a
 * tenant without workshops must never reach the authorize URL.
 */
export async function startWorkshopSignIn(
  request: NextRequest,
  screen: 'sign-in' | 'sign-up',
): Promise<NextResponse> {
  const signIn = await resolveWorkshopSignInForRequest(request.headers)
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
