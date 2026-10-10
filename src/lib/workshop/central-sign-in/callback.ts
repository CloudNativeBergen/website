import 'server-only'
import { decodeJwt } from 'jose'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { WORKSHOP_REDEEM_PATH } from '../sign-in-paths'
import { resolveCentralSignIn } from './decision'
import { seal, unseal } from './seal'
import { startCookie, startCookieSchema, startStateSchema } from './start-seals'
import { workshopWorkOS } from './workos'

/** How long the tenant host has to redeem a hand-off (spec §5). */
const HANDOFF_TTL_SECONDS = 60

const accessTokenClaims = z.object({ sid: z.string().min(1) })

/** The WorkOS session an access token belongs to (its `sid`), or `null`. */
function sessionIdOf(accessToken: string): string | null {
  try {
    return accessTokenClaims.parse(decodeJwt(accessToken)).sid
  } catch {
    return null
  }
}

function notFound(): NextResponse {
  return new NextResponse('Not Found', { status: 404 })
}

/**
 * FINISH A WORKSHOP SIGN-IN ON THE AUTH HOST (#1311, spec §3 step 3): WorkOS
 * sends the browser back with a code.
 *
 * `null` when `state` is not one the start route sealed: the request is not
 * this flow's. Otherwise every check below passes BEFORE the code is exchanged,
 * and a refusal is a 404:
 *
 *  - the host and the hash come from the sealed state, never the query string;
 *  - the decision is taken again (`resolveCentralSignIn`): the request is on
 *    the auth host, the host may still receive a hand-off, and its conference
 *    still has workshops;
 *  - the conference that claims the host is still the one in state;
 *  - the browser carries the cookie the start route set for this very state.
 *
 * NOTHING IS KEPT HERE: no session and no WorkOS token. The answer is a
 * redirect to the tenant host's redeem route with a sealed hand-off token
 * (§5), valid for about a minute, and the start cookie is cleared.
 */
export async function finishCentralSignIn(
  request: NextRequest,
): Promise<NextResponse | null> {
  const params = request.nextUrl.searchParams
  const state = await unseal(
    'auth-state',
    params.get('state'),
    startStateSchema,
  )
  if (!state) return null

  const code = params.get('code')
  if (!code) return notFound()

  const signIn = await resolveCentralSignIn(request.headers, state.host)
  if (!signIn) return notFound()
  const { authOrigin, destination } = signIn
  if (destination.conference._id !== state.conferenceId) return notFound()

  const cookie = startCookie(authOrigin)
  const started = await unseal(
    'auth-start',
    request.cookies.get(cookie.name)?.value,
    startCookieSchema,
  )
  if (!started || started.nonce !== state.nonce) return notFound()

  let token: string
  try {
    const { user, accessToken } =
      await workshopWorkOS().userManagement.authenticateWithCode({
        code,
        codeVerifier: started.codeVerifier,
      })
    const sessionId = sessionIdOf(accessToken)
    if (!sessionId) throw new Error('the access token names no session')
    token = await seal(
      'handoff',
      {
        userId: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        name: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
        sessionId,
        host: destination.host,
        conferenceId: state.conferenceId,
        challenge: state.challenge,
      },
      HANDOFF_TTL_SECONDS,
    )
  } catch (error) {
    console.error(
      '[workshop] the code exchange failed; nothing handed off',
      error,
    )
    return notFound()
  }

  const redeem = new URL(WORKSHOP_REDEEM_PATH, destination.origin)
  redeem.searchParams.set('token', token)
  // The token is in the URL: not to be cached, and not to leak as a referrer.
  const response = NextResponse.redirect(redeem, {
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  })
  response.cookies.set(cookie.name, '', { ...cookie.options, maxAge: 0 })
  return response
}
