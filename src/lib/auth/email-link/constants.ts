/**
 * Shared constants for email (magic-link) sign-in.
 *
 * Kept dependency-free so both the edge-safe request path and the Node-only
 * crypto/Sanity modules can import them without dragging anything along.
 */

/**
 * The Auth.js provider id for email-link sign-in.
 *
 * It is a CREDENTIALS provider, not Auth.js's built-in `email` provider. The two
 * blocking reasons are documented at length in `verify.ts`: configuring ANY
 * adapter rewrites the existing OAuth sign-in flow, and `useVerificationToken`
 * cannot verify a stateless token because it only ever receives a hash.
 */
export const EMAIL_LINK_PROVIDER_ID = 'email-link'

/** Path of the route that redeems an emailed link. */
export const EMAIL_LINK_CALLBACK_PATH = '/api/auth/email-link/callback'

/** Where the browser lands after a link has been requested (uniform response). */
export const EMAIL_LINK_VERIFY_REQUEST_PATH = '/signin/verify-request'

/**
 * STATELESS tier lifetime (speakers / attendees).
 *
 * 5 minutes. A stateless token cannot be revoked or consumed, so its validity
 * window IS its entire security budget: anyone holding the raw link can redeem
 * it repeatedly until it expires. Five minutes is long enough for a mail hop
 * plus a human click and short enough that a link sitting in a shared or
 * later-compromised mailbox is inert. Mail that is delayed beyond it fails
 * closed and the user simply requests another link.
 */
export const STATELESS_TOKEN_TTL_SECONDS = 5 * 60

/**
 * STORED tier lifetime (organizers / admins).
 *
 * 15 minutes. Longer than the stateless tier precisely BECAUSE these tokens are
 * single-use and revocable: the extra window buys tolerance for slow corporate
 * mail filtering without extending a replayable credential.
 */
export const STORED_TOKEN_TTL_SECONDS = 15 * 60

/**
 * RATE LIMITS.
 *
 * Per email (the abuse that matters most — mail-bombing a specific person and
 * grinding through link requests for a privileged address):
 *   - at most 1 request per 60 seconds,
 *   - at most 3 requests per 15 minutes,
 *   - at most 10 requests per 24 hours.
 *
 * Per client IP (blunt instrument against enumeration sweeps and bulk sending
 * from one source; deliberately looser so an office NAT or a university egress
 * does not lock out a whole venue):
 *   - at most 20 requests per hour,
 *   - at most 60 requests per 24 hours.
 *
 * All windows are rolling. Exceeding any of them produces the SAME response as
 * a successful request — the only difference is that no mail is sent.
 */
export const EMAIL_RATE_LIMIT_RULES = [
  { windowSeconds: 60, max: 1 },
  { windowSeconds: 15 * 60, max: 3 },
  { windowSeconds: 24 * 60 * 60, max: 10 },
] as const

export const IP_RATE_LIMIT_RULES = [
  { windowSeconds: 60 * 60, max: 20 },
  { windowSeconds: 24 * 60 * 60, max: 60 },
] as const

/** Sanity document types owned by this feature. */
export const EMAIL_SIGN_IN_TOKEN_TYPE = 'emailSignInToken'
export const EMAIL_SIGN_IN_RATE_LIMIT_TYPE = 'emailSignInRateLimit'
