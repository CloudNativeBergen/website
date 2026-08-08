/**
 * ORGANIZER INVITATION (platform#49) — invite a person into
 * `conference.organizers[]` by EMAIL ADDRESS.
 *
 * `conference.organizers[]` is the canonical admin grant: it is what
 * `organizerOrgIds` is derived from, and therefore what `/admin` gates on. The
 * only editor before this was a picker whose corpus is *confirmed speakers of
 * this conference plus current organizers* — so on a fresh tenant the founding
 * organizer had nobody to pick and no way to grow a committee.
 *
 * THE TOKEN IS NOT OWNERSHIP PROOF. Invitation mail is forwarded and lands in
 * shared inboxes. The token only NAMES an invitation; the ONE accepted proof is
 * `session.emailLinkIdentifier` — the address the accepting session itself
 * proved by redeeming an email magic link. See
 * `src/server/routers/organizerInvite.ts` (the `accept` procedure) for why that
 * is read from the SESSION and never from the speaker document.
 */

export const ORGANIZER_INVITATION_STATUSES = [
  'pending',
  'accepted',
  'revoked',
  'expired',
] as const

export type OrganizerInvitationStatus =
  (typeof ORGANIZER_INVITATION_STATUSES)[number]

/** Days an organizer invitation stays valid, matching kontroll's 14. */
export const ORGANIZER_INVITATION_VALID_DAYS = 14

/**
 * The signed token payload. `docId` names the invitation, so redemption is a
 * by-id read rather than a scan over a bearer string; `invitedEmail` and
 * `expiresAt` are carried so a tampered payload fails the signature rather than
 * resolving to a different invitation.
 */
export interface OrganizerInviteTokenPayload {
  /** `_id` of the `organizerInvitation` document. */
  docId: string
  /** Canonical (trim + lowercase) invited address. */
  invitedEmail: string
  /** Epoch milliseconds. */
  expiresAt: number
}

/**
 * Client-safe invitation shape. Deliberately excludes the bearer `token`: no
 * query or mutation that reaches a browser may include it. The invitee receives
 * the token exclusively via the emailed link.
 */
export interface OrganizerInvitationMinimal {
  _id: string
  invitedEmail: string
  invitedName?: string
  status: OrganizerInvitationStatus
  expiresAt: string
  createdAt?: string
  respondedAt?: string
  invitedByName?: string
}

/** Server-side shape; includes the bearer token. Never send to a client. */
export interface OrganizerInvitationFull extends OrganizerInvitationMinimal {
  token: string
  /** Sanity revision, so the grant transaction can be compare-and-swap. */
  _rev?: string
  conferenceId?: string
  invitedById?: string
}

/**
 * Whether an invitation can no longer be accepted: already marked expired, or
 * still pending but past its expiry date. Mirrors `isInvitationExpired` in the
 * co-speaker module.
 */
export function isOrganizerInvitationExpired(inv: {
  status: string
  expiresAt: string
}): boolean {
  return (
    inv.status === 'expired' ||
    (inv.status === 'pending' && new Date(inv.expiresAt) < new Date())
  )
}

export function toMinimalOrganizerInvitation(
  invitation: OrganizerInvitationFull,
): OrganizerInvitationMinimal {
  return {
    _id: invitation._id,
    invitedEmail: invitation.invitedEmail,
    invitedName: invitation.invitedName,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
    respondedAt: invitation.respondedAt,
    invitedByName: invitation.invitedByName,
  }
}
