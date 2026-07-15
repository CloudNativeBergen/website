import { Session } from 'next-auth'
import { verifiedEmails as fetchGithubVerifiedEmails } from './github'
import { ProfileEmail } from './types'
import { normalizeEmail } from '../speaker/email'
import { clientReadUncached } from '@/lib/sanity/client'

/**
 * The caller's persisted verified match-set (`speaker.knownEmails`). This field
 * is only ever written from affirmatively-verified emails at login
 * (`computeVerifiedEmails`), so membership here is proof of verified ownership —
 * independent of, and authoritative over, the optimistic `verified` flag the
 * picker uses. Returns [] when the id is missing or the read fails (fail-closed).
 */
async function getSpeakerKnownEmails(
  speakerId: string | undefined,
): Promise<string[]> {
  if (!speakerId) return []
  try {
    const emails = await clientReadUncached.fetch<string[] | null>(
      `*[_type == "speaker" && _id == $id][0].knownEmails`,
      { id: speakerId },
    )
    return Array.isArray(emails) ? emails : []
  } catch (error) {
    console.error('Failed to read speaker knownEmails:', error)
    return []
  }
}

export function defaultEmails(session: Session): ProfileEmail[] {
  return [
    {
      email: session.user.email,
      verified: true,
      primary: true,
      visibility: 'private',
    },
  ]
}

/**
 * Resolve the caller's PROVIDER-VERIFIED emails from their session.
 *
 * SECURITY: this is the single server-side source of truth for which email
 * addresses the caller has proven ownership of. It mirrors the `speaker.getEmails`
 * picker exactly, so the set the UI offers and the set `speaker.updateEmail`
 * authorizes against can never diverge. Never trust a client-supplied "verified"
 * list — always recompute here.
 *
 * - GitHub: the verified set from the GitHub `/user/emails` API. On error or an
 *   empty response we fall back to the session primary, which GitHub only ever
 *   surfaces once verified.
 * - LinkedIn / other: the session primary (for the PICKER only — see below).
 *
 * NOTE: this powers the profile email PICKER (a UI convenience). It must NOT be
 * the sole authority for `updateEmail` — the session is minted regardless of a
 * LinkedIn `email_verified` claim, so the non-GitHub primary here is optimistic.
 * The security-critical ownership check lives in {@link isEmailVerifiedForSession},
 * which is authoritative and cross-checks the persisted verified match-set.
 */
export async function getVerifiedProfileEmails(
  session: Session,
): Promise<ProfileEmail[]> {
  if (!session.account) {
    return defaultEmails(session)
  }

  try {
    switch (session.account.provider) {
      case 'github': {
        const result = await fetchGithubVerifiedEmails(session.account)
        if (result.error) {
          console.error('Failed to fetch GitHub emails:', result.error)
          return defaultEmails(session)
        }
        return result.emails.length > 0 ? result.emails : defaultEmails(session)
      }

      default:
        return defaultEmails(session)
    }
  } catch (error) {
    console.error('Error fetching emails:', error)
    return defaultEmails(session)
  }
}

/**
 * Authoritative ownership check for `speaker.updateEmail`: the requested display
 * email must be verified-owned by the caller, because the display `email` is a
 * login match key in `getOrCreateSpeaker` — letting a caller set it to an
 * address they don't own would reopen the cross-provider account-takeover.
 *
 * An email is owned iff EITHER:
 *  - the caller signed in with GitHub and it's in their live GitHub-verified set
 *    (which will also seed `knownEmails` on their next login), OR
 *  - it's already in the caller's persisted `knownEmails` — the verified
 *    match-set written only from affirmatively-verified logins.
 *
 * This deliberately does NOT blanket-trust the non-GitHub session primary the
 * way {@link getVerifiedProfileEmails} does for the picker, keeping the guard
 * consistent with the login-path `email_verified` check. Comparison is
 * normalized (case/whitespace-insensitive).
 */
export async function isEmailVerifiedForSession(
  session: Session,
  email: string,
): Promise<boolean> {
  const requested = normalizeEmail(email)
  if (!requested) return false

  if (session.account?.provider === 'github') {
    const verified = await getVerifiedProfileEmails(session)
    if (verified.some((entry) => normalizeEmail(entry.email) === requested)) {
      return true
    }
  }

  const known = await getSpeakerKnownEmails(session.speaker?._id)
  return known.some((entry) => normalizeEmail(entry) === requested)
}
