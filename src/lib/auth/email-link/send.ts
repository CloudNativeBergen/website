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
 * then the neutral platform fallback).
 *
 * ON THE SHARED RESEND TIER a tenant-domain `From` is not verified for the
 * platform account, and Resend would reject the send outright — which used to
 * mean a newly provisioned tenant got no sign-in mail at all. That is now
 * corrected at the client by the SENDER POLICY (`lib/email/sender-policy.ts`,
 * platform#20): the message goes out from the platform's verified sender
 * carrying the conference's display name, with the conference's own address in
 * `Reply-To`. Nothing about it is decided here.
 *
 * WHY THE LOGGING BELOW IS NOT REDUNDANT with the choke point's: the CALLER of
 * this function (`requestEmailSignInLink`) must return the same opaque outcome
 * whether or not the mail went out, so a `false` return here vanishes by
 * design. The `[email-link]` line is what tells an operator that sign-in is
 * broken for a specific tenant host — it names the conference, which the
 * client-level log cannot.
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
        conference: conference?.title,
        orgId: orgId ?? undefined,
        from: tenantFrom || from,
        name: result.error.name,
        message: result.error.message,
      })
      return false
    }
    return true
  } catch (error) {
    // NEVER log `signInUrl` or the token it carries.
    console.error('[email-link] failed to send the sign-in email', {
      conference: conference?.title,
      orgId: orgId ?? undefined,
      from: from,
      error,
    })
    return false
  }
}
