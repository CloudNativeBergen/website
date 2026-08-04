import type { Conference } from '@/lib/conference/types'
import {
  parseAddress,
  platformSenderFrom,
  sanitizeHeaderText,
} from './sender-policy'

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
  // into a "Name <address>" From header. ONE shared sanitizer (`sender-policy`)
  // so the rule cannot drift between the two modules — it truncates at the
  // first CR/LF and drops angle brackets, so a stored value can neither smuggle
  // an extra header nor nest brackets.
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
 * EVERY sender a conference's mail can go out as.
 *
 * There is not ONE sender per conference — there are three, and they can sit on
 * different domains:
 *
 * | Field          | Flows that send from it                                     |
 * | -------------- | ----------------------------------------------------------- |
 * | `contactEmail` | sign-in links, badges, invitation letters, workshops, volunteers, broadcasts, proposal notifications |
 * | `cfpEmail`     | speaker mail, speaker/sponsor messaging, gallery, co-speaker invites |
 * | `sponsorEmail` | sponsor CRM + registration, contract signing and reminders   |
 *
 * (Several of those flows build the header inline rather than calling
 * {@link resolveConferenceFrom}, so this list is derived from the SEND SITES,
 * not from the schema.)
 *
 * Anything judging deliverability must judge all three: a conference whose
 * `contactEmail` is on a verified domain and whose `cfpEmail` is not has working
 * sign-in and rejected CFP mail, and a diagnostic that looks only at the first
 * would report health while speakers hear nothing.
 */
export const CONFERENCE_SENDER_FIELDS: ReadonlyArray<{
  label: string
  field: EmailField
  localPart: string
}> = [
  { label: 'Contact', field: 'contactEmail', localPart: 'contact' },
  { label: 'CFP', field: 'cfpEmail', localPart: 'cfp' },
  { label: 'Sponsors', field: 'sponsorEmail', localPart: 'sponsors' },
]

export interface ConferenceSender {
  /** Which family of mail sends as this — 'Contact', 'CFP', 'Sponsors'. */
  label: string
  /** The resolved `"Name <address>"` header. */
  from: string
  /** The bare address. */
  address: string
}

/** Resolve {@link CONFERENCE_SENDER_FIELDS} against a conference. */
export function conferenceSenders(
  conference: ConferenceLike,
): ConferenceSender[] {
  return CONFERENCE_SENDER_FIELDS.map(({ label, field, localPart }) => {
    const from = resolveConferenceFrom(conference, { field, localPart })
    return { label, from, address: bareAddress(from) }
  })
}

/**
 * Resolve a bare contact address for a conference (for `mailto:` links,
 * "contact us at …" copy, badge issuer profiles, etc.).
 *
 * Preference order: `contactEmail` → `contact@<primary-domain>` → the neutral,
 * logged platform fallback.
 *
 * The result is sanitized like any other address. Today's consumers put it in
 * JSON (badge issuer), an `href`, or email BODY copy — none of which is an SMTP
 * header, and all of which encode CR/LF harmlessly. Sanitizing anyway costs
 * nothing and means a future consumer that DOES build a header out of it does
 * not become the next injection point.
 */
export function resolveConferenceContact(conference: ConferenceLike): string {
  const explicit = conference?.contactEmail?.trim()
  if (explicit) return bareAddress(explicit)

  const domain = conference?.domains?.[0]?.trim()
  if (domain) return bareAddress(`contact@${domain}`)

  console.warn(
    `[email] conference "${conference?.title ?? 'unknown'}" has no contactEmail or domain; ` +
      'using the neutral platform fallback contact',
  )
  return platformFallbackContact()
}
