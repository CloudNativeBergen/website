import { z } from 'zod'

/**
 * What the start route seals and the callback unseals (spec §3 steps 2 and 3):
 * the `state` WorkOS echoes back, and the cookie on the auth host. They share
 * a nonce, so a callback completes only in the browser that started.
 */

/** How long a started sign-in may take to come back from WorkOS. */
export const START_TTL_SECONDS = 600

/** Sealed as `auth-state`. */
export const startStateSchema = z.object({
  /** The tenant host the sign-in is for. */
  host: z.string(),
  /** The conference that claimed it when the sign-in started. */
  conferenceId: z.string(),
  /** The hash of the tenant host's browser value. */
  challenge: z.string(),
  nonce: z.string(),
})

/** Sealed as `auth-start`. The PKCE verifier never travels in a URL. */
export const startCookieSchema = z.object({
  nonce: z.string(),
  codeVerifier: z.string(),
})

/**
 * The auth host's cookie between start and callback. `__Host-` makes the
 * browser refuse a `Domain`, so no sibling host under a shared suffix can set
 * or replace it. The prefix needs `Secure`, which a browser may not store over
 * plain HTTP, so a development server gets neither. `NODE_ENV` is `production`
 * in every deployed build, previews included.
 */
export function startCookie() {
  const secure = process.env.NODE_ENV !== 'development'
  return {
    name: secure ? '__Host-workshop-auth-start' : 'workshop-auth-start',
    options: {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
    },
  } as const
}
