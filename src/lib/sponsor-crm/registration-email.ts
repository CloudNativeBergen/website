/**
 * The registration-link block of a sponsor registration send (#1263). Pure
 * and client-safe: the server appends exactly this HTML to the email it sends
 * and records, and the Send modal's preview renders the same string — so the
 * link the organizer previews is the link the sponsor receives, and editing
 * the message can never lose it.
 */
import { brandedOr, resolveEmailBrandPalette } from '@/lib/branding/email'
import { emailBrandColor, type ConferenceTheme } from '@/lib/branding/theme'
import { escapeHtml } from '@/lib/html/escape'
import type { CommunicationAttachment } from './types'

export const PORTAL_URL_PLACEHOLDER = '{{{SPONSOR_PORTAL_URL}}}'

/**
 * Replace a `{{{SPONSOR_PORTAL_URL}}}` left in text — a template applied
 * before the link was known (#1263 review). The server runs this on the
 * subject and body it sends; the preview runs it on what it shows.
 */
export function mergePortalUrl(text: string, portalUrl: string): string {
  return text.split(PORTAL_URL_PLACEHOLDER).join(portalUrl)
}

export const PORTAL_URL_WRONG_KIND_MESSAGE =
  'This message uses the sponsor registration link ({{{SPONSOR_PORTAL_URL}}}), which only a registration send can fill in. Send it as a registration, or remove the merge field.'

/**
 * Whether a subject or body still carries the registration merge field —
 * as text or as a link's href (#1263 review). Only a registration send can
 * fill it; any other kind must refuse rather than mail the placeholder.
 */
export function carriesPortalPlaceholder(
  subject: string,
  message: unknown,
): boolean {
  return (
    subject.includes(PORTAL_URL_PLACEHOLDER) ||
    JSON.stringify(message).includes(PORTAL_URL_PLACEHOLDER)
  )
}

/** The one attachment row of a registration send: the portal link itself. */
export function registrationAttachments(
  portalUrl: string,
): CommunicationAttachment[] {
  return [{ label: 'Sponsor registration link', url: portalUrl }]
}

export function registrationCardHtml({
  portalUrl,
  theme,
}: {
  portalUrl: string
  theme?: ConferenceTheme | null
}): string {
  const brand = resolveEmailBrandPalette(emailBrandColor(theme))
  const accent = brandedOr(brand, '#1D4ED8')
  const url = escapeHtml(portalUrl)
  return `<div style="background-color: ${brand.cardBackground}; padding: 20px; border-radius: 12px; margin: 24px 0; border: 1px solid ${brand.cardBorder};"><h3 style="color: ${accent}; margin-top: 0; margin-bottom: 12px; font-size: 18px; font-weight: 600;">Complete your sponsor registration</h3><p style="margin: 0 0 16px; color: #334155; font-size: 15px; line-height: 1.6;">This link is personal to your sponsorship. Before registration it opens the form; afterwards it shows your sponsorship status.</p><p style="margin: 0 0 16px;"><a href="${url}" style="display: inline-block; background-color: ${accent}; color: #FFFFFF; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">Complete registration</a></p><p style="margin: 0; color: #64748B; font-size: 13px; line-height: 1.6; word-break: break-all;">Or open: <a href="${url}" style="color: ${accent}; text-decoration: none;">${url}</a></p></div>`
}
