import 'server-only'
import { randomUUID } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import type { z } from 'zod'
import { workshopCallbackUri } from '../sign-in-paths'
import { resolveCentralSignIn } from './decision'
import { seal } from './seal'
import {
  START_TTL_SECONDS,
  startCookie,
  startCookieSchema,
  startStateSchema,
} from './start-seals'
import { workshopWorkOS } from './workos'

/** Base64url SHA-256: what the tenant host sends of its browser value. */
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/

function isScreen(value: string | null): value is 'sign-in' | 'sign-up' {
  return value === 'sign-in' || value === 'sign-up'
}

/**
 * START A WORKSHOP SIGN-IN ON THE AUTH HOST (#1311, spec §3 step 2), for the
 * tenant host named in the query, with the hash of that host's browser value
 * and the screen to show.
 *
 * THE DECISION COMES FIRST (`resolveCentralSignIn`). Only then is anything
 * built: a PKCE pair, the authorize URL with THIS host's callback as its
 * `redirect_uri`, and two seals that share a nonce:
 *
 *  - `state` carries the host, the conference that claims it and the hash. The
 *    callback trusts these and nothing from its query string;
 *  - a cookie on this host carries the PKCE verifier, so a callback URL
 *    completes nothing outside the browser that started.
 *
 * A refusal is a 404.
 */
export async function startCentralSignIn(
  request: NextRequest,
): Promise<NextResponse> {
  const params = request.nextUrl.searchParams
  const challenge = params.get('challenge')
  const screen = params.get('screen')
  if (!challenge || !CHALLENGE.test(challenge) || !isScreen(screen)) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const signIn = await resolveCentralSignIn(request.headers, params.get('host'))
  if (!signIn) {
    return new NextResponse('Not Found', { status: 404 })
  }
  const { authOrigin, destination } = signIn

  const workos = workshopWorkOS()
  const pkce = await workos.pkce.generate()
  const nonce = randomUUID()
  const state = await seal(
    'auth-state',
    {
      host: destination.host,
      conferenceId: destination.conference._id,
      challenge,
      nonce,
    } satisfies z.infer<typeof startStateSchema>,
    START_TTL_SECONDS,
  )
  const authorizeUrl = workos.userManagement.getAuthorizationUrl({
    provider: 'authkit',
    redirectUri: workshopCallbackUri(authOrigin),
    screenHint: screen,
    state,
    codeChallenge: pkce.codeChallenge,
    codeChallengeMethod: pkce.codeChallengeMethod,
  })

  const response = NextResponse.redirect(authorizeUrl, {
    headers: { 'Cache-Control': 'no-store' },
  })
  const cookie = startCookie(authOrigin)
  response.cookies.set(
    cookie.name,
    await seal(
      'auth-start',
      { nonce, codeVerifier: pkce.codeVerifier } satisfies z.infer<
        typeof startCookieSchema
      >,
      START_TTL_SECONDS,
    ),
    { ...cookie.options, maxAge: START_TTL_SECONDS },
  )
  return response
}
