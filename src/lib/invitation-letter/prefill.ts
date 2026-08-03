/**
 * Seeding the issuing form from the ticketing system.
 *
 * An organizer who gets a visa request nearly always has the person's order
 * open already, so the letter form is reachable from there with what we hold
 * on file. Only ever the things a ticket can actually tell us: name, email,
 * employer, job title and the order to quote. Everything a consulate checks
 * against the passport — date of birth, nationality, passport number, gender,
 * address — the applicant has to send separately, and is left blank.
 *
 * Nothing here is verified. The name on a ticket is the name the buyer typed,
 * which is often not the name in the passport, and the buyer of an order is
 * frequently not the person travelling. So these values are a starting point
 * the organizer edits, never a fact the letter asserts — the form says as much
 * where they land.
 *
 * The values arrive as URL query parameters, i.e. from anywhere. They are
 * treated as untrusted text: trimmed, stripped of control characters, capped
 * to the same lengths the mutation schema enforces, and dropped when they do
 * not fit. Nothing in here throws, so a hand-mangled link degrades to an empty
 * form rather than a broken page.
 */

/** What a ticket can contribute to a letter. */
export interface InvitationPrefill {
  fullName?: string
  email?: string
  registrationReference?: string
  organization?: string
  jobTitle?: string
}

/** Whatever `searchParams` hands us — a value, a repeated value, or nothing. */
type RawParam = string | string[] | undefined

/** Matches the `.max()` caps in `IssueInvitationLetterSchema`. */
const LIMITS = {
  name: 200,
  email: 254,
  reference: 120,
  organization: 200,
  jobTitle: 120,
} as const

/**
 * Control characters would travel into a PDF and an email header verbatim, and
 * runs of whitespace are almost always a copy/paste artefact.
 */
function clean(value: RawParam, maxLength: number): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string') return undefined

  // eslint-disable-next-line no-control-regex
  const stripped = raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
  const collapsed = stripped.replace(/\s+/g, ' ').trim()

  if (!collapsed || collapsed.length > maxLength) return undefined
  return collapsed
}

/**
 * Deliberately the same shape check as the mutation, so a value that seeds the
 * form is a value the form can submit. A wrong-looking address is dropped
 * rather than pre-filled, because an unnoticed bad address means the letter
 * silently goes nowhere.
 */
function cleanEmail(value: RawParam): string | undefined {
  const candidate = clean(value, LIMITS.email)
  if (!candidate) return undefined
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : undefined
}

/** Reads the seed out of a page's `searchParams`. Never throws. */
export function parseInvitationPrefill(
  searchParams: Record<string, RawParam> | undefined,
): InvitationPrefill {
  if (!searchParams) return {}

  const prefill: InvitationPrefill = {
    fullName: clean(searchParams.name, LIMITS.name),
    email: cleanEmail(searchParams.email),
    registrationReference: clean(searchParams.ref, LIMITS.reference),
    organization: clean(searchParams.org, LIMITS.organization),
    jobTitle: clean(searchParams.title, LIMITS.jobTitle),
  }

  // Drop the empties so `hasInvitationPrefill` and React defaults stay simple.
  return Object.fromEntries(
    Object.entries(prefill).filter(([, value]) => value !== undefined),
  )
}

/** True when there is anything worth telling the organizer about. */
export function hasInvitationPrefill(prefill: InvitationPrefill): boolean {
  return Object.values(prefill).some((value) => !!value)
}

/**
 * Builds the link that carries a ticket into the issuing form.
 *
 * The reference is the ORDER id rather than the ticket id: it is what the
 * attendee sees on their confirmation, what the orders table links to, and
 * what an organizer can search for in both this admin and checkin.no. A ticket
 * id is an internal row number nobody quotes.
 */
export function invitationLetterHref(prefill: InvitationPrefill): string {
  const params = new URLSearchParams()
  if (prefill.fullName) params.set('name', prefill.fullName)
  if (prefill.email) params.set('email', prefill.email)
  if (prefill.registrationReference)
    params.set('ref', prefill.registrationReference)
  if (prefill.organization) params.set('org', prefill.organization)
  if (prefill.jobTitle) params.set('title', prefill.jobTitle)

  const query = params.toString()
  return query ? `/admin/invitations?${query}` : '/admin/invitations'
}
