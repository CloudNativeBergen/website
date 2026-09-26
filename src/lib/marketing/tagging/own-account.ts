/**
 * A conference's own Bluesky account, which is never tagged (tagging spec
 * §4.1): a lower-cased handle, or a DID. Read LIVE, not from the cached
 * conference loader: a `socialLinks` edit in the hosted Studio must reach
 * the save check at once. SERVER-ONLY.
 */

import { clientReadUncached } from '@/lib/sanity/client'
import { ownBlueskyHandle } from './lookup'

/** `conferenceId` is the request's own, already resolved or guarded. */
export async function ownBlueskyAccount(
  conferenceId: string,
): Promise<string | null> {
  // NOT through `scopedFetch`: it prepends `conference._ref == $conferenceId`,
  // which a conference document never satisfies.
  const links = await clientReadUncached.fetch<(string | null)[] | null>(
    // groq-global-scoped: by-id read of the conference the request resolved.
    `*[_type == "conference" && _id == $conferenceId][0].socialLinks`,
    { conferenceId },
    { cache: 'no-store' },
  )
  return ownBlueskyHandle(
    (links ?? []).filter((l): l is string => typeof l === 'string'),
  )
}
