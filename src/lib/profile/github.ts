import { Account } from 'next-auth'
import { ProfileEmail } from './types'

export async function verifiedEmails(
  account: Account,
): Promise<{ error: Error | null; emails: ProfileEmail[] }> {
  try {
    const token = account.access_token
    const emailsRes = await fetch('https://api.github.com/user/emails', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      // Sign-in waits on this call; a hung GitHub must not hang the login.
      signal: AbortSignal.timeout(5000),
    })

    if (!emailsRes.ok) {
      return {
        error: new Error(`Failed to fetch emails: ${emailsRes.status}`),
        emails: [],
      }
    }

    const emails = (await emailsRes.json()) as ProfileEmail[]
    return { error: null, emails: emails.filter((email) => email.verified) }
  } catch (error) {
    return { error: error as Error, emails: [] }
  }
}
