import { Session } from 'next-auth'
import { verifiedEmails as fetchGithubVerifiedEmails } from './github'
import { ProfileEmail } from './types'
import { normalizeEmail } from '../speaker/email'

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
 * - LinkedIn / other: the session primary. LinkedIn's primary was already gated
 *   through the affirmative `email_verified` check in the login path
 *   (`computeVerifiedEmails`) before the session was minted, so it is owned.
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
 * True when `email` is one the caller has provably verified with their login
 * provider. Used to authorize `speaker.updateEmail`: the requested display email
 * must be owned, because the display `email` is a login match key in
 * `getOrCreateSpeaker`. Comparison is normalized (case/whitespace-insensitive).
 */
export async function isEmailVerifiedForSession(
  session: Session,
  email: string,
): Promise<boolean> {
  const requested = normalizeEmail(email)
  if (!requested) return false
  const verified = await getVerifiedProfileEmails(session)
  return verified.some((entry) => normalizeEmail(entry.email) === requested)
}
