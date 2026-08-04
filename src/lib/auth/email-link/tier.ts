import { clientReadUncached } from '@/lib/sanity/client'
import { groq } from 'next-sanity'

/**
 * TIER SELECTION for an email sign-in link.
 *
 *  - `stored`   — organizers and admins. Single-use, revocable, replay-proof.
 *  - `stateless`— everyone else (speakers, attendees, unknown addresses).
 *
 * The tier is decided from the ADDRESS, which is known before the link is
 * minted, and re-derived again at redemption (`verify.ts`) so a token minted
 * before a promotion cannot be redeemed with the weaker guarantees after it.
 *
 * PRIVILEGE IS NOT CARRIED BY THE TOKEN. The tier only chooses a verification
 * mechanism; authorization still comes from `organizerOrgIds` on the speaker
 * document at session-mint time. A tier misjudgement therefore cannot grant
 * anything — at worst it applies weaker replay protection than deserved, which
 * is why the redemption-time re-check exists.
 */
export type EmailLinkTier = 'stateless' | 'stored'

/**
 * True when the address belongs to a speaker who organizes ANY conference.
 *
 * GLOBAL by design, mirroring `findSpeakersByEmails`: identity is a global
 * person here, and a link is minted before any tenant scoping is meaningful.
 * Being an organizer ANYWHERE earns the stronger token — deliberately
 * over-inclusive, because the failure direction of over-inclusion is one extra
 * Sanity document.
 *
 * Matching uses the same verified-email match-set as login (`knownEmails` plus
 * the display `email`), so an organizer who signs in with a secondary verified
 * address still gets the stored tier.
 */
// NOTE on the annotations below: `no-unscoped-groq` only honours a
// `groq-global:` marker on the query line or the ONE line directly above it, so
// the marker must be the LAST comment line. (A multi-line annotation silently
// fails to suppress — several already in this repo do.)
//
// The organizer set across ALL conferences: the same predicate
// `IS_ORGANIZER_FIELD` uses in the login projection.
// groq-global: role lookup spans every tenant by design
const ANY_ORGANIZER = groq`*[_type == "conference"].organizers[]._ref`

// Identity/role lookup for an address. An organizer of ANY tenant must get the
// stronger token, so this is deliberately not org-scoped.
// groq-global: cross-tenant identity join, same rule as findSpeakersByEmails
const ORGANIZER_BY_EMAIL_QUERY = groq`count(*[
  _type == "speaker"
  && (lower(email) == $email || count((knownEmails[])[lower(@) == $email]) > 0)
  && _id in ${ANY_ORGANIZER}
]) > 0`

/**
 * Resolve the tier for a normalized email address.
 *
 * FAIL-SAFE DIRECTION: any read failure resolves to `stored`. The stronger tier
 * is never the wrong answer for security — it only costs one document and one
 * write — whereas defaulting to `stateless` on a transient Sanity error would
 * silently hand a privileged account a replayable link.
 */
export async function resolveEmailLinkTier(
  normalizedEmail: string,
): Promise<EmailLinkTier> {
  try {
    const isOrganizer = await clientReadUncached.fetch<boolean>(
      ORGANIZER_BY_EMAIL_QUERY,
      { email: normalizedEmail },
      { cache: 'no-store' },
    )
    return isOrganizer ? 'stored' : 'stateless'
  } catch (error) {
    console.error(
      '[email-link] tier lookup failed; defaulting to the stored tier',
      error,
    )
    return 'stored'
  }
}
