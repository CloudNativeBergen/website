import { clientWrite } from '../sanity/client'

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
 * Callers are responsible for proving the caller owns `email` before invoking
 * this (see `isEmailVerifiedForSession`, used by `speaker.updateEmail`). Because
 * the display email is itself a login match key, it must always be verified-owned.
 */
export async function updateProfileEmail(
  email: string,
  speakerId: string,
): Promise<{ error: Error | null }> {
  try {
    await clientWrite.patch(speakerId).set({ email }).commit()

    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}
