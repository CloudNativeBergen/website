import { NextResponse, type NextRequest } from 'next/server'
import { AuthError } from 'next-auth'
import { signIn } from '@/lib/auth'
import { EMAIL_LINK_PROVIDER_ID } from '@/lib/auth/email-link/constants'
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
    return harden(NextResponse.redirect(target))
  } catch (error) {
    // `CredentialsSignin` is the expected outcome for every invalid token.
    if (!(error instanceof AuthError)) {
      console.error('[email-link] unexpected failure redeeming a link', error)
    }
    return harden(NextResponse.redirect(new URL(FAILURE_REDIRECT, request.url)))
  }
}
