import { hostCookie } from '../central-sign-in/cookies'
import { isEarlyAccessToken } from './link'

/**
 * EARLY ACCESS, AS A BROWSER HOLDS IT (#1346, spec §5): a cookie with the
 * token of the link that was opened, and nothing else. `HttpOnly`, bound to
 * the host that set it, and set to expire at the official opening. It counts
 * only while the link is live, which is checked when it is used.
 */
export const earlyAccessCookie = () => hostCookie('workshop-early-access')

/**
 * The token the request's browser holds, or `undefined`. A value that is not
 * the shape of a token this issues is no token: nothing is looked up for it.
 */
export function earlyAccessTokenOf(cookies: {
  get(name: string): { value: string } | undefined
}): string | undefined {
  const value = cookies.get(earlyAccessCookie().name)?.value
  return isEarlyAccessToken(value) ? value : undefined
}
