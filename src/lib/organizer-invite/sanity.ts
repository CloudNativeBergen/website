import { clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import type {
  OrganizerInvitationFull,
  OrganizerInvitationMinimal,
} from './types'

/**
 * Reads for the organizer-invitation flow. Every invitation read is
 * CONFERENCE-SCOPED through {@link scopedFetch} with a server-resolved
 * `conferenceId` — never a client-supplied one. That is not decoration: it is
 * what makes an invitation minted for tenant A unresolvable on tenant B's host,
 * so a leaked token cannot be redeemed against the wrong conference, and it is
 * why the refusal there is indistinguishable from "no such token".
 */

/**
 * The organizer refs of ONE conference, named by the id the request resolved
 * from its host. Extracted so the nested root filter carries its own
 * suppression, and so the two callers cannot drift apart.
 */
// groq-global-scoped: the predicate IS the tenant — `_id == $conferenceId` on
// this request's server-resolved conference, never a client-supplied id.
const THIS_CONFERENCE_ORGANIZER_REFS = `*[_type == "conference" && _id == $conferenceId].organizers[]._ref`

const INVITATION_PROJECTION = `{
  _id,
  invitedEmail,
  invitedName,
  status,
  token,
  expiresAt,
  createdAt,
  respondedAt,
  "conferenceId": conference._ref,
  "invitedById": invitedBy._ref,
  "invitedByName": invitedBy->name
}`

/**
 * Load an invitation BY ID within the request's conference. Returns `null` for
 * a missing document AND for one belonging to another conference — the caller
 * must not be able to tell those apart.
 */
export async function getOrganizerInvitationById(
  conferenceId: string,
  invitationId: string,
): Promise<OrganizerInvitationFull | null> {
  if (!invitationId) return null
  try {
    const invitation = await scopedFetch<OrganizerInvitationFull | null>(
      clientReadUncached,
      { conferenceId },
      `*[_type == "organizerInvitation" && _id == $invitationId][0] ${INVITATION_PROJECTION}`,
      { invitationId },
      { cache: 'no-store' },
    )
    return invitation ?? null
  } catch (error) {
    console.error('Error fetching organizer invitation by id:', error)
    return null
  }
}

/**
 * Every invitation for the request's conference, newest first, WITHOUT the
 * bearer token — this list is rendered in the admin UI.
 */
export async function listOrganizerInvitations(
  conferenceId: string,
): Promise<OrganizerInvitationMinimal[]> {
  const rows = await scopedFetch<OrganizerInvitationMinimal[] | null>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "organizerInvitation"] | order(coalesce(createdAt, _createdAt) desc) {
      _id,
      invitedEmail,
      invitedName,
      status,
      expiresAt,
      createdAt,
      respondedAt,
      "invitedByName": invitedBy->name
    }`,
    {},
    { cache: 'no-store' },
  )
  return rows ?? []
}

/**
 * Whether this conference already has a LIVE (pending, unexpired) invitation for
 * an address. A REJECTING guard, so the caller passes the wider NFKC-normalized
 * key: matching more addresses rejects more, which fails closed.
 */
export async function hasPendingOrganizerInvitation(
  conferenceId: string,
  normalizedEmail: string,
  now: Date = new Date(),
): Promise<boolean> {
  const count = await scopedFetch<number>(
    clientReadUncached,
    { conferenceId },
    `count(*[_type == "organizerInvitation" && status == "pending" && lower(invitedEmail) == $email && expiresAt > $now])`,
    { email: normalizedEmail, now: now.toISOString() },
    { cache: 'no-store' },
  )
  return (count ?? 0) > 0
}

/**
 * The `providers[]` of one speaker — the ONLY evidence this feature accepts that
 * a person controls a mailbox.
 *
 * An entry `email-link:<address>` is written by exactly one code path,
 * `getOrCreateSpeakerForVerifiedEmail`, which runs only after a magic link sent
 * to that address was redeemed. It is deliberately NOT `knownEmails`, whose
 * writer set is wider and historically included unverified sources (#808) — a
 * conference-admin grant is the worst possible place to inherit that taint.
 */
export async function getSpeakerProviders(
  speakerId: string,
): Promise<string[] | null> {
  if (!speakerId) return null
  try {
    const providers = await clientReadUncached.fetch<(string | null)[] | null>(
      // groq-global: `speaker` is a global, cross-org document with no tenant
      // predicate to apply, and this is an OWNERSHIP probe on the CALLER's own
      // server-derived id (`ctx.speaker._id`) — never a client-supplied one.
      `*[_type == "speaker" && _id == $speakerId][0].providers`,
      { speakerId },
      { cache: 'no-store' },
    )
    if (!providers) return []
    return providers.filter(
      (p): p is string => typeof p === 'string' && p.length > 0,
    )
  } catch (error) {
    // FAIL CLOSED: an unreadable probe proves no ownership.
    console.error('Error reading speaker providers:', error)
    return null
  }
}

/**
 * Whether an address already belongs to a current organizer of this conference.
 * A REJECTING guard, so it deliberately matches over the WIDE verified-email set
 * (display `email` plus `knownEmails`) with the NFKC-normalized key: matching
 * more addresses rejects more invitations, which fails closed.
 */
export async function isEmailAlreadyOrganizer(
  conferenceId: string,
  normalizedEmail: string,
): Promise<boolean> {
  const count = await clientReadUncached.fetch<number>(
    // NOTE on the annotations here and below: `no-unscoped-groq` judges every
    // root filter separately, so the nested root gets its own marker on the line
    // above its own constant — the same shape `src/lib/auth/email-link/tier.ts`
    // uses for `ANY_ORGANIZER`.
    //
    // groq-global: `speaker` is a global, cross-org type with no tenant field of
    // its own; the tenant bound is THIS_CONFERENCE_ORGANIZER_REFS below.
    `count(*[_type == "speaker"
      && (lower(email) == $email || count((knownEmails[])[lower(@) == $email]) > 0)
      && _id in ${THIS_CONFERENCE_ORGANIZER_REFS}])`,
    { email: normalizedEmail, conferenceId },
    { cache: 'no-store' },
  )
  return (count ?? 0) > 0
}

/**
 * The current `organizers[]` refs of a conference, read by its SERVER-RESOLVED
 * id. Used to keep the grant idempotent.
 */
export async function getConferenceOrganizerIds(
  conferenceId: string,
): Promise<string[]> {
  const refs = await clientReadUncached.fetch<(string | null)[] | null>(
    THIS_CONFERENCE_ORGANIZER_REFS,
    { conferenceId },
    { cache: 'no-store' },
  )
  return (refs ?? []).filter(
    (r): r is string => typeof r === 'string' && r.length > 0,
  )
}
