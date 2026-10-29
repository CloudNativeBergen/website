import type { DocumentActionComponent } from 'sanity'

/**
 * The document types that hold a sponsor's bearer tokens: the workshop
 * early-access link (`workshopEarlyAccessToken`, #1346) and the sponsor's own
 * portal link (`registrationToken`).
 */
export const SPONSOR_LINK_TYPES: ReadonlySet<string> = new Set([
  'sponsorForConference',
])

/**
 * Remove Studio's Duplicate action from a sponsor's record in a conference.
 *
 * `readOnly: true` stops an organizer typing over a token; it does not stop
 * Duplicate, which copies every field. A duplicated sponsor would hold the
 * SAME tokens under an id of its own: revoking the link on one would leave it
 * live through the other, and a sign-up through it could record either
 * sponsor. (The revoke clears a revoked token wherever the conference holds
 * it, so this is the second of two guards, not the only one.)
 *
 * A sponsor is added to a conference from the sponsor CRM, which builds the
 * record field by field and copies no token.
 */
export function sponsorLinkSafeActions(
  actions: readonly DocumentActionComponent[],
  schemaType: string,
): DocumentActionComponent[] {
  return SPONSOR_LINK_TYPES.has(schemaType)
    ? actions.filter((action) => action.action !== 'duplicate')
    : [...actions]
}
