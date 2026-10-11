/**
 * The fixed paths of the workshop portal's WorkOS sign-in (#1296).
 *
 * Kept apart from `./sign-in` on purpose: that module reaches the Sanity-backed
 * redirect allowlist, and these constants are also needed by presentational
 * components that must not drag a data read into their module graph.
 */

/** The AuthKit callback route, the same path on every host. */
export const WORKSHOP_AUTH_CALLBACK_PATH = '/api/auth/callback'

/**
 * An origin's AuthKit callback. ONE builder: the `redirect_uri` a sign-in sends
 * and the URI registered with WorkOS (#1297) have to be the same string.
 */
export function workshopCallbackUri(origin: string): string {
  return `${origin}${WORKSHOP_AUTH_CALLBACK_PATH}`
}

/** Where a tenant host sends the browser to start a sign-in: on the auth host. */
export const WORKSHOP_AUTH_START_PATH = '/api/auth/workshop/start'

/** The tenant host's entry points that begin a sign-in or a sign-up. */
export const WORKSHOP_SIGN_IN_PATH = '/workshop/sign-in'
export const WORKSHOP_SIGN_UP_PATH = '/workshop/sign-up'

/** Where a completed sign-in lands. */
export const WORKSHOP_PORTAL_PATH = '/workshop'

/**
 * Where the auth host hands a finished sign-in to the tenant host (#1311):
 * the tenant host's route that turns a hand-off token into its own session.
 */
export const WORKSHOP_REDEEM_PATH = '/workshop/redeem'

/**
 * What the redeem route adds to the portal path when it refuses, whatever the
 * reason: the signed-out page then says sign-in did not complete.
 */
export const WORKSHOP_SIGN_IN_INCOMPLETE = {
  param: 'sign-in',
  value: 'incomplete',
} as const
export const WORKSHOP_SIGN_IN_INCOMPLETE_QUERY = `?${WORKSHOP_SIGN_IN_INCOMPLETE.param}=${WORKSHOP_SIGN_IN_INCOMPLETE.value}`

/**
 * Request header the proxy puts on the portal page when the host cannot sign
 * in (#1298). The page then shows the unavailable view and never enters the
 * SDK, which did not run for that request.
 */
export const WORKSHOP_SIGN_IN_UNAVAILABLE_HEADER =
  'x-workshop-sign-in-unavailable'
