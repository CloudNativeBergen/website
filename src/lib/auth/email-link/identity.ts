/**
 * THE REDEEMED ADDRESS, carried on the session.
 *
 * WHY THIS EXISTS. An email magic-link sign-in proves the person controls the
 * address the link was sent to — that is the whole mechanism. But until now the
 * proof evaporated at the token boundary: `authorize` verified the address, then
 * handed `@auth/core` only a speaker id, so nothing downstream could say WHICH
 * mailbox this session had proved.
 *
 * Anything needing that fact had to reconstruct it from the speaker document
 * instead — `providers[]` contains `email-link:<address>`, or `knownEmails`
 * contains it. Both are DOCUMENT state, not SESSION state, and document state
 * accumulates: `mergeSpeakers` unions a loser's `providers[]` onto the survivor,
 * so an organizer who merges a speaker holding `email-link:victim@x` moves that
 * entry onto their own document and can then present it as proof. That is fine
 * for deduplication, which is what those fields are for. It is not fine as the
 * key to an admin grant.
 *
 * So the claim is minted at the ONE moment the fact is actually true — the
 * redemption — and read from the session, never from a document.
 *
 * SCOPE. This is a FACT, not a capability: knowing which address a session
 * proved grants nothing on its own. Authorization still comes from
 * `organizerOrgIds`. The only consumer today is `organizerInvite.accept`
 * (platform#49).
 *
 * ABSENT MEANS NO PROOF. Sessions minted before this claim existed, and every
 * OAuth session, carry nothing here — so every consumer must FAIL CLOSED on an
 * absent value. The cost of that is one more sign-in, which for this flow is the
 * action being asked for anyway.
 */

/** The JWT/session key. One string, one definition. */
export const EMAIL_LINK_IDENTIFIER_CLAIM = 'emailLinkIdentifier'

/** The shape `authorize` adds to its returned user, and the JWT then carries. */
export interface EmailLinkIdentityCarrier {
  [EMAIL_LINK_IDENTIFIER_CLAIM]?: unknown
}

/**
 * The normalized address THIS session proved control of by redeeming a magic
 * link, or `null` for every other kind of session.
 *
 * Deliberately takes a loose shape: the value crosses the JWT boundary, so it is
 * validated on the way out rather than trusted because of where it came from.
 */
export function emailLinkIdentifierOf(
  carrier: EmailLinkIdentityCarrier | null | undefined,
): string | null {
  const value = carrier?.[EMAIL_LINK_IDENTIFIER_CLAIM]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
