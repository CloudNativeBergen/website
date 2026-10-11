import 'server-only'
import type { NextRequest, NextResponse } from 'next/server'
import { normalizeDomain } from '@/lib/conference/domains'
import { isWorkshopsEnabledForConference } from '@/lib/features/workshops'
import { WORKSHOP_SIGN_IN_INCOMPLETE_QUERY } from '../sign-in-paths'
import {
  isAuthHost,
  logRefusal,
  notFound,
  resolveTenantHost,
  toPortal,
  type RedeemRefusal,
} from './decision'
import { clearCookie } from './cookies'
import { handOffSchema } from './handoff'
import { seal, unseal } from './seal'
import {
  SESSION_TTL_SECONDS,
  isSessionFor,
  sessionCookie,
  sessionSchema,
  type WorkshopSession,
} from './session'
import { challengeOf, signInCookie } from './start-seals'

/**
 * REDEEM A HAND-OFF ON THE TENANT HOST (#1311, spec §3 step 4): the auth host
 * sent the browser here with a token. It becomes this host's session only when
 * all of these hold, checked in this order:
 *
 *  - it unseals as a hand-off and has not expired;
 *  - the browser holds the cookie the sign-in began with, and its value hashes
 *    to what the token carries;
 *  - the token names this host.
 *    So far from the request alone: a token that fails here reads nothing;
 *  - the host still passes the destination check, read live;
 *  - the conference that claims it is the one the token names;
 *  - that conference has workshops.
 *
 * WHERE THE BROWSER GOES NEXT IS FIXED: the portal page, and nothing in the
 * request chooses it. A refusal goes there too, signed out, with one neutral
 * line; the reason is never shown (it goes to the log, `logRefusal`) and no
 * cookie is touched. The token is in
 * the URL, so every answer is `no-store` and sends no referrer.
 *
 * NOT SINGLE USE BY ANY RECORD (spec §5): nothing remembers a redeemed token.
 * Only the browser that began can redeem it, and a redeem clears the cookie
 * that makes it that browser.
 */
export async function redeemWorkshopHandOff(
  request: NextRequest,
): Promise<NextResponse> {
  if (isAuthHost(request.headers)) return notFound()
  const refused = (reason: RedeemRefusal) => {
    logRefusal('redeem', reason)
    return toPortal(WORKSHOP_SIGN_IN_INCOMPLETE_QUERY)
  }

  const handOff = await unseal(
    'handoff',
    request.nextUrl.searchParams.get('token'),
    handOffSchema,
  )
  if (!handOff) return refused('no-hand-off')
  const signIn = signInCookie()
  const value = request.cookies.get(signIn.name)?.value
  if (!value || challengeOf(value) !== handOff.challenge) {
    return refused('no-cookie')
  }
  const requestHost = normalizeDomain(request.headers.get('host') ?? '')
  if (handOff.host !== requestHost) return refused('other-host')

  const tenant = await resolveTenantHost(request.headers)
  if (!tenant) return refused('host-refused')
  if (!isSessionFor(handOff, tenant)) return refused('conference-changed')
  if (!(await isWorkshopsEnabledForConference(tenant.destination.conference))) {
    return refused('no-workshops')
  }

  const response = toPortal()
  const session = sessionCookie()
  response.cookies.set(
    session.name,
    await seal(
      'session',
      // What the hand-off carries, without the hash: the schema keeps its own
      // fields and drops the rest.
      sessionSchema.parse(handOff) satisfies WorkshopSession,
      SESSION_TTL_SECONDS,
    ),
    { ...session.options, maxAge: SESSION_TTL_SECONDS },
  )
  clearCookie(response.cookies, signIn)
  return response
}
