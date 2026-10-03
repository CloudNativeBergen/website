/**
 * The contract kind of a sponsor send (#1264, spec #1260 stories 10–14): ONE
 * action whose effect follows the contract and signature state. Pure and
 * client-safe — the modal labels its button and preselects a template from
 * the same decision the server acts on, and previews the same card the
 * server appends.
 */
import { brandedOr, resolveEmailBrandPalette } from '@/lib/branding/email'
import { emailBrandColor, type ConferenceTheme } from '@/lib/branding/theme'
import { escapeHtml } from '@/lib/html/escape'
import type { CommunicationAttachment } from './types'

export type ContractAction = 'send' | 'remind' | 'signed-copy'

/** The state the decision reads — a subset of `SponsorForConferenceExpanded`. */
export interface ContractActionState {
  contractStatus?: string | null
  signatureStatus?: string | null
  signatureId?: string | null
  signingUrl?: string | null
}

/**
 * Signed wins over pending, pending over nothing: a signed contract is never
 * reminded, and a pending signature is never sent a second agreement.
 */
export function contractActionFor(sfc: ContractActionState): ContractAction {
  if (
    sfc.contractStatus === 'contract-signed' ||
    sfc.signatureStatus === 'signed'
  ) {
    return 'signed-copy'
  }
  if (
    sfc.signatureStatus === 'pending' &&
    !!sfc.signatureId &&
    !!sfc.signingUrl
  ) {
    return 'remind'
  }
  return 'send'
}

/** The button label says what will happen (story 14). */
export const CONTRACT_ACTION_LABELS: Record<ContractAction, string> = {
  send: 'Send contract',
  remind: 'Send reminder',
  'signed-copy': 'Send signed copy',
}

/** The sponsor email template slug for each action (category `contract`). */
export const CONTRACT_ACTION_SLUGS: Record<ContractAction, string> = {
  send: 'contract-sent',
  remind: 'contract-reminder',
  'signed-copy': 'contract-signed',
}

const CONTRACT_LINK_LABELS: Record<ContractAction, string> = {
  send: 'Signing link',
  remind: 'Signing link',
  'signed-copy': 'Signed agreement',
}

export function contractAttachments(
  action: ContractAction,
  url: string,
): CommunicationAttachment[] {
  return [{ label: CONTRACT_LINK_LABELS[action], url }]
}

const CARD_COPY: Record<
  ContractAction,
  { heading: string; body: string; button: string }
> = {
  send: {
    heading: 'Review and sign your sponsorship agreement',
    body: 'The link below is unique to you. Open it to read the full agreement and sign it digitally.',
    button: 'Review & sign agreement',
  },
  remind: {
    heading: 'Your sponsorship agreement is awaiting your signature',
    body: 'The same link as before — open it to read the full agreement and sign it digitally.',
    button: 'Review & sign agreement',
  },
  'signed-copy': {
    heading: 'Your signed sponsorship agreement',
    body: 'A copy of the signed agreement is available at the link below for your records.',
    button: 'Download signed agreement',
  },
}

/**
 * The block the server appends to a contract send — the signing link or the
 * signed document. Rendered identically in the modal's preview. On the first
 * send the link does not exist until the agreement is created, so the preview
 * passes `url: undefined` and the card says so instead of showing a fake.
 */
export function contractCardHtml({
  action,
  url,
  theme,
}: {
  action: ContractAction
  url?: string
  theme?: ConferenceTheme | null
}): string {
  const brand = resolveEmailBrandPalette(emailBrandColor(theme))
  const accent = brandedOr(brand, '#1D4ED8')
  const copy = CARD_COPY[action]
  const link = url
    ? `<p style="margin: 0 0 16px;"><a href="${escapeHtml(url)}" style="display: inline-block; background-color: ${accent}; color: #FFFFFF; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">${copy.button}</a></p><p style="margin: 0; color: #64748B; font-size: 13px; line-height: 1.6; word-break: break-all;">Or open: <a href="${escapeHtml(url)}" style="color: ${accent}; text-decoration: none;">${escapeHtml(url)}</a></p>`
    : `<p style="margin: 0; color: #64748B; font-size: 13px; line-height: 1.6;">The signing link is created when you send, and appears here in the email.</p>`
  return `<div style="background-color: ${brand.cardBackground}; padding: 20px; border-radius: 12px; margin: 24px 0; border: 1px solid ${brand.cardBorder};"><h3 style="color: ${accent}; margin-top: 0; margin-bottom: 12px; font-size: 18px; font-weight: 600;">${copy.heading}</h3><p style="margin: 0 0 16px; color: #334155; font-size: 15px; line-height: 1.6;">${copy.body}</p>${link}</div>`
}
