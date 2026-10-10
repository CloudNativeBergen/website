import { handleAuth } from '@workos-inc/authkit-nextjs'
import { NextResponse, type NextRequest } from 'next/server'
import { finishCentralSignIn } from '@/lib/workshop/central-sign-in'
import { resolveWorkshopSignInForRequest } from '@/lib/workshop/sign-in-request'

/**
 * Where WorkOS sends the workshop attendee back with an authorization code.
 *
 * TWO SIGN-INS SHARE THIS PATH while the central sign-in is being built
 * (#1311). A `state` shaped like the auth host's seal is finished, or
 * refused, by `finishCentralSignIn`: it keeps no session and hands off to the
 * tenant host (#1313). Any other `state` is the per-host sign-in below
 * (#1296), where every verified host has this path as its own redirect URI.
 * The tenant-host slice (#1314) removes it.
 *
 * THE DECISION COMES FIRST (`resolveWorkshopSignInForRequest`): the host is on
 * the allowlist, exactly as in the proxy, AND its tenant has workshops, exactly
 * as on the routes that start a sign-in. This route is outside the proxy's
 * matcher, so without its own check a host delisted — or a tenant switched off
 * — between the start of a sign-in and its return would still trade the code
 * for a session. A refusal is a 404 before the SDK is entered: no code is
 * exchanged and no cookie is written.
 *
 * `baseURL` is the origin that MATCHED the allowlist, so the post-sign-in
 * redirect goes there and never to a host taken from the request URL alone.
 * The path the attendee asked for travels inside the SDK's sealed state: every
 * flow this app starts puts one there (the sign-in routes: `/workshop`), so no
 * fallback path is configured here.
 */
export async function GET(request: NextRequest) {
  const central = await finishCentralSignIn(request)
  if (central) return central

  const signIn = await resolveWorkshopSignInForRequest(request.headers)
  if (!signIn) {
    return new NextResponse('Not Found', { status: 404 })
  }

  return handleAuth({ baseURL: signIn.origin })(request)
}
