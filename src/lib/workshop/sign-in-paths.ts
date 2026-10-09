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

/** SDK-backed entry points that start a sign-in or a sign-up. */
export const WORKSHOP_SIGN_IN_PATH = '/workshop/sign-in'
export const WORKSHOP_SIGN_UP_PATH = '/workshop/sign-up'

/** Where a completed sign-in lands. */
export const WORKSHOP_PORTAL_PATH = '/workshop'
