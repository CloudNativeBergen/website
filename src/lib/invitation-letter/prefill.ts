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

import { PARTICIPANT_ROLE_LABELS, type ParticipantRole } from './types'

/** What a ticket — or a speaker record — can contribute to a letter. */
export interface InvitationPrefill {
  fullName?: string
  email?: string
  registrationReference?: string
  organization?: string
  jobTitle?: string
  /**
   * The speaker document this letter is for, when the organizer arrived from
   * the speaker admin rather than from an order.
   *
   * Unlike every other field here this one is NOT a value the letter prints. It
   * is a lookup key: the resolver uses it to read the applicant's CONFIRMED
   * talks for this conference out of Sanity and print those. So a wrong id does
   * not mistype a letter, it attaches the wrong person's programme to one —
   * which is why it is shape-checked here and re-checked by the mutation
   * schema, and why the form tells the organizer whose sessions will be used.
   */
  speakerId?: string
  /** The capacity to preselect, so a letter started from a speaker says so. */
  role?: ParticipantRole
}

/** Whatever `searchParams` hands us — a value, a repeated value, or nothing. */
type RawParam = string | string[] | undefined

/**
 * Conservative caps for URL-seeded values. NOT a mirror of
 * `IssueInvitationLetterSchema` — `fullName` and `email` carry no `.max()`
 * there. These exist so a hand-edited link cannot stuff the form with a
 * megabyte of text; the schema still has the final say on what is accepted.
 */
const LIMITS = {
  name: 200,
  email: 254,
  reference: 120,
  organization: 200,
  jobTitle: 120,
  speakerId: 120,
} as const

/**
 * Control characters would travel into a PDF and an email header verbatim, and
 * runs of whitespace are almost always a copy/paste artefact.
 */
function clean(value: RawParam, maxLength: number): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string') return undefined

  // Strip C0 and C1 control characters (the ranges are deliberate).
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

/**
 * A Sanity document id and nothing else.
 *
 * Deliberately stricter than `clean`: this value is bound into a GROQ read, and
 * while parameter binding already makes injection a non-issue, a value that is
 * not a document id can only ever be a mistake — so it is dropped rather than
 * carried into the form and silently matching nothing.
 */
function cleanDocumentId(value: RawParam): string | undefined {
  const candidate = clean(value, LIMITS.speakerId)
  if (!candidate) return undefined
  return /^[A-Za-z0-9._-]+$/.test(candidate) ? candidate : undefined
}

/**
 * The participant role, when the link knows it.
 *
 * Validated against the enum rather than trusted: an unrecognised value would
 * otherwise reach a `<select>` with no matching option and leave the control
 * blank, so the organizer would submit a letter with no stated capacity.
 */
function cleanRole(value: RawParam): ParticipantRole | undefined {
  const candidate = clean(value, 20)
  // `Object.hasOwn`, not `in`: `in` walks the prototype chain, so `__proto__`,
  // `constructor`, `toString` and friends would all pass as roles and land in
  // a `<select>` with no matching option — the browser would then display
  // "Attendee" while submitting garbage, which is the exact failure this guard
  // exists to prevent.
  return candidate && Object.hasOwn(PARTICIPANT_ROLE_LABELS, candidate)
    ? (candidate as ParticipantRole)
    : undefined
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
    speakerId: cleanDocumentId(searchParams.speaker),
    role: cleanRole(searchParams.role),
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
  if (prefill.speakerId) params.set('speaker', prefill.speakerId)
  if (prefill.role) params.set('role', prefill.role)

  const query = params.toString()
  return query ? `/admin/invitations?${query}` : '/admin/invitations'
}
