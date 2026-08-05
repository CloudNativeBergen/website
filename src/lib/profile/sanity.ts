import { clientWrite } from '../sanity/client'
import { canonicalEmail } from '../speaker/email'

/**
 * Set a speaker's display `email`.
 *
 * SECURITY: this only ever writes the display `email` field. It MUST NOT touch
 * `knownEmails` — that is the verified match-set used to auto-link logins across
 * providers, and it is owned exclusively by the login path
 * (`computeVerifiedEmails` in `@/lib/speaker/sanity`). Unioning an arbitrary
 * caller-supplied email into `knownEmails` here previously enabled cross-provider
 * account takeover (an attacker could poison a victim's address into the set and
 * absorb the victim's next verified login).
 *
 * The display `email` is itself a login match key (`findSpeakersByEmails`), so
 * every caller owes SOME control over who ends up able to sign in as the target:
 *
 *  - `speaker.updateEmail` (self-service) proves the CALLER owns the address —
 *    `isEmailVerifiedForSession`.
 *  - `speaker.admin.updateEmail` (organizer) cannot prove that; it is contact-
 *    detail maintenance. It instead proves the TARGET is exclusive to the
 *    caller's own tenant (`requireSpeakerInCurrentOrg(..., { requireExclusive:
 *    true })`, #742), so an unverified value can never be pointed at a person
 *    another organization also holds.
 *
 * Do not add a third caller with neither guarantee. #807 tracks removing the
 * need for the second one by narrowing what counts as a login match key.
 *
 * The value is CANONICALIZED before it is written (#684): trimmed + lowercased,
 * deliberately WITHOUT NFKC, because this field is a real recipient address that
 * the app sends mail to. `isEmailVerifiedForSession` compares with the fuller
 * `normalizeEmail`, and NFKC is a no-op for ASCII, so matching is unaffected.
 */
export async function updateProfileEmail(
  email: string,
  speakerId: string,
): Promise<{ error: Error | null }> {
  try {
    await clientWrite
      .patch(speakerId)
      .set({ email: canonicalEmail(email) })
      .commit()

    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}
