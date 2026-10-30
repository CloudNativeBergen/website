import React from 'react'
import { escapeHtml } from '@/lib/html/escape'
import { WorkshopCanceledTemplate } from '@/components/email/WorkshopCanceledTemplate'
import { formatRegistrationInstant } from '@/lib/time'
import { PLATFORM_NAME } from '@/lib/branding/platform'
import {
  resolveEmailSender,
  retryWithBackoff,
  createEmailError,
  type EmailResult,
} from './config'
import type { Conference } from '@/lib/conference/types'
import { resolveConferenceFrom, resolveConferenceContact } from './from'
import { emailBrandColor } from '@/lib/branding/theme'
import { resolveEmailBrandPalette } from '@/lib/branding/email'
import { workshopRegistrationWindow } from '@/lib/workshop/registration-window'

/**
 * What the confirmation email reads of a conference: the sender fields, the
 * brand and the owning organization. A stored `conference` document carries
 * them as they are, so a caller may pass one read by id (#1357).
 */
export type WorkshopEmailConference = Pick<
  Conference,
  'title' | 'organizer' | 'contactEmail' | 'domains' | 'theme' | 'organization'
>

export interface WorkshopConfirmationEmailRequest {
  userEmail: string
  userName: string
  status?: string
  conference?: WorkshopEmailConference
  /**
   * The owning tenant, for call sites that have an org id but no conference
   * document (the admin `manualSignup` path). Takes precedence over
   * `conference.organization`; nullish ⇒ the shared platform account (#843).
   */
  orgId?: string | null
  workshopTitle: string
  workshopDate?: string
  workshopTime?: string
}

export interface WorkshopSignupInstructionsRequest {
  userEmail: string
  userName: string
  conference: Conference
  ticketCategory: string
  /**
   * The portal link, decided once per delivery by `workshopPortalUrl` (#1298):
   * `null` while the main host cannot sign in, and for a conference with no
   * domain. The email then says online sign-up is not available yet.
   */
  portalUrl: string | null
}

export interface WorkshopReminderRequest {
  userEmail: string
  userName: string
  conference: Conference
  /** The portal link: the reminder is refused without one. */
  portalUrl: string
  /** The organizer's note, plain text. Blank is no note. */
  note?: string
  /** The moment of the send, which decides what the email says of the window. */
  now: number
}

export async function sendBasicWorkshopConfirmation({
  userEmail,
  userName,
  status = 'confirmed',
  conference,
  orgId,
  workshopTitle,
  workshopDate,
  workshopTime,
}: WorkshopConfirmationEmailRequest): Promise<
  EmailResult<{ emailId: string }>
