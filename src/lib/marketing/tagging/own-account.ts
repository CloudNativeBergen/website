/**
 * The request conference's own Bluesky account, which is never tagged
 * (tagging spec §4.1): a lower-cased handle, or a DID. SERVER-ONLY.
 */

import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ownBlueskyHandle } from './lookup'

export async function currentOwnBlueskyAccount(): Promise<string | null> {
  const { conference } = await getConferenceForCurrentDomain()
  return ownBlueskyHandle(conference?.socialLinks)
}
