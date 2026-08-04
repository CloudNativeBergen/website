import React from 'react'
import { render } from '@react-email/render'
import { EmailSignInTemplate } from '@/components/email/EmailSignInTemplate'
import { resolveEmailSender, retryWithBackoff } from '@/lib/email/config'
import { resolveConferenceFrom } from '@/lib/email/from'
import type { Conference } from '@/lib/conference/types'

/**
 * Deliver a magic-link email.
 *
 * SENDER RESOLUTION goes through {@link resolveEmailSender} (per-org Resend
 * credentials when the tenant has them, the platform account otherwise) and
 * {@link resolveConferenceFrom} (the conference's own From, then its domain,
 * then the neutral platform fallback). This is the first production call site of
 * `resolveEmailSender` — every other send path still imports the global `resend`
 * singleton, which is the substance of platform#20/#26.
 *
 * KNOWN EXTERNAL DEPENDENCY, NOT SOLVED HERE: on the SHARED Resend tier a
 * tenant-domain `From` is unverified, and Resend rejects the send outright. A
 * second tenant therefore gets no sign-in mail at all until it either has its
 * own Resend credentials in `TENANT_SECRETS_JSON` or the platform account
 * verifies its domain. That is a sender-policy problem, deliberately out of this
 * change's scope — but it means email login is not usable by tenant #2 until it
 * is closed. The failure is at least LOUD here: `sendEmailSignInLink` returns
 * `false` and logs, rather than reporting success into a silent void.
 */
export async function sendEmailSignInLink(params: {
  to: string
  signInUrl: string
  expiresInMinutes: number
  singleUse: boolean
  conference: Conference | null | undefined
  orgId?: string | null
}): Promise<boolean> {
  const { to, signInUrl, expiresInMinutes, singleUse, conference, orgId } =
    params

  const eventName = conference?.title || 'the conference'
  const from = resolveConferenceFrom(conference, {
    field: 'contactEmail',
    localPart: 'noreply',
  })

  try {
    const html = await render(
      React.createElement(EmailSignInTemplate, {
        signInUrl,
        expiresInMinutes,
        singleUse,
        eventName,
        eventLocation: [conference?.city, conference?.country]
          .filter(Boolean)
          .join(', '),
        eventDate: conference?.startDate ?? '',
        eventUrl: new URL(signInUrl).origin,
        socialLinks: conference?.socialLinks ?? [],
      }),
    )

    const { client, from: tenantFrom } = await resolveEmailSender(orgId)

    const result = await retryWithBackoff(async () =>
      client.emails.send({
        from: tenantFrom || from,
        to,
        subject: `Sign in to ${eventName}`,
        html,
        // Sign-in links must never be threaded, forwarded by a mail client's
        // "similar messages" grouping, or prefetched by a link scanner that
        // follows content in bulk.
        headers: { 'X-Entity-Ref-ID': crypto.randomUUID() },
      }),
    )

    if (result?.error) {
      console.error('[email-link] Resend rejected the sign-in email', {
        name: result.error.name,
        message: result.error.message,
      })
      return false
    }
    return true
  } catch (error) {
    // NEVER log `signInUrl` or the token it carries.
    console.error('[email-link] failed to send the sign-in email', error)
    return false
  }
}
