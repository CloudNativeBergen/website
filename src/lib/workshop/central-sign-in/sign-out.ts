import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import {
  WORKSHOP_AUTH_SIGNED_OUT_PATH,
  WORKSHOP_AUTH_SIGN_OUT_PATH,
} from '../sign-in-paths'
import { clearCookie, hostCookie } from './cookies'
import {
  configuredAuthOrigin,
  logRefusal,
  mayBeAuthHost,
  notFound,
  resolveAuthHostDestination,
} from './decision'
import { seal, unseal } from './seal'
import { sessionOfThisHost } from './session'
import { workshopWorkOS } from './workos'

/**
 * SIGN-OUT of the workshop portal (#1315, spec §7): the tenant host ends its
 * own session, the auth host ends the WorkOS login, and the browser comes back
 * to the tenant host's front page. WorkOS is sent one session ID and one fixed
 * return address, and no referrer; which tenant host to go back to waits in a
 * cookie on the auth host.
 */

/** How long the browser has to carry a sign-out request to the auth host. */
const SIGN_OUT_REQUEST_TTL_SECONDS = 60

/** How long the browser may take to come back from WorkOS's logout. */
const SIGN_OUT_RETURN_TTL_SECONDS = 300

/** Sealed as `sign-out-request` by the tenant host. */
const signOutRequestSchema = z.object({
  /** The tenant host the attendee signed out of. */
  host: z.string(),
  /** The WorkOS session that login belongs to. */
  sessionId: z.string().min(1),
})

/** Sealed as `sign-out-return`: the auth host's cookie while WorkOS logs out. */
const signOutReturnSchema = z.object({ host: z.string() })

const signOutCookie = () => hostCookie('workshop-sign-out')

/**
 * WHERE "SIGN OUT" ON A TENANT HOST SENDS THE BROWSER, for the session cookie
 * it arrived with (`sealed`). Clearing that cookie is the caller's.
 *
 * With a session of this host: the auth host's sign-out route, with ONE sealed
 * request naming this host and the WorkOS session, valid for a minute. With
 * none (no cookie, run out, another host's, not a session): the front page.
 *
 * FROM THE REQUEST ALONE: nothing is read and WorkOS is not called. Whether
 * the host may be returned to is the auth host's question.
 */
export async function workshopSignOutTarget(
  headers: { get(name: string): string | null },
  sealed: string | null | undefined,
): Promise<string> {
  const session = await sessionOfThisHost(headers, sealed)
  if (!session) return '/'
  const configured = configuredAuthOrigin()
  if (configured === 'invalid') return '/'

  const request = await seal(
    'sign-out-request',
    { host: session.host, sessionId: session.sessionId } satisfies z.infer<
      typeof signOutRequestSchema
    >,
    SIGN_OUT_REQUEST_TTL_SECONDS,
  )
  // Unset, the host is its own auth host: the path alone stays on it.
  const origin = configured === 'unset' ? '' : configured.origin
  return `${origin}${WORKSHOP_AUTH_SIGN_OUT_PATH}?request=${request}`
}

/**
 * END THE WORKOS LOGIN, ON THE AUTH HOST, for the tenant host that asked.
 *
 * A BROWSER'S NAVIGATION ONLY. Where a host is its own auth host the sign-out
 * action redirects within one host, and Next then fetches the target itself
 * (`RSC: 1`) and follows where it leads, before the browser comes. That fetch
 * gets a 404 here and ends nothing.
 *
 * WITHOUT A REQUEST A TENANT HOST SEALED, NOTHING IS READ and WorkOS is not
 * reached. THEN THE DECISION (`resolveAuthHostDestination`): the request is on
 * the auth host and the host it names may be returned to. A refusal is a 404.
 *
 * Only then: the host goes into a short-lived sealed cookie on this host, and
 * the browser goes to WorkOS's logout with the session ID from the request and
 * THIS host's fixed return address.
 */
export async function startCentralSignOut(
  request: NextRequest,
): Promise<NextResponse> {
  if (request.headers.has('rsc')) return notFound()

  const refused = (reason: 'no-request' | 'host-refused') => {
    logRefusal('sign-out', reason)
    return notFound()
  }
  const sent = await unseal(
    'sign-out-request',
    request.nextUrl.searchParams.get('request'),
    signOutRequestSchema,
  )
  if (!sent) return refused('no-request')
  const signOut = await resolveAuthHostDestination(request.headers, sent.host)
  if (!signOut) return refused('host-refused')
  const { authOrigin, destination } = signOut

  const response = NextResponse.redirect(
    workshopWorkOS().userManagement.getLogoutUrl({
      sessionId: sent.sessionId,
      returnTo: `${authOrigin}${WORKSHOP_AUTH_SIGNED_OUT_PATH}`,
    }),
    // No referrer: WorkOS is not told which tenant host the browser came from.
    {
      headers: {
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    },
  )
  const cookie = signOutCookie()
  response.cookies.set(
    cookie.name,
    await seal(
      'sign-out-return',
      { host: destination.host } satisfies z.infer<typeof signOutReturnSchema>,
      SIGN_OUT_RETURN_TTL_SECONDS,
    ),
    { ...cookie.options, maxAge: SIGN_OUT_RETURN_TTL_SECONDS },
  )
  return response
}

/** The plain page a sign-out ends on when there is no host to go back to. */
function signedOutPage(): NextResponse {
  return new NextResponse(
    '<!doctype html><html lang="en"><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<meta name="color-scheme" content="light dark">' +
      '<title>Signed out</title>' +
      '<body style="font-family: system-ui, sans-serif; margin: 4rem auto; max-width: 30rem; padding: 0 1rem">' +
      '<h1>You are signed out</h1><p>You can close this page.</p>',
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    },
  )
}

/**
 * THE RETURN FROM WORKOS'S LOGOUT, ON THE AUTH HOST: the one address WorkOS
 * sends the browser back to. On any other host it is a 404.
 *
 * The host to go back to comes from this host's own cookie and from nowhere
 * else, and the browser is sent to that host's front page only when the
 * decision holds again (`resolveAuthHostDestination`, read live). Otherwise
 * the answer is a plain page that says the visitor is signed out, and no
 * redirect. The cookie is cleared either way.
 */
export async function finishCentralSignOut(
  request: NextRequest,
): Promise<NextResponse> {
  if (!mayBeAuthHost(request.headers)) return notFound()

  const cookie = signOutCookie()
  const kept = await unseal(
    'sign-out-return',
    request.cookies.get(cookie.name)?.value,
    signOutReturnSchema,
  )
  const signOut =
    kept && (await resolveAuthHostDestination(request.headers, kept.host))
  if (!signOut) logRefusal('signed-out', kept ? 'host-refused' : 'no-cookie')

  const response = signOut
    ? NextResponse.redirect(new URL('/', signOut.destination.origin), {
        headers: { 'Cache-Control': 'no-store' },
      })
    : signedOutPage()
  clearCookie(response.cookies, cookie)
  return response
}