> {
  try {
    const fromEmail = resolveConferenceFrom(conference)

    const contactEmail = resolveConferenceContact(conference)

    const subject = `Workshop Confirmation: ${workshopTitle}`

    const brand = resolveEmailBrandPalette(emailBrandColor(conference?.theme))

    const statusText = status === 'confirmed' ? 'Confirmed' : 'Waitlist'
    const statusColor = status === 'confirmed' ? '#059669' : '#D97706'

    const safeName = escapeHtml(userName)
    const safeTitle = escapeHtml(workshopTitle)
    const safeContact = escapeHtml(contactEmail)
    const safeOrganizer = escapeHtml(conference?.organizer || PLATFORM_NAME)

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #F9FAFB; color: #334155;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9FAFB; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #FFFFFF; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="margin: 0 0 20px 0; font-size: 28px; font-weight: 700; color: ${brand.accent};">Workshop Confirmation</h2>
                    <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 24px; color: #334155;">Hi ${safeName},</p>
                    <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #334155;">Your registration for <strong>${safeTitle}</strong> has been confirmed!</p>

                    ${
                      workshopDate && workshopTime
                        ? `
                    <div style="background-color: ${brand.cardBackground}; border-left: 4px solid ${brand.accent}; padding: 16px; margin: 0 0 24px 0;">
                      <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #334155;">Workshop Details:</p>
                      <p style="margin: 0; font-size: 16px; line-height: 24px; color: #334155;">
                        <strong>Date:</strong> ${escapeHtml(workshopDate)}<br>
                        <strong>Time:</strong> ${escapeHtml(workshopTime)}
                      </p>
                    </div>
                    `
                        : ''
                    }

                    <div style="background-color: ${status === 'confirmed' ? '#ECFDF5' : '#FEF3C7'}; border-left: 4px solid ${statusColor}; padding: 16px; margin: 0 0 24px 0;">
                      <p style="margin: 0; font-size: 16px; line-height: 24px; color: #334155;">
                        <strong>Status:</strong> <span style="color: ${statusColor};">${statusText}</span>
                      </p>
                      ${status === 'waitlist' ? `<p style="margin: 8px 0 0 0; font-size: 14px; line-height: 20px; color: #334155;">You&apos;re on the waitlist. We&apos;ll notify you if a spot becomes available.</p>` : ''}
                    </div>

                    <p style="margin: 24px 0 16px 0; font-size: 16px; line-height: 24px; color: #334155;">We look forward to seeing you at the workshop!</p>

                    <p style="margin: 32px 0 16px 0; font-size: 14px; line-height: 20px; color: #334155;">If you have any questions, please contact us at <a href="mailto:${safeContact}" style="color: ${brand.accent}; text-decoration: none;">${safeContact}</a>.</p>

                    <p style="margin: 24px 0 0 0; font-size: 16px; line-height: 24px; color: #334155;">Best regards,<br><strong>${safeOrganizer}</strong></p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 24px 40px; background-color: #F9FAFB; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
                    <p style="margin: 0; font-size: 12px; line-height: 18px; color: #64748B; text-align: center;">© ${new Date().getFullYear()} ${safeOrganizer}. All rights reserved.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `

    const { client } = await resolveEmailSender(
      orgId ?? conference?.organization?._ref,
    )

    const emailResult = await retryWithBackoff(async () => {
      const result = await client.emails.send({
        from: fromEmail,
        to: [userEmail],
        subject,
        html,
      })

      if (result.error) {
        throw new Error(`Failed to send email: ${result.error.message}`)
      }

      return result
    })

    return {
      data: {
        emailId: emailResult.data?.id || '',
      },
    }
  } catch (error) {
    console.error('Error sending workshop confirmation email:', error)
    return {
      error: createEmailError('Failed to send confirmation email', 500),
    }
  }
}

/** The sign-up instructions email of the ticket-sold delivery, rendered. */
export function renderWorkshopSignupInstructions({
  userEmail,
  userName,
  conference,
  ticketCategory,
  portalUrl,
}: WorkshopSignupInstructionsRequest): {
  from: string
  to: string[]
  subject: string
  html: string
} {
  const fromEmail = resolveConferenceFrom(conference)
  // The ticket provider supplies these; the HTML gets them escaped.
  const safeName = escapeHtml(userName)
  const safeCategory = escapeHtml(ticketCategory)
  const safeEmail = escapeHtml(userEmail)

  const contactEmail = resolveConferenceContact(conference)

  const brand = resolveEmailBrandPalette(emailBrandColor(conference?.theme))

  const workshopUrl = portalUrl ?? ''

  // GATE THE CLAIM ON THE ACTUAL WINDOW. This email fires on ticket SALE,
  // which is routinely months before `workshopRegistrationStart` and can also
  // land after `workshopRegistrationEnd`. The old copy said "Registration Now
  // Available … first-come, first-served, sign up as soon as possible"
  // unconditionally, so the most common delivery told the attendee to do
  // something the server (workshop.signup) refuses with "Workshop registration
  // opens on …". Same window as the portal page and the signup mutation.
  const now = Date.now()
  const startsAt = conference.workshopRegistrationStart
  const endsAt = conference.workshopRegistrationEnd
  const registration: 'pending' | 'closed' | 'open' =
    startsAt && new Date(startsAt).getTime() > now
      ? 'pending'
      : endsAt && new Date(endsAt).getTime() < now
        ? 'closed'
        : 'open'
  // NO LINK, NO CLAIM (#1298): without a portal that can sign in, the email
  // must not tell the attendee to sign up now or list steps that cannot work.
  const unavailable = !workshopUrl && registration !== 'closed'

  // The same wording and zone the /workshop page shows this attendee.
  const when = formatRegistrationInstant

  const subject = unavailable
    ? `Workshop Signup Coming Soon - ${conference.title}`
    : registration === 'open'
      ? `Workshop Signup Available - ${conference.title}`
      : registration === 'pending'
        ? `Workshop Signup Opens ${when(startsAt!)} - ${conference.title}`
        : `Workshop Signup Has Closed - ${conference.title}`

  const heading = unavailable
    ? 'Workshop Registration Coming Soon'
    : registration === 'open'
      ? 'Workshop Registration Now Available'
      : registration === 'pending'
        ? 'Workshop Registration Opens Soon'
        : 'Workshop Registration Has Closed'

  const lede = unavailable
    ? `Your ticket includes access to workshops. Online workshop sign-up is not available yet.${registration === 'pending' ? ` Registration opens on <strong>${when(startsAt!)}</strong>.` : ''}`
    : registration === 'open'
      ? 'Your ticket includes access to workshops. You can now sign up for available workshop sessions.'
      : registration === 'pending'
        ? `Your ticket includes access to workshops. Registration is not open yet — it opens on <strong>${when(startsAt!)}</strong>, and you can sign up from then on.`
        : `Your ticket includes access to workshops, but registration closed on <strong>${when(endsAt!)}</strong>. Get in touch with us and we will see what we can do.`

  const steps =
    registration === 'closed' || unavailable
      ? ''
      : `
                  <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #334155;">How to register for workshops:</p>
                  <ol style="margin: 0 0 24px 0; padding-left: 24px;">
                    ${workshopUrl ? `<li style="margin: 0 0 8px 0; font-size: 16px; line-height: 24px; color: #334155;">${registration === 'pending' ? `When registration opens, visit` : `Visit`} the workshop signup page: <a href="${workshopUrl}" style="color: ${brand.accent}; text-decoration: none;">${workshopUrl}</a></li>` : ''}
                    <li style="margin: 0 0 8px 0; font-size: 16px; line-height: 24px; color: #334155;">Sign in with the email address associated with your ticket: <strong>${safeEmail}</strong></li>
                    <li style="margin: 0 0 8px 0; font-size: 16px; line-height: 24px; color: #334155;">Browse available workshops and select the ones you&apos;d like to attend</li>
                    <li style="margin: 0 0 8px 0; font-size: 16px; line-height: 24px; color: #334155;">Complete your registration</li>
                  </ol>

                  <div style="background-color: ${brand.cardBackground}; border-left: 4px solid ${brand.accent}; padding: 16px; margin: 0 0 24px 0;">
                    <p style="margin: 0; font-size: 16px; line-height: 24px; color: #334155;"><strong>Important:</strong> Workshops have limited capacity and are first-come, first-served.${registration === 'pending' ? ` Be ready when registration opens on ${when(startsAt!)} to secure your spot!` : ` We recommend signing up as soon as possible to secure your spot!`}</p>
                  </div>

                  <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
                    <tr>
                      <td align="center">
                        ${workshopUrl ? `<a href="${workshopUrl}" style="display: inline-block; background-color: ${brand.accent}; color: #FFFFFF; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px;">${registration === 'pending' ? 'View Workshop Signup Page' : 'Sign Up for Workshops'}</a>` : ''}
                      </td>
                    </tr>
                  </table>
`

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #F9FAFB; color: #334155;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9FAFB; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #FFFFFF; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
              <tr>
                <td style="padding: 40px;">
                  <h2 style="margin: 0 0 20px 0; font-size: 28px; font-weight: 700; color: ${brand.accent};">Welcome to ${conference.title}!</h2>
                  <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 24px; color: #334155;">Hi ${safeName},</p>
                  <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #334155;">Thank you for purchasing your <strong>${safeCategory}</strong> ticket!</p>

                  <h3 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: ${brand.accent};">${heading}</h3>
                  <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #334155;">${lede}</p>
${steps}

                  <p style="margin: 32px 0 16px 0; font-size: 14px; line-height: 20px; color: #334155;">If you have any questions or need assistance, please contact us at <a href="mailto:${contactEmail}" style="color: ${brand.accent}; text-decoration: none;">${contactEmail}</a>.</p>

                  <p style="margin: 24px 0 0 0; font-size: 16px; line-height: 24px; color: #334155;">See you at the conference!</p>
                  <p style="margin: 8px 0 0 0; font-size: 16px; line-height: 24px; color: #334155;">Best regards,<br><strong>${conference.organizer}</strong></p>
                </td>
              </tr>
              <tr>
                <td style="padding: 24px 40px; background-color: #F9FAFB; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
                  <p style="margin: 0; font-size: 12px; line-height: 18px; color: #64748B; text-align: center;">© ${new Date().getFullYear()} ${conference.organizer}. All rights reserved.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `

  return { from: fromEmail, to: [userEmail], subject, html }
}

/**
 * The organizer's reminder to a workshop ticket holder who has not signed up
 * (#1334, spec `docs/WORKSHOP_TICKETS_SPEC.md` §7), rendered.
 *
 * IT ASKS, IT NEVER STATES. Someone can sign up between the press and the
 * read, so it says "if you haven't picked your workshops yet" and never that
 * the recipient has no seat.
 *
 * THE WINDOW AT THE MOMENT OF THE SEND, by the rule sign-up itself applies
 * (`workshopRegistrationWindow`, without early access: the reminder goes to
 * ticket holders, not to sponsors' guests). Before it, the email names the
 * opening; during it, the closing, when one is set. After it there is no
 * reminder: the send is refused, and this throws rather than invite anyone.
 *
 * The organizer's note is shown above the standard text, escaped, so a note
 * containing HTML reads as typed. Without one the standard text is the same.
 */
export function renderWorkshopReminder({
  userEmail,
  userName,
  conference,
  portalUrl,
  note,
  now,
}: WorkshopReminderRequest): {
  from: string
  to: string[]
  subject: string
  html: string
} {
  const window = workshopRegistrationWindow(conference, {
    now: new Date(now),
    earlyAccess: false,
  })
  if (window.status === 'closed') {
    throw new Error('No workshop reminder after registration has closed')
  }
  const pending = window.status === 'not-open-yet'
  const endsAt = conference.workshopRegistrationEnd
  // The same wording and zone the /workshop page shows this attendee.
  const when = formatRegistrationInstant

  const fromEmail = resolveConferenceFrom(conference)
  const contactEmail = resolveConferenceContact(conference)
  const brand = resolveEmailBrandPalette(emailBrandColor(conference?.theme))
  // The ticket provider supplies these; the HTML gets them escaped.
  const safeName = escapeHtml(userName)
  const safeEmail = escapeHtml(userEmail)
  const safeNote = escapeHtml(note?.trim() ?? '').replace(/\r?\n/g, '<br>')

  const subject = pending
    ? `Workshop sign-up opens ${when(window.opensAt)} - ${conference.title}`
    : `Have you picked your workshops? - ${conference.title}`

  const ask = pending
    ? `sign-up opens on <strong>${when(window.opensAt)}</strong>, and you can pick them from then on.`
    : endsAt
      ? `sign-up is open until <strong>${when(endsAt)}</strong>.`
      : 'sign-up is open now.'

  const noteBlock = safeNote
    ? `
                  <div data-organizer-note style="background-color: ${brand.cardBackground}; border-left: 4px solid ${brand.accent}; padding: 16px; margin: 0 0 24px 0;"><p style="margin: 0; font-size: 16px; line-height: 24px; color: #334155;">${safeNote}</p></div>`
    : ''

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #F9FAFB; color: #334155;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9FAFB; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #FFFFFF; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
              <tr>
                <td style="padding: 40px;">
                  <h2 style="margin: 0 0 20px 0; font-size: 28px; font-weight: 700; color: ${brand.accent};">Workshops at ${conference.title}</h2>
                  <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 24px; color: #334155;">Hi ${safeName},</p>${noteBlock}
                  <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 24px; color: #334155;">Your ticket includes workshops. If you haven&apos;t picked your workshops yet, ${ask}</p>
                  <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #334155;">Workshops have limited seats and are first-come, first-served. Sign in on the workshop sign-up page with the email address your ticket is registered to: <strong>${safeEmail}</strong></p>

                  <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
                    <tr>
                      <td align="center">
                        <a href="${portalUrl}" style="display: inline-block; background-color: ${brand.accent}; color: #FFFFFF; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px;">${pending ? 'View Workshop Signup Page' : 'Pick Your Workshops'}</a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 20px; color: #334155;">Or open this link: <a href="${portalUrl}" style="color: ${brand.accent}; text-decoration: none;">${portalUrl}</a></p>

                  <p style="margin: 32px 0 16px 0; font-size: 14px; line-height: 20px; color: #334155;">If you have any questions or need assistance, please contact us at <a href="mailto:${contactEmail}" style="color: ${brand.accent}; text-decoration: none;">${contactEmail}</a>.</p>

                  <p style="margin: 24px 0 0 0; font-size: 16px; line-height: 24px; color: #334155;">See you at the conference!</p>
                  <p style="margin: 8px 0 0 0; font-size: 16px; line-height: 24px; color: #334155;">Best regards,<br><strong>${conference.organizer}</strong></p>
                </td>
              </tr>
              <tr>
                <td style="padding: 24px 40px; background-color: #F9FAFB; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
                  <p style="margin: 0; font-size: 12px; line-height: 18px; color: #64748B; text-align: center;">© ${new Date(now).getFullYear()} ${conference.organizer}. All rights reserved.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `

  return { from: fromEmail, to: [userEmail], subject, html }
}

export async function sendWorkshopSignupInstructions(
  request: WorkshopSignupInstructionsRequest,
): Promise<EmailResult<{ emailId: string }>> {
  try {
    const email = renderWorkshopSignupInstructions(request)
    const { client } = await resolveEmailSender(
      request.conference?.organization?._ref,
    )

    const emailResult = await retryWithBackoff(async () => {
      const result = await client.emails.send(email)

      if (result.error) {
        throw new Error(`Failed to send email: ${result.error.message}`)
      }

      return result
    })

    return {
      data: {
        emailId: emailResult.data?.id || '',
      },
    }
  } catch (error) {
    console.error('Error sending workshop signup instructions email:', error)
    return {
      error: createEmailError(
        'Failed to send workshop signup instructions',
        500,
      ),
    }
  }
}

export interface WorkshopAnnouncementEmailRequest {
  userEmail: string
  userName: string
  conference?: Conference
  workshopTitle: string
  /** Display name of the owner/organizer who wrote the announcement. */
  authorName: string
  /** Raw announcement text (owner-authored). MUST be HTML-escaped before embed. */
  body: string
}

/**
 * Send ONE announcement email to ONE confirmed workshop participant. This is the
 * attendee-facing counterpart to `sendBasicWorkshopConfirmation` (raw-HTML,
 * Resend, retry-with-backoff) — deliberately NOT the speaker-audience messaging
 * BaseEmailTemplate, since recipients are workshop attendees. Returns an
 * `EmailResult` and never throws; the caller fans out with bounded concurrency
 * and tolerates per-recipient failures.
 */
export async function sendWorkshopAnnouncementEmail({
  userEmail,
  userName,
  conference,
  workshopTitle,
  authorName,
  body,
}: WorkshopAnnouncementEmailRequest): Promise<
  EmailResult<{ emailId: string }>
> {
  try {
    const fromEmail = resolveConferenceFrom(conference)

    const contactEmail = resolveConferenceContact(conference)

    const brand = resolveEmailBrandPalette(emailBrandColor(conference?.theme))

    const subject = `Workshop Update: ${workshopTitle}`
    const safeBody = escapeHtml(body).replace(/\r?\n/g, '<br>')

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #F9FAFB; color: #334155;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9FAFB; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #FFFFFF; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="margin: 0 0 8px 0; font-size: 28px; font-weight: 700; color: ${brand.accent};">Workshop Update</h2>
                    <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #64748B;">${escapeHtml(workshopTitle)}</p>
                    <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 24px; color: #334155;">Hi ${escapeHtml(userName)},</p>
                    <div style="background-color: #F1F5F9; border-left: 4px solid ${brand.accent}; padding: 16px 20px; margin: 0 0 24px 0; border-radius: 4px;">
                      <p style="margin: 0; font-size: 16px; line-height: 24px; color: #334155;">${safeBody}</p>
                    </div>
                    <p style="margin: 24px 0 0 0; font-size: 14px; line-height: 20px; color: #64748B;">— ${escapeHtml(authorName)}</p>
                    <p style="margin: 24px 0 16px 0; font-size: 14px; line-height: 20px; color: #334155;">If you have any questions, please contact us at <a href="mailto:${contactEmail}" style="color: ${brand.accent}; text-decoration: none;">${contactEmail}</a>.</p>
                    <p style="margin: 16px 0 0 0; font-size: 16px; line-height: 24px; color: #334155;">Best regards,<br><strong>${escapeHtml(conference?.organizer || PLATFORM_NAME)}</strong></p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 24px 40px; background-color: #F9FAFB; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
                    <p style="margin: 0; font-size: 12px; line-height: 18px; color: #64748B; text-align: center;">© ${new Date().getFullYear()} ${escapeHtml(conference?.organizer || PLATFORM_NAME)}. You are receiving this because you are a confirmed participant of this workshop.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `

    const { client } = await resolveEmailSender(conference?.organization?._ref)

    const emailResult = await retryWithBackoff(async () => {
      const result = await client.emails.send({
        from: fromEmail,
        to: [userEmail],
        subject,
        html,
      })

      if (result.error) {
        throw new Error(`Failed to send email: ${result.error.message}`)
      }

      return result
    })

    return {
      data: {
        emailId: emailResult.data?.id || '',
      },
    }
  } catch (error) {
    console.error('Error sending workshop announcement email:', error)
    return {
      error: createEmailError('Failed to send announcement email', 500),
    }
  }
}

