'use server'

import { randomBytes } from 'crypto'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthError } from 'next-auth'
import { signIn } from '@/lib/auth'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  EMAIL_LINK_PROVIDER_ID,
  EMAIL_LINK_VERIFY_REQUEST_PATH,
} from '@/lib/auth/email-link/constants'
import {
  EMAIL_LINK_INTENT_COOKIE,
  EMAIL_LINK_INTENT_TTL_SECONDS,
  EMAIL_LINK_PENDING_COOKIE,
} from '@/lib/auth/email-link/intent'
import { safeCallbackPath } from '@/lib/auth/email-link/origin'
import { requestEmailSignInLink } from '@/lib/auth/email-link/request'
import { sendEmailSignInLink } from '@/lib/auth/email-link/send'
import { readPendingEmailSignIn } from './confirm/pending'

/**
 * The "email me a sign-in link" form action.
 *
 * A SERVER ACTION rather than a public route handler, deliberately: Next
 * enforces an Origin/Host match on action invocations, which gives this endpoint
 * CSRF and cross-site-abuse protection for free. The rate limiter is the control
 * that matters for same-origin abuse, and it lives inside
 * {@link requestEmailSignInLink}.
 *
 * THE RESPONSE IS ALWAYS THE SAME. Whatever happens — unknown address,
 * malformed address, rate limit, mail failure — the browser is redirected to the
 * same "check your email" page. No branch here may ever grow a distinguishing
 * message; that is the entire no-enumeration property.
 */
export async function requestEmailSignInLinkAction(
  formData: FormData,
): Promise<void> {
  const email = String(formData.get('email') ?? '')
  const callbackUrl = safeCallbackPath(
    String(formData.get('callbackUrl') ?? ''),
  )
  const headerList = await headers()

  // ALWAYS set, on EVERY outcome. It carries the token's salted hash when a link
  // was minted and an unrelated random value otherwise, so redemption can tell
  // "this browser asked for this link" (skip the confirmation interstitial)
  // without the cookie's mere presence revealing whether anything was sent. See
  // `intent.ts`.
  let intent = randomBytes(32).toString('hex')

  try {
    // The conference is used ONLY for branding and sender resolution; a
    // degraded lookup must not stop a sign-in, so it is best-effort.
    const { conference } = await getConferenceForCurrentDomain()

    const outcome = await requestEmailSignInLink(
      { email, headers: headerList, callbackUrl },
      {
        send: (args) =>
          sendEmailSignInLink({
            ...args,
            conference,
            orgId: conference?.organization?._ref ?? null,
          }),
      },
    )
    intent = outcome.intent
  } catch (error) {
    // Swallowed on purpose: a thrown error would render a different page and
    // become the enumeration signal this whole path exists to avoid.
    console.error('[email-link] sign-in request failed', error)
  }

  const jar = await cookies()
  jar.set({
    name: EMAIL_LINK_INTENT_COOKIE,
    value: intent,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: EMAIL_LINK_INTENT_TTL_SECONDS,
  })

  redirect(EMAIL_LINK_VERIFY_REQUEST_PATH)
}

/**
 * Confirm a redemption that did NOT come from the browser that requested the
 * link (cross-device, or an attacker-induced navigation).
 *
 * THIS IS THE LOGIN-CSRF BOUNDARY. It is a server action, so Next enforces an
 * Origin/Host match on the POST: an attacker can navigate a victim's browser to
 * the callback URL, but cannot make it submit this form cross-site. The token
 * comes from the HttpOnly pending cookie the callback route set — never from a
 * query parameter — so it is not replayable out of a link or a referrer.
 *
 * The cookie is deleted BEFORE the sign-in is attempted, so a failure cannot
 * leave a resubmittable interstitial behind.
 */
export async function confirmEmailSignInAction(): Promise<void> {
  const jar = await cookies()
  const pending = readPendingEmailSignIn(
    jar.get(EMAIL_LINK_PENDING_COOKIE)?.value,
  )
  jar.delete(EMAIL_LINK_PENDING_COOKIE)

  if (!pending) redirect('/signin?error=EmailSignIn')

  let destination: string
  try {
    destination =
      String(
        await signIn(EMAIL_LINK_PROVIDER_ID, {
          token: pending.token,
          redirect: false,
          redirectTo: pending.callbackUrl,
        }),
      ) || pending.callbackUrl
  } catch (error) {
    if (!(error instanceof AuthError)) {
      console.error('[email-link] unexpected failure confirming a link', error)
    }
    redirect('/signin?error=EmailSignIn')
  }

  // `signIn` resolves the destination through the `redirect` callback (which
  // already applies a same-origin guard) and hands back an ABSOLUTE URL. Only
  // its path+query is reused, against this origin, so an unexpected value can
  // only ever produce a same-origin redirect — the same belt-and-braces the
  // callback route applies.
  redirect(samePathOf(destination, pending.callbackUrl))
}

function samePathOf(destination: string, fallback: string): string {
  try {
    const url = new URL(destination, 'https://email-link.invalid')
    const path = safeCallbackPath(`${url.pathname}${url.search}`)
    return path === '/' ? fallback : path
  } catch {
    return fallback
  }
}
