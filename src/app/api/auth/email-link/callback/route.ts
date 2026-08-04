import { NextResponse, type NextRequest } from 'next/server'
import { AuthError } from 'next-auth'
import { signIn } from '@/lib/auth'
import { EMAIL_LINK_PROVIDER_ID } from '@/lib/auth/email-link/constants'
import {
  EMAIL_LINK_CONFIRM_PATH,
  EMAIL_LINK_INTENT_COOKIE,
  EMAIL_LINK_PENDING_COOKIE,
  EMAIL_LINK_PENDING_TTL_SECONDS,
  isSameBrowserIntent,
} from '@/lib/auth/email-link/intent'
import { safeCallbackPath } from '@/lib/auth/email-link/origin'

/**
 * REDEEM an emailed sign-in link.
 *
 * The emailed URL is a GET (it is clicked from a mail client), while the
 * credentials callback @auth/core exposes is a POST. This route is the bridge:
 * it hands the token to `signIn`, which performs the whole credentials flow
 * server-side — `authorize` (verification, origin binding, tier check, speaker
 * resolution) → the `jwt` callback → the session cookie — and returns the
 * post-sign-in destination.
 *
 * TOKEN HYGIENE:
 *  - `Referrer-Policy: no-referrer` so the token cannot leak to whatever the
 *    user lands on next (or to any asset the destination loads).
 *  - `Cache-Control: no-store` so no shared cache retains a URL carrying it.
 *  - `X-Robots-Tag: noindex` in case a link ends up somewhere crawlable.
 *  - The redirect target NEVER carries the token, and no branch logs it.
 *
 * FAILURES ARE OPAQUE. Expired, replayed, cross-tenant and malformed tokens all
 * land on the same `/signin?error=EmailSignIn` page. The distinction exists in
 * the server log (`verify.ts` reasons) and nowhere else, so the endpoint cannot
 * be used as an oracle for which tokens exist.
 *
 * LOGIN CSRF. This is an unauthenticated GET that can mint a session, and
 * server-side `signIn` runs with `skipCSRFCheck`, so a session is only minted
 * HERE when the browser proves it is the one that asked for the link (the
 * intent cookie — see `intent.ts`). Every other redemption is handed to
 * `/signin/confirm`, whose continue control is a server action, i.e. a POST that
 * Next refuses cross-origin. That is what stops an attacker's own link from
 * silently switching a victim's browser to the attacker's account. The token
 * moves to the interstitial in an HttpOnly cookie rather than the query string.
 *
 * KNOWN LIMITATION — HOST-ONLY SESSION COOKIE. `signIn` writes the session
 * cookie through Next's cookie jar (`next/headers`), which Next merges into the
 * response AFTER this handler returns. The per-response `Domain` rewriter
 * (`applySessionCookieDomain`, wrapped around `handlers` and the middleware)
 * therefore never sees it, so an email sign-in produces a HOST-ONLY cookie
 * where the OAuth path would widen to the tenant's eTLD+1.
 *
 * This is the SAFE direction — `auth-cookie-domain.ts` documents host-only as
 * the intended degradation for "any emission path the rewriter misses", and a
 * narrower cookie can never be read by another host. The user-visible effect is
 * that a magic-link session does not follow the user across sibling subdomains
 * of the tenant's own domain (e.g. apex → `2026.`); the next OAuth sign-in
 * self-heals it, because the rewriter emits a counter-scope clear on every set.
 *
 * Closing it properly means driving the credentials callback through the
 * WRAPPED `handlers.POST` instead of `signIn` — which needs a CSRF cookie/body
 * pair minted by hand against @auth/core's internal format. That is a worse
 * trade today than a narrower cookie, so it is recorded here rather than
 * smoothed over.
 */

const FAILURE_REDIRECT = '/signin?error=EmailSignIn'

function harden(res: NextResponse): NextResponse {
  res.headers.set('Referrer-Policy', 'no-referrer')
  res.headers.set('Cache-Control', 'no-store, max-age=0')
  res.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return res
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  const callbackUrl = safeCallbackPath(
    request.nextUrl.searchParams.get('callbackUrl'),
  )

  if (!token) {
    return harden(NextResponse.redirect(new URL(FAILURE_REDIRECT, request.url)))
  }

  // NOT the browser that requested this link (cross-device, or login CSRF):
  // hand off to the confirmation interstitial instead of minting. Nothing is
  // verified or consumed here — an unverified token in a cookie grants nothing,
  // and doing the work now would let a mere navigation burn a single-use link.
  if (
    !isSameBrowserIntent(
      request.cookies.get(EMAIL_LINK_INTENT_COOKIE)?.value,
      token,
    )
  ) {
    const confirm = NextResponse.redirect(
      new URL(EMAIL_LINK_CONFIRM_PATH, request.url),
    )
    confirm.cookies.set({
      name: EMAIL_LINK_PENDING_COOKIE,
      value: JSON.stringify({ t: token, c: callbackUrl }),
      httpOnly: true,
      sameSite: 'lax',
      secure: new URL(request.url).protocol === 'https:',
      path: '/',
      maxAge: EMAIL_LINK_PENDING_TTL_SECONDS,
    })
    return harden(confirm)
  }

  try {
    // `redirect: false` returns the destination instead of throwing Next's
    // redirect signal, so the response headers above can still be applied.
    const destination = await signIn(EMAIL_LINK_PROVIDER_ID, {
      token,
      redirect: false,
      redirectTo: callbackUrl,
    })

    // `signIn` resolves the destination through the `redirect` callback, which
    // already applies the parsed-origin same-origin guard. Re-resolving it
    // against the request URL here means an unexpected value can only ever
    // produce a same-origin redirect.
    const target = new URL(String(destination ?? callbackUrl), request.url)
    if (target.origin !== new URL(request.url).origin) {
      return harden(
        NextResponse.redirect(new URL(FAILURE_REDIRECT, request.url)),
      )
    }
    // Belt and braces: strip any auth query params that rode along.
    target.searchParams.delete('token')
    const response = NextResponse.redirect(target)
    // SINGLE-USE INTENT: the proof that this browser asked for THIS link is
    // spent. A replay of the same (stateless, still-live) token therefore has to
    // go through the confirmation interstitial like any other unproven one.
    response.cookies.delete(EMAIL_LINK_INTENT_COOKIE)
    return harden(response)
  } catch (error) {
    // `CredentialsSignin` is the expected outcome for every invalid token.
    if (!(error instanceof AuthError)) {
      console.error('[email-link] unexpected failure redeeming a link', error)
    }
    return harden(NextResponse.redirect(new URL(FAILURE_REDIRECT, request.url)))
  }
}
