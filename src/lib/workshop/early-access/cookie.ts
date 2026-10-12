import { hostCookie } from '../central-sign-in/cookies'

/**
 * EARLY ACCESS, AS A BROWSER HOLDS IT (#1346, spec §5): a cookie with the
 * token of the link that was opened, and nothing else. `HttpOnly`, bound to
 * the host that set it, and set to expire at the official opening. It counts
 * only while the link is live, which is checked when it is used.
 */
export const earlyAccessCookie = () => hostCookie('workshop-early-access')
