import type { Conference } from '@/lib/conference/types'
import { parseAddress, platformSenderFrom } from './sender-policy'

/**
 * Non-branded sender/contact resolution for conference emails (CaaS #625).
 *
 * The rule: prefer the conference's own field, then derive from its primary
 * domain, and ONLY as a last resort use a NEUTRAL platform default read from
 * the environment — never another org's hardcoded brand address. The last
 * resort is a genuine misconfiguration (a conference with neither an email
 * field nor a domain), so it is logged loudly rather than silently papered
 * over.
 *
 * `EMAIL_FALLBACK_FROM` (optional) supplies that neutral default as a full
 * `"Name <address>"` header. When unset a deliberately non-deliverable,
 * brand-free placeholder is used so a broken config surfaces instead of
 * masquerading as a real conference.
 *
 * WHAT THIS RESOLVES IS AN IDENTITY, NOT AN ENVELOPE. The address chosen here is
 * the one the conference WANTS to be seen as; whether the platform's Resend
 * account may actually send from it is a separate question, answered at the
 * client by `sender-policy.ts` (platform#20). A tenant whose domain is not
 * verified still gets its name and its `Reply-To:` — the `From:` address is
 * swapped for a deliverable one on the way out.
 */

const NEUTRAL_FALLBACK_FROM = 'Conference <noreply@localhost>'

/** The neutral, env-driven platform sender (`"Name <address>"`). */
export function platformFallbackFrom(): string {
  return platformSenderFrom() ?? NEUTRAL_FALLBACK_FROM
}

/** Extract the bare `address` from a `"Name <address>"` (or plain) string. */
function bareAddress(from: string): string {
  return parseAddress(from).address
}

/** The bare address of the neutral platform sender. */
export function platformFallbackContact(): string {
  return bareAddress(platformFallbackFrom())
}

type EmailField = 'contactEmail' | 'sponsorEmail' | 'cfpEmail'

/**
 * Structurally-typed, null-tolerant view of a conference. Sanity projections
 * surface these fields as `string | null`, so every field is optional AND
 * nullable here — callers pass whatever conference-shaped object they hold.
 */
type ConferenceFields = keyof Pick<
  Conference,
  'title' | 'organizer' | 'contactEmail' | 'sponsorEmail' | 'cfpEmail'
>

type ConferenceLike =
  | (Partial<Record<ConferenceFields, string | null | undefined>> & {
      domains?: string[] | null
    })
  | null
  | undefined

/**
 * Resolve a `"Name <address>"` From header for a conference email.
 *
 * Preference order: the explicit `field` → `<localPart>@<primary-domain>` →
 * the neutral, logged platform fallback.
 */
export function resolveConferenceFrom(
  conference: ConferenceLike,
  {
    field = 'contactEmail',
    localPart = 'contact',
  }: { field?: EmailField; localPart?: string } = {},
): string {
  // Header-injection hardening: the display name and address are interpolated
  // into a "Name <address>" From header — strip CR/LF and angle brackets so a
  // stored value can never smuggle extra headers or nest brackets.
  const sanitizeHeaderText = (v: string) => v.replace(/[\r\n<>]/g, '').trim()
  const organizer = conference?.organizer
    ? sanitizeHeaderText(conference.organizer)
    : undefined
  const explicit = conference?.[field]?.trim()
  const domain = conference?.domains?.[0]?.trim()

  if (explicit) {
    const safeExplicit = sanitizeHeaderText(explicit)
    return organizer ? `${organizer} <${safeExplicit}>` : safeExplicit
  }
  if (domain) {
    const address = `${localPart}@${domain}`
    return organizer ? `${organizer} <${address}>` : address
  }

  console.warn(
    `[email] conference "${conference?.title ?? 'unknown'}" has no ${field} or domain; ` +
      'using the neutral platform fallback sender',
  )
  const fallback = platformFallbackFrom()
  return organizer ? `${organizer} <${bareAddress(fallback)}>` : fallback
}

/**
 * Resolve a bare contact address for a conference (for `mailto:` links,
 * "contact us at …" copy, badge issuer profiles, etc.).
 *
 * Preference order: `contactEmail` → `contact@<primary-domain>` → the neutral,
 * logged platform fallback.
 */
export function resolveConferenceContact(conference: ConferenceLike): string {
  const explicit = conference?.contactEmail?.trim()
  if (explicit) return explicit

  const domain = conference?.domains?.[0]?.trim()
  if (domain) return `contact@${domain}`

  console.warn(
    `[email] conference "${conference?.title ?? 'unknown'}" has no contactEmail or domain; ` +
      'using the neutral platform fallback contact',
  )
  return platformFallbackContact()
}