export interface WorkshopCanceledEmailRequest {
  userEmail: string
  userName: string
  status: 'confirmed' | 'waitlist'
  conference?: Conference
  workshopTitle: string
  /** The organizer's message, plain text. */
  message: string
  /** Where an organizer moved them (`workshop.admin.moveCanceledSignups`). */
  movedTo?: { workshopTitle: string; status: 'confirmed' | 'waitlist' }
}

/**
 * Tell ONE person signed up for a canceled workshop. Sent only when an
 * organizer asks (`workshop.admin.notifyCanceled`). Never throws.
 */
export async function sendWorkshopCanceledEmail({
  userEmail,
  userName,
  status,
  conference,
  workshopTitle,
  message,
  movedTo,
}: WorkshopCanceledEmailRequest): Promise<EmailResult<{ emailId: string }>> {
  try {
    const { client } = await resolveEmailSender(conference?.organization?._ref)
    const emailResult = await retryWithBackoff(async () => {
      const result = await client.emails.send({
        from: resolveConferenceFrom(conference),
        to: [userEmail],
        subject: movedTo
          ? `Workshop changed: ${workshopTitle} → ${movedTo.workshopTitle}`
          : `Workshop canceled: ${workshopTitle}`,
        react: React.createElement(WorkshopCanceledTemplate, {
          userName,
          workshopTitle,
          status,
          message,
          movedTo,
          organizer: conference?.organizer || PLATFORM_NAME,
          contactEmail: resolveConferenceContact(conference),
          brandColor: emailBrandColor(conference?.theme),
        }),
      })
      if (result.error) {
        throw new Error(`Failed to send email: ${result.error.message}`)
      }
      return result
    })
    return { data: { emailId: emailResult.data?.id || '' } }
  } catch (error) {
    console.error('Error sending workshop canceled email:', error)
    return {
      error: createEmailError('Failed to send workshop canceled email', 500),
    }
  }
}
