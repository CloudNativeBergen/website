import 'server-only'
import { randomUUID } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import type { z } from 'zod'
import { workshopCallbackUri } from '../sign-in-paths'
import { notFound, resolveCentralSignIn } from './decision'
import { seal, unseal } from './seal'
import {
  START_TTL_SECONDS,
  startCookie,
  startCookieSchema,
  startRequestSchema,
  startStateSchema,
} from './start-seals'
import { workshopWorkOS } from './workos'

/**
 * START A WORKSHOP SIGN-IN ON THE AUTH HOST (#1311, spec §3 step 2), for the
 * tenant host that asked: its sealed request names the host, the hash of that
 * host's browser value and the screen to show.
 *
 * WITHOUT A REQUEST A TENANT HOST SEALED, NOTHING IS READ and nothing starts.
 * THEN THE DECISION (`resolveCentralSignIn`). Only then is anything built: a
 * PKCE pair, the authorize URL with THIS host's callback as its
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
  const sent = await unseal(
    'start-request',
    request.nextUrl.searchParams.get('request'),
    startRequestSchema,
  )
  if (!sent) return notFound()
  const { challenge, screen } = sent

  const signIn = await resolveCentralSignIn(request.headers, sent.host)
  if (!signIn) return notFound()
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
  const cookie = startCookie()
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
