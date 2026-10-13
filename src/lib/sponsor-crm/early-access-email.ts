/**
 * The words of a "Workshop early access" send (#1347, spec
 * `docs/WORKSHOP_SPONSOR_EARLY_ACCESS_SPEC.md` §8): the block that carries the
 * sponsor's link, the text the composer starts from, and why a send is
 * refused. Pure and client-safe, like `./registration-email`: the server
 * appends exactly this block to the email it sends and records, and the Send
 * modal's preview renders the same string.
 *
 * THE REFUSALS ARE DECIDED IN ONE PLACE, on the server
 * (`decideEarlyAccessSend` in `@/lib/workshop/early-access/send`). The modal
 * asks it and shows the answer; it decides nothing on its own, so the two
 * cannot disagree.
 */
import { brandedOr, resolveEmailBrandPalette } from '@/lib/branding/email'
import { emailBrandColor, type ConferenceTheme } from '@/lib/branding/theme'
import { escapeHtml } from '@/lib/html/escape'
import { CONFERENCE_TIME_ZONE, formatRegistrationInstant } from '@/lib/time'
import type { CommunicationAttachment } from './types'

/** Why a workshop early-access email cannot be sent (spec §8). */
export type EarlyAccessSendRefusal =
  'localhost' | 'no-window' | 'opening-passed' | 'not-won' | 'no-portal'

/** What the organizer is told, in the modal and by the server alike. */
export const EARLY_ACCESS_SEND_REFUSALS: Record<
  EarlyAccessSendRefusal,
  string
> = {
  localhost:
    'Workshop early access cannot be sent from localhost. Deploy to a production domain first.',
  'no-window':
    'This conference has no early-access period. Under Workshops, set a "Sponsor Early Access Opens" time that is earlier than the time registration opens for everyone.',
  'opening-passed':
    'The early-access period is over. Workshop registration has already opened for everyone or has closed, so a link gives no head start.',
  'not-won':
    'Workshop early access can only be sent to a sponsor with a won deal. Move the sponsor to Closed Won first.',
  'no-portal':
    'This conference has no working workshop portal: its main domain cannot sign attendees in yet. Verify the domain under Settings, then try again.',
}

/** The one attachment row of an early-access send: the link itself. */
export function earlyAccessAttachments(url: string): CommunicationAttachment[] {
  return [{ label: 'Workshop early-access link', url }]
}

/**
 * The block the server appends to the email, so an edited message cannot lose
 * the link. It names both times in the conference's time zone, says who can
 * use the link and that it may be passed on.
 *
 * `url` is unset only in the modal's preview for a sponsor that has no link
 * yet: sending creates it, and the preview says so where the button will be.
 */
export function earlyAccessCardHtml({
  url,
  sponsorStart,
  officialOpening,
  theme,
}: {
  url?: string
  /** The sponsor start time and the official opening, as stored. */
  sponsorStart: string
  officialOpening: string
  theme?: ConferenceTheme | null
}): string {
  const brand = resolveEmailBrandPalette(emailBrandColor(theme))
  const accent = brandedOr(brand, '#1D4ED8')
  const text =
    'margin: 0 0 12px; color: #334155; font-size: 15px; line-height: 1.6;'
  const small = 'margin: 0; color: #64748B; font-size: 13px; line-height: 1.6;'
  const link = url ? escapeHtml(url) : null
  const action = link
    ? `<p style="margin: 4px 0 16px;"><a href="${link}" style="display: inline-block; background-color: ${accent}; color: #FFFFFF; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">Open early access</a></p><p style="${small} word-break: break-all;">Or open: <a href="${link}" style="color: ${accent}; text-decoration: none;">${link}</a></p>`
    : `<p style="${small} font-style: italic;">The link is created when this email is sent, and appears here.</p>`
  return `<div style="background-color: ${brand.cardBackground}; padding: 20px; border-radius: 12px; margin: 24px 0; border: 1px solid ${brand.cardBorder};"><h3 style="color: ${accent}; margin-top: 0; margin-bottom: 12px; font-size: 18px; font-weight: 600;">Early access to workshop sign-up</h3><p style="${text}">With this link, workshop sign-up opens on <strong>${escapeHtml(formatRegistrationInstant(sponsorStart))}</strong>. For everyone else it opens on <strong>${escapeHtml(formatRegistrationInstant(officialOpening))}</strong>.</p><p style="${text}">Each person needs a ticket that includes workshops, and signs in with the email address on that ticket.</p><p style="${text}">You may pass the link on to colleagues who are attending. Each person opens it once, in the browser they will sign up in.</p>${action}<p style="${small} margin-top: 12px;">All times are ${escapeHtml(CONFERENCE_TIME_ZONE)} time.</p></div>`
}

/**
 * The text a workshop early-access send starts from, editable in the modal.
 * The link and the times are in the block the server appends, so editing
 * this, or removing all of it, loses neither.
 */
export function earlyAccessGreeting(
  sponsorName: string,
  conferenceTitle: string,
) {
  const paragraph = (key: string, text: string) => ({
    _type: 'block' as const,
    _key: key,
    style: 'normal' as const,
    markDefs: [],
    children: [
      { _type: 'span' as const, _key: `${key}-text`, text, marks: [] },
    ],
  })
  return [
    paragraph(
      'early-access-thanks',
      `Thank you for sponsoring ${conferenceTitle}. As a sponsor, ${sponsorName} gets early access to workshop sign-up: your colleagues who are attending can sign up before it opens for everyone.`,
    ),
    paragraph(
      'early-access-how',
      'The link and the times are below. Seats in each workshop are limited, so it pays to sign up early.',
    ),
  ]
}
