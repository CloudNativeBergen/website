'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { EMAIL_LINK_VERIFY_REQUEST_PATH } from '@/lib/auth/email-link/constants'
import { safeCallbackPath } from '@/lib/auth/email-link/origin'
import { requestEmailSignInLink } from '@/lib/auth/email-link/request'
import { sendEmailSignInLink } from '@/lib/auth/email-link/send'

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
  const callbackUrl = safeCallbackPath(String(formData.get('callbackUrl') ?? ''))
  const headerList = await headers()

  try {
    // The conference is used ONLY for branding and sender resolution; a
    // degraded lookup must not stop a sign-in, so it is best-effort.
    const { conference } = await getConferenceForCurrentDomain()

    await requestEmailSignInLink(
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
  } catch (error) {
    // Swallowed on purpose: a thrown error would render a different page and
    // become the enumeration signal this whole path exists to avoid.
    console.error('[email-link] sign-in request failed', error)
  }

  redirect(EMAIL_LINK_VERIFY_REQUEST_PATH)
}
