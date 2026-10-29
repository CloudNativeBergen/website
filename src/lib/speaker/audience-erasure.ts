import { clientReadUncached } from '@/lib/sanity/client'
import type { Conference } from '@/lib/conference/types'
import {
  getOrCreateConferenceAudienceByType,
  removeContactFromAudience,
} from '@/lib/email/audience'

/**
 * Takes a deleted speaker's address out of the speaker audience of every
 * conference of the org. A speaker sync keeps unsubscribed contacts while the
 * speaker still exists, so a deletion must remove them here instead.
 * Best effort: failures are logged and returned, never thrown.
 *
 * ponytail: resolving an audience creates it when a conference has none yet
 * (an empty audience, harmless); add a find-only resolver if that matters.
 */
export async function removeFromSpeakerAudiences(
  email: string,
  orgId: string,
): Promise<string[]> {
  const failures: string[] = []
  let conferences: Conference[] = []
  try {
    conferences =
      (await clientReadUncached.fetch<Conference[]>(
        `*[_type == "conference" && organization._ref == $orgId]{ _id, title, organization }`,
        { orgId },
      )) ?? []
  } catch (error) {
    console.warn('[speaker-erasure] listing conferences failed:', error)
    return ['*: could not list conferences']
  }
  for (const conference of conferences) {
    try {
      const { audienceId, client, error } =
        await getOrCreateConferenceAudienceByType(conference, 'speakers')
      if (!audienceId) throw error ?? new Error('no speaker audience')
      const removed = await removeContactFromAudience(client, audienceId, email)
      if (!removed.success) {
        throw removed.error ?? new Error(`could not remove ${email}`)
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.warn('[speaker-erasure] speaker audience removal failed:', {
        conferenceId: conference._id,
        reason,
      })
      failures.push(`${conference._id}: ${reason}`)
    }
  }
  return failures
}
