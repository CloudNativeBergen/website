import { clientWrite, clientReadUncached } from '../sanity/client'
import { groq } from 'next-sanity'
import { uniqueEmails } from '../speaker/email'

export async function updateProfileEmail(
  email: string,
  speakerId: string,
): Promise<{ error: Error | null }> {
  try {
    // Preserve the match-set: adding/changing the display email must never drop
    // previously-known emails, otherwise a speaker could be split into a
    // duplicate on their next login via another provider.
    const existing = (await clientReadUncached.fetch(
      groq`*[_type == "speaker" && _id == $id][0]{ email, knownEmails }`,
      { id: speakerId },
    )) as { email?: string; knownEmails?: string[] } | null

    const knownEmails = uniqueEmails([
      ...(existing?.knownEmails || []),
      existing?.email,
      email,
    ])

    await clientWrite.patch(speakerId).set({ email, knownEmails }).commit()

    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}
