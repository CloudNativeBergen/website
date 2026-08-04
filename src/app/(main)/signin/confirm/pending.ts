import { safeCallbackPath } from '@/lib/auth/email-link/origin'

/**
 * The handoff between the redemption GET and its confirming POST.
 *
 * The callback route puts the raw token in an HttpOnly cookie (never a query
 * parameter, so it cannot leak through a referrer, a share or a server log) and
 * redirects to `/signin/confirm`. Both the page and the confirming server action
 * read it back through here.
 *
 * THE COOKIE IS NOT TRUSTED. A client can set a cookie of this name — HttpOnly
 * only prevents READING one — so its content is treated as untrusted input:
 * the destination is re-sanitized through `safeCallbackPath`, and the token
 * still has to survive full verification (signature/hash, expiry, audience,
 * tier) before anything is minted. Planting one buys an attacker nothing except
 * showing the user a confirmation page they must still deliberately click.
 */
export interface PendingEmailSignIn {
  token: string
  callbackUrl: string
}

export function readPendingEmailSignIn(
  raw: string | null | undefined,
): PendingEmailSignIn | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { t?: unknown; c?: unknown }
    const token = typeof parsed?.t === 'string' ? parsed.t : ''
    if (!token) return null
    return {
      token,
      callbackUrl: safeCallbackPath(
        typeof parsed?.c === 'string' ? parsed.c : null,
      ),
    }
  } catch {
    return null
  }
}

/**
 * A recognisable but non-disclosing rendering of an address: first character of
 * the local part plus the domain (`h•••@example.com`).
 *
 * Masked deliberately. The page has to let a victim of an induced navigation
 * see that the link is NOT theirs, which the domain and first letter already
 * achieve; printing the whole address would turn a page reachable by planting a
 * cookie into an address-disclosure surface.
 */
export function maskAddress(email: string): string {
  const at = email.lastIndexOf('@')
  if (at <= 0) return '•••'
  return `${email.slice(0, 1)}•••${email.slice(at)}`
}
