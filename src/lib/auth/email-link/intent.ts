import { createHash, timingSafeEqual } from 'crypto'

/**
 * LOGIN-CSRF CONTROL for email sign-in.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ATTACK THIS CLOSES
 * ─────────────────────────────────────────────────────────────────────────────
 * The redemption endpoint is an unauthenticated GET that mints a session, and
 * server-side `signIn` runs with `skipCSRFCheck` (that is how `next-auth`'s own
 * `signIn` helper works). Without a same-browser binding, an attacker can
 * request a link for THEIR OWN address, then make a victim's browser perform a
 * top-level navigation to it — a shortened URL, an `<a>`, an ad. The victim is
 * then silently signed in AS THE ATTACKER, on top of any existing session and
 * with no UI signal, and everything they subsequently write (bio, photo, a CFP
 * draft) lands in the attacker's account. The nastier escalation: while holding
 * the attacker's session the victim uses "link my GitHub", and
 * `linkProviderToSpeaker` unions the victim's provider-verified addresses into
 * the ATTACKER's `knownEmails` — persistent identity poisoning that outlives the
 * session.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CONTROL
 * ─────────────────────────────────────────────────────────────────────────────
 * When a link is requested, the requesting browser is given a short-lived,
 * HttpOnly cookie carrying {@link emailLinkIntentValue} of the minted token. At
 * redemption:
 *
 *  - cookie matches the presented token → SAME BROWSER that asked for the link.
 *    Sign in directly. This is the overwhelmingly common path and is unchanged
 *    for the user.
 *  - no cookie, or a cookie for a different token → sign in is NOT performed.
 *    The browser lands on a confirmation interstitial whose "continue" control
 *    is a SERVER ACTION, i.e. a POST that Next refuses cross-origin. An attacker
 *    can navigate a victim to a URL; they cannot make the victim's browser
 *    submit a same-origin POST, and they cannot forge the cookie because the
 *    value is `sha256(rawToken + AUTH_SECRET)` and they do not hold the secret
 *    for a token they did not request.
 *
 * WHY NOT REQUIRE THE COOKIE OUTRIGHT: request-on-phone / open-on-laptop is a
 * real and intended use of a magic link, and a hard requirement would break it.
 * The interstitial preserves it at the cost of exactly one deliberate click,
 * which is also the click that lets a victim NOTICE the switch.
 *
 * THE COOKIE IS NOT A CREDENTIAL. It carries a salted hash, grants nothing on
 * its own, and its absence only ever ADDS friction. So planting one (which needs
 * the ability to set cookies on the origin already) buys an attacker nothing
 * beyond skipping a page the user still had to click through.
 *
 * UNIFORMITY: the request action sets the cookie on EVERY outcome — a random
 * value when nothing was minted — so "cookie present" is not an oracle for
 * whether an address was accepted, known, or rate-limited.
 */

/** The same-browser intent cookie. Host-only, HttpOnly, SameSite=Lax. */
export const EMAIL_LINK_INTENT_COOKIE = 'cndn.email-link-intent'

/** Carries a token from the interstitial's GET to its confirming POST. */
export const EMAIL_LINK_PENDING_COOKIE = 'cndn.email-link-pending'

/** Where an unconfirmed redemption lands. */
export const EMAIL_LINK_CONFIRM_PATH = '/signin/confirm'

/**
 * Long enough to survive the longest token TTL (15 min, stored tier) plus mail
 * latency, short enough that an abandoned intent does not linger.
 */
export const EMAIL_LINK_INTENT_TTL_SECONDS = 20 * 60

/** The interstitial only has to survive a single page view and one click. */
export const EMAIL_LINK_PENDING_TTL_SECONDS = 10 * 60

/**
 * The cookie value for a raw token: `sha256(token + AUTH_SECRET)`.
 *
 * Salted with the app secret so the cookie cannot be derived from a token an
 * attacker holds without also holding the secret, and so the cookie itself
 * never reveals a redeemable value. Deliberately the SAME construction
 * `store.ts` persists, for one hashing rule across the feature.
 */
export function emailLinkIntentValue(rawToken: string): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('AUTH_SECRET is not set; email sign-in links are disabled')
  }
  return createHash('sha256').update(`${rawToken}${secret}`).digest('hex')
}

/**
 * Does `cookieValue` prove that THIS browser requested THIS token? Constant-time
 * and total: a missing cookie, a missing secret and a mismatch are all `false`.
 */
export function isSameBrowserIntent(
  cookieValue: string | null | undefined,
  rawToken: string | null | undefined,
): boolean {
  if (!cookieValue || !rawToken) return false
  let expected: string
  try {
    expected = emailLinkIntentValue(rawToken)
  } catch {
    return false
  }
  const a = Buffer.from(cookieValue, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
