import type { NextRequest } from 'next/server'
import { finishCentralSignIn } from '@/lib/workshop/central-sign-in'

/**
 * Where WorkOS sends the workshop attendee back with an authorization code:
 * the ONE callback, on the auth host (#1311). It keeps no session and hands
 * the result to the tenant host. A request that is not the return of a sign-in
 * the auth host started is a 404, on every host.
 */
export function GET(request: NextRequest) {
  return finishCentralSignIn(request)
}
