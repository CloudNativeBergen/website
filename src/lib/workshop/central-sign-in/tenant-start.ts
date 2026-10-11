import 'server-only'
import { randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import type { z } from 'zod'
import { isWorkshopsEnabledForConference } from '@/lib/features/workshops'
import { WORKSHOP_AUTH_START_PATH } from '../sign-in-paths'
import { isAuthHost, notFound, resolveTenantHost, toPortal } from './decision'
import { seal } from './seal'
import {
  START_REQUEST_TTL_SECONDS,
  START_TTL_SECONDS,
  challengeOf,
  signInCookie,
  startRequestSchema,
} from './start-seals'

/**
 * BEGIN A WORKSHOP SIGN-IN ON A TENANT HOST (#1311, spec §3 step 1): the route
 * handlers behind the two buttons of the signed-out portal.
 *
 * THE DECISION COMES FIRST (`resolveTenantHost`, then the feature gate): the
 * host may receive a hand-off and its conference has workshops, so a tenant
 * without them is never sent anywhere. Only then:
 *
 *  - a random value goes into a cookie on this host. The redeem route accepts
 *    a hand-off only in the browser that holds it;
 *  - the browser goes to the auth host with ONE sealed request: this host, the
 *    hash of the value and the screen. The auth host starts nothing without
 *    it, so it starts only what a tenant host asked for.
 *
 * No WorkOS URL is built here and the SDK is not entered.
 */
export async function beginWorkshopSignIn(
  request: NextRequest,
  screen: 'sign-in' | 'sign-up',
): Promise<NextResponse> {
  if (isAuthHost(request.headers)) return notFound()
  const tenant = await resolveTenantHost(request.headers)
  // The portal page says sign-in is unavailable on this host.
  if (!tenant) return toPortal()
  const { authOrigin, destination } = tenant
  if (!(await isWorkshopsEnabledForConference(destination.conference))) {
    return notFound()
  }

  const value = randomBytes(32).toString('base64url')
  const start = new URL(WORKSHOP_AUTH_START_PATH, authOrigin)
  start.searchParams.set(
    'request',
    await seal(
      'start-request',
      {
        host: destination.host,
        challenge: challengeOf(value),
        screen,
      } satisfies z.infer<typeof startRequestSchema>,
      START_REQUEST_TTL_SECONDS,
    ),
  )

  const response = NextResponse.redirect(start, {
    headers: { 'Cache-Control': 'no-store' },
  })
  const cookie = signInCookie()
  response.cookies.set(cookie.name, value, {
    ...cookie.options,
    maxAge: START_TTL_SECONDS,
  })
  return response
}
