import { createHash } from 'node:crypto'
import { z } from 'zod'
import { hostCookie } from './cookies'

/**
 * What a sign-in carries between its steps before WorkOS answers (spec §3
 * steps 1 to 3): the tenant host's cookie and its request to the auth host,
 * then the `state` WorkOS echoes back and the cookie on the auth host.
 */

/** How long a started sign-in may take to come back from WorkOS. */
export const START_TTL_SECONDS = 600

/** How long the browser has to carry a start request to the auth host. */
export const START_REQUEST_TTL_SECONDS = 60

/**
 * The tenant host's cookie: a random value only this browser holds. The
 * hand-off is redeemed only where the value hashes to what it carries.
 */
export const signInCookie = () => hostCookie('workshop-sign-in')

/** What the tenant host sends of its browser value: base64url SHA-256. */
export function challengeOf(value: string): string {
  return createHash('sha256').update(value).digest('base64url')
}

/**
 * Sealed as `start-request` by the tenant host: the auth host starts a sign-in
 * only for a host that asked, with the hash that host made.
 */
export const startRequestSchema = z.object({
  /** The tenant host the sign-in is for. */
  host: z.string(),
  /** {@link challengeOf} the value in the tenant host's cookie. */
  challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  screen: z.enum(['sign-in', 'sign-up']),
})

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
 * The auth host's cookie between start and callback. It shares a nonce with
 * the state, so a callback completes only in the browser that started.
 */
export const startCookie = () => hostCookie('workshop-auth-start')
