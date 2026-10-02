/**
 * The discount-codes block of a sponsor discount send (#1262). Pure and
 * client-safe: the server appends exactly this HTML to the email it sends and
 * records, and the Send modal's preview renders the same string — so what the
 * organizer previews is what the sponsor receives.
 */
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import { brandedOr, resolveEmailBrandPalette } from '@/lib/branding/email'
import { emailBrandColor, type ConferenceTheme } from '@/lib/branding/theme'
import { escapeHtml } from '@/lib/html/escape'
import type { CommunicationAttachment } from './types'

/**
 * Where a sponsor redeems a code. Sponsor ticket types are hidden on the
 * public store, so the sponsor invite link comes first; the public link and
 * the conference's own /tickets page are fallbacks (the old discount modal's
 * rule, now derived on the server instead of accepted from the client).
 */
export function sponsorTicketUrl(conference: {
  sponsorRegistrationLink?: string | null
  registrationLink?: string | null
  domains?: string[]
}): string {
  return (
    conference.sponsorRegistrationLink ||
    conference.registrationLink ||
    `${conferenceBaseUrl(conference)}/tickets`
  )
}

/** One attachment row per code, so the audit record lists what was sent. */
export function discountCodeAttachments(
  codes: readonly string[],
  ticketUrl: string,
): CommunicationAttachment[] {
  return codes.map((code) => ({
    label: `Discount code ${code}`,
    url: ticketUrl,
  }))
}

const MONO =
  "Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace"

export function discountCodesCardHtml({
  codes,
  ticketUrl,
  theme,
}: {
  codes: readonly string[]
  ticketUrl: string
  theme?: ConferenceTheme | null
}): string {
  const brand = resolveEmailBrandPalette(emailBrandColor(theme))
  const accent = brandedOr(brand, '#1D4ED8')
  const url = escapeHtml(ticketUrl)
  const heading =
    codes.length === 1 ? 'Your discount code' : 'Your discount codes'
  const items = codes
    .map(
      (code) =>
        `<li style="margin-bottom: 8px;"><code style="background-color: #F1F5F9; padding: 4px 8px; border-radius: 4px; font-family: ${MONO};">${escapeHtml(code)}</code></li>`,
    )
    .join('')
  return `<div style="background-color: ${brand.cardBackground}; padding: 20px; border-radius: 12px; margin: 24px 0; border: 1px solid ${brand.cardBorder};"><h3 style="color: ${accent}; margin-top: 0; margin-bottom: 16px; font-size: 18px; font-weight: 600;">${heading}</h3><ul style="margin: 0 0 16px; padding-left: 20px; color: #334155; font-size: 15px; line-height: 1.6;">${items}</ul><p style="margin: 0; color: #334155; font-size: 15px; line-height: 1.6;">Enter the code at checkout to claim your sponsor tickets: <a href="${url}" style="color: ${accent}; text-decoration: none; font-weight: 500;">${url}</a></p></div>`
}
